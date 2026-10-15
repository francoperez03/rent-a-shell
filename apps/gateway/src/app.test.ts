import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { loadConfig } from "./config.ts";
import { createApp } from "./app.ts";

// Fake ESP32 with the robot-a/SPEC.md §4.4 API; records what it receives.
const calls: string[] = [];
let angles: Record<string, number> = { base: 105, shoulder: 115, elbow: 90, grip: 150 };
const esp = http.createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  const b = body ? JSON.parse(body) : {};
  calls.push(`${req.method} ${req.url} ${body}`);
  res.setHeader("content-type", "application/json");
  if (req.url === "/state") return res.end(JSON.stringify({ ok: true, moving: false, rutina: null, angles }));
  if (req.url === "/joint") {
    angles = { ...angles, [b.joint]: b.angle };
    return res.end(JSON.stringify({ ok: true, joint: b.joint, angle: b.angle, clamped: false }));
  }
  if (req.url === "/dance") return res.end(JSON.stringify({ ok: true, duration_ms: 3000 }));
  if (req.url === "/stop") return res.end(JSON.stringify({ ok: true, angles }));
  res.statusCode = 404;
  res.end("{}");
});

let ctx: ReturnType<typeof createApp>;
const req = (path: string, init?: RequestInit) => ctx.app.request(path, init);
const json = (body: unknown, token?: string): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  await new Promise<void>((r) => esp.listen(0, r));
  const port = (esp.address() as AddressInfo).port;
  // spec 13: the price is the Forger's decision, so the tests set it instead of relying on a default
  const env = { RAILS: "fake", ESP32_URL: `http://localhost:${port}`, BLOCK_MINUTES: "0.005", BLOCK_USD: "1", REST_SECONDS: "0", DATA_FILE: "", FORGER_TOKEN: "forger-test" };
  ctx = createApp(loadConfig(env), env);
});
after(() => esp.close());

async function buy(blocks = 1) {
  const r = await req("/api/sessions/intent", json({ shell: "el-tucu", blocks, rail: "fake" }));
  assert.equal(r.status, 200);
  const v = await r.json();
  assert.equal(v.status, "pending");
  assert.equal(v.intent.meta, undefined, "rail meta is never exposed");
  await req(`/api/sessions/intent/${v.intent.id}`); // 1st check: not paid yet
  // the gateway allows 1 check every 3 s; force the second one
  const rec = ctx.sessions.intents.get(v.intent.id)!;
  rec.lastCheck = 0;
  const paid = await (await req(`/api/sessions/intent/${v.intent.id}`)).json();
  assert.equal(paid.status, "paid");
  return paid.session as { token: string; starts_at: number; expires_at: number };
}

test("spec sheet, rails and discovery", async () => {
  const shells = await (await req("/api/shells")).json();
  assert.equal(shells[0].id, "el-tucu");
  assert.deepEqual(shells[0].routines, ["robot", "lento", "saludo", "recta"]);
  const rails = await (await req("/api/rails")).json();
  assert.equal(rails[0].id, "fake");
  const llms = await (await req("/llms.txt")).text();
  assert.match(llms, /api\/sessions\/x402/);
  assert.match(llms, /Price: USD 1 per/);
  assert.match(llms, /Platform fee: 10 %/);
  const card = await (await req("/.well-known/agent.json")).json();
  assert.equal(card.name, "Rent a Shell");
});

test("no token, no motion", async () => {
  const r = await req("/api/cmd", json({ cmd: "stop" }));
  assert.equal(r.status, 401);
  const r2 = await req("/api/cmd", json({ cmd: "stop" }, "basura"));
  assert.equal(r2.status, 401);
});

test("pay, move, enforce allowlist, queue and cutoff to HOME", async () => {
  const s1 = await buy();
  assert.ok(s1.token);

  let r = await req("/api/cmd", json({ cmd: "joint", args: { joint: "base", angle: 120 } }, s1.token));
  assert.equal(r.status, 200);
  assert.equal(angles.base, 120);

  r = await req("/api/cmd", json({ cmd: "dance", args: { rutina: "rm -rf" } }, s1.token));
  assert.equal(r.status, 400);
  r = await req("/api/cmd", json({ cmd: "flash", args: {} }, s1.token));
  assert.equal(r.status, 400);
  r = await req("/api/cmd", json({ cmd: "joint", args: { joint: "cabeza", angle: 1 } }, s1.token));
  assert.equal(r.status, 400);

  // second purchase while s1 is active: it queues
  const s2 = await buy();
  assert.ok(s2.starts_at >= s1.expires_at);
  r = await req("/api/cmd", json({ cmd: "stop" }, s2.token));
  assert.equal(r.status, 403);

  const q = await (await req("/api/shells/el-tucu/queue")).json();
  assert.equal(q.waiting, 1);

  // s1 expires (0.3 s block): the clock ends it and returns to HOME
  await sleep(s1.expires_at - Date.now() + 20);
  calls.length = 0;
  await ctx.tick();
  assert.ok(calls.some((c) => c.startsWith("POST /stop")), "sends stop on expiry");
  assert.equal(angles.base, 105, "base vuelve a HOME");
  r = await req("/api/cmd", json({ cmd: "stop" }, s1.token));
  assert.equal(r.status, 403);
  r = await req("/api/cmd", json({ cmd: "stop" }, s2.token));
  assert.equal(r.status, 200, "the next queued session starts");

  r = await req("/api/sessions/end", json({}, s2.token));
  assert.equal(r.status, 200);
  r = await req("/api/cmd", json({ cmd: "stop" }, s2.token));
  assert.equal(r.status, 403);
});

test("rate limit of 10 commands per second, stop always goes through", async () => {
  const s = await buy();
  await sleep(Math.max(0, s.starts_at - Date.now()) + 5);
  const codes = [];
  for (let i = 0; i < 12; i++) codes.push((await req("/api/cmd", json({ cmd: "joint", args: { joint: "grip", angle: 60 } }, s.token))).status);
  assert.ok(codes.includes(429));
  assert.equal((await req("/api/cmd", json({ cmd: "stop" }, s.token))).status, 200);
  await req("/api/sessions/end", json({}, s.token));
});

test("x402: validates before charging, 402 without payment, session with payment", async () => {
  let r = await req("/api/sessions/x402?shell=el-tucu&blocks=99", { method: "POST" });
  assert.equal(r.status, 400, "does not charge an invalid request");
  r = await req("/api/sessions/x402?shell=el-tucu&blocks=2", { method: "POST" });
  assert.equal(r.status, 402);
  assert.equal((await r.json()).price.usd, "2");
  r = await req("/api/sessions/x402?shell=el-tucu&blocks=1", { method: "POST", headers: { "x-fake-pay": "1" } });
  assert.equal(r.status, 200);
  const g = await r.json();
  assert.ok(g.token && g.expires_at > g.starts_at);
});

test("x402 bound to an intent (spec 14): the paywall charges the intent, the gateway grants its blocks once", async () => {
  const { fakeRail } = await import("@ras/rails-core");
  // an x402 rail that works like the escrow one: intents carry the pay URL and the paywall requires ?intent=
  const base = fakeRail();
  const rail = {
    ...base,
    id: "fake",
    async createIntent(price: { usd: string }, o: { id: string; shell?: string; blocks?: number }) {
      return { ...(await base.createIntent!(price, o)), instructions: { kind: "x402" as const, url: `http://gw/api/sessions/x402?shell=${o.shell}&blocks=${o.blocks}&intent=${o.id}` } };
    },
    paywall: (_p: string, priceFor: (q: Record<string, string>) => { usd: string }) => async (c: import("hono").Context, next: () => Promise<void>) => {
      if (!c.req.query("intent")) return c.json({ error: "intent_required", create: "POST /api/sessions/intent" }, 402);
      if (c.req.header("x-fake-pay") !== "1") return c.json({ error: "payment_required", price: priceFor(c.req.query()) }, 402);
      c.set("payment" as never, { intentId: "rail-made-this-up", rail: "fake", payer: "agent", paidAt: Date.now() } as never);
      await next();
    },
  };
  const env = { RAILS: "fake", ESP32_URL: `http://localhost:${(esp.address() as AddressInfo).port}`, BLOCK_MINUTES: "1", BLOCK_USD: "1", REST_SECONDS: "0", DATA_FILE: "" };
  const a = createApp(loadConfig(env), env, { rails: [rail] });
  const r0 = await a.app.request("/api/sessions/x402?shell=el-tucu&blocks=2", { method: "POST", headers: { "x-fake-pay": "1" } });
  assert.equal(r0.status, 402, "no intent, no session");
  assert.equal((await r0.json()).error, "intent_required");
  const v = await (await a.app.request("/api/sessions/intent", json({ shell: "el-tucu", blocks: 2, rail: "fake" }))).json();
  const url = v.intent.instructions.url.replace("http://gw", "");
  assert.match(url, /&intent=/);
  assert.equal((await a.app.request(url.replace(v.intent.id, "nope"), { method: "POST", headers: { "x-fake-pay": "1" } })).status, 404, "unknown intent");
  assert.equal((await a.app.request(url.replace("blocks=2", "blocks=1"), { method: "POST", headers: { "x-fake-pay": "1" } })).status, 400, "blocks must match the intent");
  const g = await (await a.app.request(url, { method: "POST", headers: { "x-fake-pay": "1" } })).json();
  assert.ok(g.token);
  assert.equal(g.expires_at - g.starts_at, 2 * 60_000, "grants the intent's blocks");
  assert.equal(g.payment.intentId, v.intent.id, "Payment.intentId is the intent, whatever the rail said");
  const view = await (await a.app.request(`/api/sessions/intent/${v.intent.id}`)).json();
  assert.equal(view.status, "paid");
  assert.equal((await a.app.request(url, { method: "POST", headers: { "x-fake-pay": "1" } })).status, 409, "an intent pays once");
});

test("shell registry (spec 15): registers on start and shows the counters in the spec sheet, llms.txt and agent card", async () => {
  const { fakeRail } = await import("@ras/rails-core");
  const registered: string[] = [];
  const rail = {
    ...fakeRail(),
    registry: {
      async register(s: { id: string; pricing: { usd: string } }) {
        registered.push(`${s.id}@${s.pricing.usd}`);
      },
      async reputation(id: string) {
        return { completed: 7, refunded: 1, address: "PDA111", explorer: `https://solscan.io/account/PDA111?shell=${id}` };
      },
    },
  };
  const env = { RAILS: "fake", ESP32_URL: `http://localhost:${(esp.address() as AddressInfo).port}`, BLOCK_USD: "2", DATA_FILE: "" };
  const a = createApp(loadConfig(env), env, { rails: [rail] });
  await sleep(10); // registration is best effort in the background
  assert.deepEqual(registered, ["el-tucu@2"]);
  const sh = (await (await a.app.request("/api/shells")).json())[0];
  assert.deepEqual(sh.reputation, { completed: 7, refunded: 1, address: "PDA111", explorer: "https://solscan.io/account/PDA111?shell=el-tucu" });
  assert.match(await (await a.app.request("/llms.txt")).text(), /Reputation \(on-chain\): 7 completed, 1 refunded \(https:\/\/solscan/);
  assert.equal((await (await a.app.request("/.well-known/agent.json")).json()).reputation.completed, 7);
  assert.match(await (await req("/llms.txt")).text(), /Reputation \(on-chain\): not registered yet/, "without a registry rail");
});

test("MCP: lists tools and rent_shell returns how to pay", async () => {
  const rpc = (id: number, method: string, params: unknown) =>
    req("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
  await rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  const tools = await (await rpc(2, "tools/list", {})).json();
  const names = tools.result.tools.map((t: { name: string }) => t.name).sort();
  assert.deepEqual(names, ["end_session", "get_frame", "get_state", "list_shells", "rent_shell", "send_command"]);
  const rent = await (await rpc(3, "tools/call", { name: "rent_shell", arguments: { blocks: 2 } })).json();
  const body = JSON.parse(rent.result.content[0].text);
  assert.equal(body.price.usd, "2");
  assert.match(body.pay.url, /api\/sessions\/x402\?shell=el-tucu&blocks=2/);
});

test("customization requests: stored and readable only by the Forger", async () => {
  let r = await req("/api/shells/el-tucu/requests", json({ contact: "@team", message: "I need a distance sensor on the gripper" }));
  assert.equal(r.status, 201);
  r = await req("/api/shells/el-tucu/requests", json({ contact: "@team", message: "x".repeat(5000) }));
  assert.equal(r.status, 413);
  r = await req("/api/shells/el-tucu/requests", json({ contact: "", message: "short" }));
  assert.equal(r.status, 400);
  assert.equal((await req("/api/forger/requests")).status, 401);
  r = await req("/api/forger/requests", { headers: { authorization: "Bearer forger-test" } });
  const list = await r.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].contact, "@team");
});

test("on finish the rail closes the payment: completed on expiry, refund if the robot drops", async () => {
  const { fakeRail } = await import("@ras/rails-core");
  const calls: string[] = [];
  const rail = { ...fakeRail(), finalize: async (p: { intentId: string }, outcome: string) => void calls.push(outcome) };
  const down = http.createServer((_q, res) => res.destroy());
  await new Promise<void>((r) => down.listen(0, r));
  const env = { RAILS: "fake", ESP32_URL: `http://localhost:${(esp.address() as AddressInfo).port}`, BLOCK_MINUTES: "0.002", REST_SECONDS: "0", DATA_FILE: "", OFFLINE_REFUND_SECONDS: "0" };
  const a = createApp(loadConfig(env), env, { rails: [rail] });
  const pay = () => a.app.request("/api/sessions/x402?shell=el-tucu&blocks=1", { method: "POST", headers: { "x-fake-pay": "1" } });

  assert.equal((await pay()).status, 200);
  await sleep(200);
  await a.tick();
  assert.deepEqual(calls, ["completed"]);

  // robot down during an active session: it ends and gets refunded
  const b = createApp(loadConfig({ ...env, BLOCK_MINUTES: "1", ESP32_URL: `http://localhost:${(down.address() as AddressInfo).port}` }), env, { rails: [rail] });
  assert.equal((await b.app.request("/api/sessions/x402?shell=el-tucu&blocks=1", { method: "POST", headers: { "x-fake-pay": "1" } })).status, 200);
  for (let i = 0; i < 4; i++) await b.tick(); // 3 failures in a row = offline
  assert.deepEqual(calls, ["completed", "refund"]);
  down.close();
});
