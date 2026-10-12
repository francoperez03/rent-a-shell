import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createHub } from "./hub.ts";

// Dos gateways de Forgers falsos que responden /api/shells.
const shell = (id: string) => ({ id, name: id, kind: "arm-4dof", location: "AR", status: "online", joints: {}, pricing: { usd: "1.00", block_minutes: 5 }, sensors: ["angles"], forger: { name: "F", customizations: false } });
const servers: http.Server[] = [];
const urls: string[] = [];
async function fakeGateway(id: string) {
  const s = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(req.url === "/api/shells" ? [shell(id)] : {}));
  });
  await new Promise<void>((r) => s.listen(0, r));
  servers.push(s);
  return `http://localhost:${(s.address() as AddressInfo).port}`;
}

let hub: ReturnType<typeof createHub>;
before(async () => {
  urls.push(await fakeGateway("tucu-a"), await fakeGateway("tucu-b"));
  hub = createHub({ HUB_GATEWAYS: `${urls[0]},http://localhost:1`, HUB_DATA_FILE: "", HUB_TIMEOUT_MS: "500", HUB_ADMIN_TOKEN: "adm" });
});
after(() => servers.forEach((s) => s.close()));
const req = (p: string, init?: RequestInit) => hub.app.request(p, init);

test("agrega gateways, marca offline el caído y registra uno nuevo", async () => {
  await hub.poll();
  let cat = await (await req("/api/catalog")).json();
  assert.deepEqual(cat.map((s: { id: string }) => s.id), ["tucu-a"]);
  assert.equal(cat[0].gateway, urls[0]);
  const forgers = await (await req("/api/forgers")).json();
  assert.equal(forgers.find((f: { url: string }) => f.url === "http://localhost:1").online, false);

  let r = await req("/api/forgers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gateway: urls[1] }) });
  assert.equal(r.status, 201);
  r = await req("/api/forgers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gateway: "http://localhost:1" }) });
  assert.equal(r.status, 422);
  cat = await (await req("/api/catalog")).json();
  assert.equal(cat.length, 2);

  const llms = await (await req("/llms.txt")).text();
  assert.match(llms, /tucu-b/);
  assert.match(llms, new RegExp(`${urls[1]}/api/sessions/x402\\?shell=tucu-b`));

  // baja solo con token de admin; al apagar un gateway su shell queda offline
  assert.equal((await req("/api/forgers", { method: "DELETE", body: JSON.stringify({ gateway: urls[1] }) })).status, 401);
  servers[0].close();
  await hub.poll();
  cat = await (await req("/api/catalog")).json();
  assert.equal(cat.find((s: { id: string }) => s.id === "tucu-a").status, "offline");
});

test("MCP del catálogo lista shells", async () => {
  const r = await req("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  const j = await r.json();
  assert.deepEqual(j.result.tools.map((t: { name: string }) => t.name).sort(), ["get_shell", "list_shells"]);
});

test("sirve la skill de Forger", async () => {
  const r = await req("/skills/forger/SKILL.md");
  assert.equal(r.status, 200);
  assert.match(await r.text(), /^---\nname: rent-a-shell-forger/);
});
