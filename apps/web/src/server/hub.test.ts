import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// Two fake Forger gateways that answer /api/shells.
const shell = (id: string) => ({ id, name: id, kind: 'arm-4dof', location: 'AR', status: 'online', joints: {}, pricing: { usd: '1.00', block_minutes: 5 }, sensors: ['angles'], forger: { name: 'F', customizations: false } });
const servers: http.Server[] = [];
const urls: string[] = [];
async function fakeGateway(id: string) {
  const s = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.url === '/api/shells' ? [shell(id)] : {}));
  });
  await new Promise<void>((r) => s.listen(0, r));
  servers.push(s);
  return `http://localhost:${(s.address() as AddressInfo).port}`;
}

let hub: typeof import('./hub.ts');
before(async () => {
  urls.push(await fakeGateway('tucu-a'), await fakeGateway('tucu-b'));
  process.env.HUB_GATEWAYS = `${urls[0]},http://localhost:1`;
  process.env.HUB_TIMEOUT_MS = '500';
  process.env.HUB_ADMIN_TOKEN = 'adm';
  hub = await import('./hub.ts'); // no Redis env: in-memory store
});
after(() => servers.forEach((s) => s.close()));
let token = '';
let other = '';
const post = (gateway: string, t = token) => hub.register({ gateway }, `Bearer ${t}`);

test('tokens: issued by the admin, required to register', async () => {
  assert.equal((await hub.issueToken({ label: 'x' }, undefined)).status, 401);
  const a = await hub.issueToken({ label: 'Franco' }, 'Bearer adm');
  assert.equal(a.status, 201);
  token = (a.body as { token: string }).token;
  other = ((await hub.issueToken({ label: 'Someone else' }, 'Bearer adm')).body as { token: string }).token;
  assert.equal((await hub.register({ gateway: urls[1] })).status, 401);
  assert.equal((await hub.register({ gateway: urls[1] }, 'Bearer rsf_nope')).status, 401);
  const list = (await hub.listTokens('Bearer adm')).body as { label: string; token: string }[];
  assert.deepEqual(list.map((t) => t.label).sort(), ['Franco', 'Someone else']);
  assert.ok(!list.some((t) => t.token === token)); // masked
});

test('aggregates gateways, marks the dead one offline and registers a new one', async () => {
  await hub.refresh();
  let cat = await hub.catalog();
  assert.deepEqual(cat.map((s) => s.id), ['tucu-a']);
  assert.equal(cat[0].gateway, urls[0]);
  const forgers = await hub.forgers();
  assert.equal(forgers.find((f) => f.url === 'http://localhost:1')?.online, false);

  assert.equal((await post(urls[1])).status, 201);
  assert.equal((await post('http://localhost:1')).status, 422);
  cat = await hub.catalog();
  assert.equal(cat.length, 2);

  // same id from another owner: conflict, alive or not (no hijacking while a tunnel changes URL);
  // the same owner's new URL replaces its old one once that one drops
  const dup = await fakeGateway('tucu-b');
  assert.equal((await post(dup, other)).status, 409);
  servers[1].close();
  assert.equal((await post(dup, other)).status, 409);
  assert.equal((await post(dup)).status, 201);
  cat = await hub.catalog();
  assert.equal(cat.find((s) => s.id === 'tucu-b')?.gateway, dup);
  // a gateway URL registered by one token cannot be re-registered by another
  assert.equal((await post(dup, other)).status, 409);
  // at most three gateways per token
  const extra = [await fakeGateway('tucu-c'), await fakeGateway('tucu-d'), await fakeGateway('tucu-e')];
  assert.equal((await post(extra[0])).status, 201); // dup, tucu-c
  assert.equal((await post(extra[1])).status, 201); // dup, tucu-c, tucu-d
  assert.equal((await post(extra[2])).status, 429);
  assert.equal((await hub.register({ gateway: 'ftp://x' }, `Bearer ${token}`)).status, 400);

  const llms = await hub.llms('http://site');
  assert.match(llms, /tucu-b/);
  assert.match(llms, /api\/sessions\/x402\?shell=tucu-b/);
  assert.match(llms, /^Gateway: http:\/\/localhost/m); // rent.mjs parses this line
  assert.match(llms, /http:\/\/site\/skills\/rent\/rent\.mjs/);
  const card = await hub.agentCard('http://site');
  assert.equal(card.services.find((s) => s.name === 'MCP')?.endpoint, 'http://site/mcp');
  assert.equal(card.shells.length, 4); // tucu-a, tucu-b, tucu-c, tucu-d

  // removal needs the admin token; when a gateway goes down its shell shows offline
  assert.equal((await hub.remove({ gateway: urls[1] }, undefined)).status, 401);
  assert.equal((await hub.remove({ gateway: urls[1] }, 'Bearer adm')).status, 200);
  // revoking a token drops its gateways
  assert.equal((await hub.revokeToken({ token: other }, 'Bearer adm')).status, 200);
  assert.equal((await post(extra[2], other)).status, 401);
  servers[0].close();
  await hub.refresh();
  cat = await hub.catalog();
  assert.equal(cat.find((s) => s.id === 'tucu-a')?.status, 'offline');
  assert.equal(cat.find((s) => s.id === 'tucu-b')?.gateway, dup);
});

test('catalog MCP lists shells', async () => {
  const r = await hub.mcp(
    new Request('http://site/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }),
  );
  const j = await r.json();
  assert.deepEqual(j.result.tools.map((t: { name: string }) => t.name).sort(), ['get_shell', 'list_shells']);
});

test('serves the skills and the client, nothing else', async () => {
  assert.match(hub.skillFile('forger', 'SKILL.md')!.body, /^---\nname: rent-a-shell-forger/);
  assert.match(hub.skillFile('rent', 'SKILL.md')!.body, /^---\nname: rent-a-shell\n/);
  const client = hub.skillFile('rent', 'rent.mjs')!;
  assert.match(client.body, /x402/);
  assert.equal(client.type, 'text/javascript; charset=utf-8');
  assert.equal(hub.skillFile('rent', '../../package.json'), null);
  assert.equal(hub.skillFile('forger', 'rent.mjs'), null);
});
