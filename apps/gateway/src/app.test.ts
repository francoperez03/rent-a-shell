import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { loadConfig } from "./config.ts";
import { createApp } from "./app.ts";

// ESP32 falso con la API de robot-a/SPEC.md §4.4; registra lo que recibe.
const calls: string[] = [];
let angles: Record<string, number> = { base: 90, shoulder: 90, elbow: 90, grip: 70 };
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
  const env = { RAILS: "fake", ESP32_URL: `http://localhost:${port}`, BLOCK_MINUTES: "0.005", REST_SECONDS: "0", DATA_FILE: "", FORGER_TOKEN: "forger-test" };
  ctx = createApp(loadConfig(env), env);
});
after(() => esp.close());

async function buy(blocks = 1) {
  const r = await req("/api/sessions/intent", json({ shell: "el-tucu", blocks, rail: "fake" }));
  assert.equal(r.status, 200);
  const v = await r.json();
  assert.equal(v.status, "pending");
  assert.equal(v.intent.meta, undefined, "meta del riel no se expone");
  await req(`/api/sessions/intent/${v.intent.id}`); // 1er check: no pagó
  // el gateway limita checks a 1 cada 3 s; forzamos el segundo
  const rec = ctx.sessions.intents.get(v.intent.id)!;
  rec.lastCheck = 0;
  const paid = await (await req(`/api/sessions/intent/${v.intent.id}`)).json();
  assert.equal(paid.status, "paid");
  return paid.session as { token: string; starts_at: number; expires_at: number };
}

test("ficha, rieles y descubrimiento", async () => {
  const shells = await (await req("/api/shells")).json();
  assert.equal(shells[0].id, "el-tucu");
  assert.deepEqual(shells[0].routines, ["robot", "lento", "saludo", "recta"]);
  const rails = await (await req("/api/rails")).json();
  assert.equal(rails[0].id, "fake");
  assert.match(await (await req("/llms.txt")).text(), /api\/sessions\/x402/);
  const card = await (await req("/.well-known/agent.json")).json();
  assert.equal(card.name, "Rent a Shell");
});

test("sin token no se mueve", async () => {
  const r = await req("/api/cmd", json({ cmd: "stop" }));
  assert.equal(r.status, 401);
  const r2 = await req("/api/cmd", json({ cmd: "stop" }, "basura"));
  assert.equal(r2.status, 401);
});

test("pagar, mover, validar allowlist, cola y corte a HOME", async () => {
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

  // segunda compra mientras s1 está activa: queda en cola
  const s2 = await buy();
  assert.ok(s2.starts_at >= s1.expires_at);
  r = await req("/api/cmd", json({ cmd: "stop" }, s2.token));
  assert.equal(r.status, 403);

  const q = await (await req("/api/shells/el-tucu/queue")).json();
  assert.equal(q.waiting, 1);

  // vence s1 (bloque de 0.3 s): el reloj corta y vuelve a HOME
  await sleep(s1.expires_at - Date.now() + 20);
  calls.length = 0;
  await ctx.tick();
  assert.ok(calls.some((c) => c.startsWith("POST /stop")), "manda stop al vencer");
  assert.equal(angles.base, 90, "base vuelve a HOME");
  r = await req("/api/cmd", json({ cmd: "stop" }, s1.token));
  assert.equal(r.status, 403);
  r = await req("/api/cmd", json({ cmd: "stop" }, s2.token));
  assert.equal(r.status, 200, "arranca la siguiente de la cola");

  r = await req("/api/sessions/end", json({}, s2.token));
  assert.equal(r.status, 200);
  r = await req("/api/cmd", json({ cmd: "stop" }, s2.token));
  assert.equal(r.status, 403);
});

test("rate limit de 10 comandos por segundo, stop siempre pasa", async () => {
  const s = await buy();
  await sleep(Math.max(0, s.starts_at - Date.now()) + 5);
  const codes = [];
  for (let i = 0; i < 12; i++) codes.push((await req("/api/cmd", json({ cmd: "joint", args: { joint: "grip", angle: 60 } }, s.token))).status);
  assert.ok(codes.includes(429));
  assert.equal((await req("/api/cmd", json({ cmd: "stop" }, s.token))).status, 200);
  await req("/api/sessions/end", json({}, s.token));
});

test("x402: valida antes de cobrar, 402 sin pago, sesión con pago", async () => {
  let r = await req("/api/sessions/x402?shell=el-tucu&blocks=99", { method: "POST" });
  assert.equal(r.status, 400, "no cobra un pedido inválido");
  r = await req("/api/sessions/x402?shell=el-tucu&blocks=2", { method: "POST" });
  assert.equal(r.status, 402);
  assert.equal((await r.json()).price.usd, "2");
  r = await req("/api/sessions/x402?shell=el-tucu&blocks=1", { method: "POST", headers: { "x-fake-pay": "1" } });
  assert.equal(r.status, 200);
  const g = await r.json();
  assert.ok(g.token && g.expires_at > g.starts_at);
});

test("MCP: lista tools y rent_shell devuelve cómo pagar", async () => {
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

test("pedidos de personalización: se guardan y solo el Forger los lee", async () => {
  let r = await req("/api/shells/el-tucu/requests", json({ contact: "@equipo", message: "Necesito un sensor de distancia en la pinza" }));
  assert.equal(r.status, 201);
  r = await req("/api/shells/el-tucu/requests", json({ contact: "@equipo", message: "x".repeat(5000) }));
  assert.equal(r.status, 413);
  r = await req("/api/shells/el-tucu/requests", json({ contact: "", message: "corto" }));
  assert.equal(r.status, 400);
  assert.equal((await req("/api/forger/requests")).status, 401);
  r = await req("/api/forger/requests", { headers: { authorization: "Bearer forger-test" } });
  const list = await r.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].contact, "@equipo");
});
