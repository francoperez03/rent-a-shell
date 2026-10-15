// Marketplace hub: indexes the Forgers' gateways into a single catalog, served by the site itself.
// Each Forger runs its gateway next to its robot (its wallet, queue and payments); the hub only
// discovers, checks health and publishes the catalog for the website and for agents (API, llms.txt, MCP).
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import type { Shell } from '@ras/shell-spec';
import { store } from './store';

export interface GatewayEntry {
  url: string;
  addedAt: number;
  online: boolean;
  lastSeen: number | null;
  shells: Shell[];
  /** The Forger token that registered it. Entries from before tokens have none and can be claimed. */
  owner?: string;
}

/** A Forger token: issued by the admin, required to register a gateway. */
export interface TokenEntry {
  label: string;
  createdAt: number;
}

const MAX_GATEWAYS_PER_TOKEN = 3;

type Result = { status: number; body: object };

const env = () => ({
  seeds: (process.env.HUB_GATEWAYS ?? '').split(',').map(norm).filter(Boolean),
  adminToken: process.env.HUB_ADMIN_TOKEN || null,
  timeoutMs: Number(process.env.HUB_TIMEOUT_MS ?? 3000),
  // production only lists public https gateways; locally (and in tests) http://localhost is fine
  strict: process.env.NODE_ENV === 'production',
});

const isAdmin = (authorization: string | null | undefined) => {
  const { adminToken } = env();
  return !!adminToken && authorization === `Bearer ${adminToken}`;
};

const bearer = (authorization: string | null | undefined) => authorization?.match(/^Bearer (\S+)$/)?.[1] ?? null;

/** Only public gateways reach the catalog: no loopback, no private ranges, https in production. */
function isPublicGateway(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  if (!env().strict) return u.protocol === 'http:' || u.protocol === 'https:';
  if (u.protocol !== 'https:') return false;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) return false;
  }
  if (host.includes(':')) return false; // ipv6 literals
  return true;
}

const norm = (u: string) => u.trim().replace(/\/$/, '');

/** Validates the minimum the website and agents need from each shell. */
function isShell(s: unknown): s is Shell {
  const v = s as Shell;
  return Boolean(v && typeof v.id === 'string' && typeof v.name === 'string' && v.pricing && typeof v.pricing.usd === 'string' && v.joints);
}

async function fetchShells(url: string, timeoutMs: number): Promise<Shell[]> {
  const r = await fetch(`${url}/api/shells`, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const list = (await r.json()) as unknown[];
  if (!Array.isArray(list) || !list.every(isShell)) throw new Error('response is not a list of shells');
  // ponytail: the Forger gateway sets its own URL; if missing, the registered one is used
  return list.map((s) => ({ ...s, gateway: s.gateway || url }));
}

/** Stored gateways plus the HUB_GATEWAYS seeds (seeds are persisted once they answer). */
async function gateways(): Promise<GatewayEntry[]> {
  const list = await store.all();
  for (const u of env().seeds) {
    if (!list.some((g) => g.url === u)) list.push({ url: u, addedAt: Date.now(), online: false, lastSeen: null, shells: [] });
  }
  return list;
}

// ponytail: per-instance cache with a 30 s TTL; the store is the source of truth
const TTL_MS = 30_000;
let cache: { at: number; entries: GatewayEntry[] } | null = null;
let inflight: Promise<GatewayEntry[]> | null = null;

export const invalidate = () => { cache = null; };

/** Re-fetches every gateway; an unreachable one keeps its last known spec sheet and shows as offline. */
export async function refresh(): Promise<GatewayEntry[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    const { timeoutMs } = env();
    const entries = await Promise.all(
      (await gateways()).map(async (g) => {
        const next = { ...g };
        try {
          next.shells = await fetchShells(g.url, timeoutMs);
          next.online = true;
          next.lastSeen = Date.now();
        } catch {
          next.online = false;
        }
        // lastSeen alone is not worth a write: persist only when the status or the spec sheet changed
        if (next.online !== g.online || JSON.stringify(next.shells) !== JSON.stringify(g.shells)) await store.set(next);
        return next;
      }),
    );
    cache = { at: Date.now(), entries };
    return entries;
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Fresh cache: return it. Stale: return it and refresh in the background. Empty: wait for a refresh. */
async function entries(): Promise<GatewayEntry[]> {
  if (!cache) return refresh();
  if (Date.now() - cache.at > TTL_MS) void refresh().catch(() => {});
  return cache.entries;
}

/** Flat catalog: every shell with its gateway and the gateway status. */
export async function catalog(): Promise<Shell[]> {
  return (await entries()).flatMap((g) =>
    g.shells.map((s) => ({ ...s, status: g.online ? s.status : ('offline' as const), gateway: s.gateway || g.url })),
  );
}

export async function forgers() {
  return (await entries()).map(({ url, online, lastSeen, shells }) => ({ url, online, lastSeen, shells: shells.map((s) => s.id) }));
}

/**
 * Sign-up with a Forger token (issued by the admin). The hub checks that the gateway answers with valid
 * shells before listing it; a shell id belongs to the token that registered it.
 */
export async function register(body: unknown, authorization?: string | null): Promise<Result> {
  const token = bearer(authorization);
  if (!token) return { status: 401, body: { error: 'token_required', message: 'Ask for a Forger token and send it as Authorization: Bearer <token>.' } };
  if (!(token in (await store.tokens()))) return { status: 401, body: { error: 'invalid_token' } };
  const b = (body ?? {}) as { gateway?: unknown };
  if (typeof b.gateway !== 'string' || !isPublicGateway(b.gateway)) return { status: 400, body: { error: 'invalid_gateway', message: 'A public https URL is required.' } };
  const { timeoutMs } = env();
  const url = norm(b.gateway);
  const known = await gateways();
  const mine = known.filter((g) => g.owner === token && g.url !== url);
  if (mine.length >= MAX_GATEWAYS_PER_TOKEN) return { status: 429, body: { error: 'too_many_gateways', message: `This token already has ${MAX_GATEWAYS_PER_TOKEN} gateways.` } };
  let shells: Shell[];
  try {
    shells = await fetchShells(url, timeoutMs);
  } catch (e) {
    return { status: 422, body: { error: 'gateway_unreachable', message: (e as Error).message } };
  }
  // unique ids in the catalog: another owner's shell id is a conflict even if that gateway is down (no hijacking
  // while a quick tunnel changes URL); the same owner's old URL, or an entry from before tokens, gets replaced
  for (const g of known) {
    if (g.url === url || !g.shells.some((s) => shells.some((n) => n.id === s.id))) continue;
    if (g.owner && g.owner !== token) return { status: 409, body: { error: 'shell_id_taken', message: `${g.url} already publishes this id. Pick another SHELL_ID.` } };
    await store.del(g.url);
  }
  const existing = known.find((g) => g.url === url);
  if (existing?.owner && existing.owner !== token) return { status: 409, body: { error: 'gateway_taken', message: 'This gateway URL was registered with another token.' } };
  await store.set({ url, addedAt: existing?.addedAt ?? Date.now(), online: true, lastSeen: Date.now(), shells, owner: token });
  invalidate();
  return { status: 201, body: { ok: true, url, shells: shells.map((s) => s.id) } };
}

/** Forger tokens: the admin issues one per Forger (label = who), lists them masked, revokes them. */
export async function issueToken(body: unknown, authorization?: string | null): Promise<Result> {
  if (!isAdmin(authorization)) return { status: 401, body: { error: 'unauthorized' } };
  const label = String((body as { label?: unknown })?.label ?? '').trim();
  if (!label) return { status: 400, body: { error: 'label_required' } };
  const token = `rsf_${randomBytes(18).toString('hex')}`;
  await store.setToken(token, { label, createdAt: Date.now() });
  return { status: 201, body: { ok: true, token, label } };
}

export async function listTokens(authorization?: string | null): Promise<Result> {
  if (!isAdmin(authorization)) return { status: 401, body: { error: 'unauthorized' } };
  const [tokens, known] = await Promise.all([store.tokens(), gateways()]);
  const list = Object.entries(tokens).map(([t, e]) => ({ token: `${t.slice(0, 8)}…${t.slice(-4)}`, label: e.label, createdAt: e.createdAt, gateways: known.filter((g) => g.owner === t).map((g) => g.url) }));
  return { status: 200, body: list };
}

export async function revokeToken(body: unknown, authorization?: string | null): Promise<Result> {
  if (!isAdmin(authorization)) return { status: 401, body: { error: 'unauthorized' } };
  const token = String((body as { token?: unknown })?.token ?? '');
  const ok = await store.delToken(token);
  // its gateways go with it
  for (const g of await store.all()) if (g.owner === token) await store.del(g.url);
  invalidate();
  return { status: 200, body: { ok } };
}

export async function remove(body: unknown, authorization: string | null | undefined): Promise<Result> {
  if (!isAdmin(authorization)) return { status: 401, body: { error: 'unauthorized' } };
  const b = (body ?? {}) as { gateway?: string };
  const ok = await store.del(norm(b.gateway ?? ''));
  invalidate();
  return { status: 200, body: { ok } };
}

const QUICK_START = (site: string) => `## Quick start for agents (interactive session)

\`\`\`bash
mkdir -p ~/.rent-a-shell && cd ~/.rent-a-shell
curl -fsSL ${site}/skills/rent/rent.mjs -o rent.mjs
echo '{"private":true}' > package.json && npm i @x402/fetch@2.27.0 @x402/core@2.27.0 @x402/svm@2.27.0 @solana/kit@^6
node rent.mjs wallet                                   # agent wallet; fund it with USDC on the shell's network (devnet: faucet.circle.com), no SOL needed
node rent.mjs info --gateway ${site}             # spec, price, queue (show the price and ask the person before paying)
node rent.mjs rent --gateway ${site} --blocks 1 --max-usd 0.05
node rent.mjs cmd --joint grip --angle 175             # one command at a time; prints the real angle
node rent.mjs frame --out after.jpg · node rent.mjs state · node rent.mjs end
\`\`\`
Agent skill (any agent that reads SKILL.md): ${site}/skills/rent/SKILL.md
`;

/** What an agent reads when handed the site URL: intro, the live gateway line (rent.mjs parses it), quick start, the catalog. */
export async function llms(site: string): Promise<string> {
  const live = await catalog();
  const first = live.find((s) => s.status !== 'offline') ?? live[0];
  return `# Rent a Shell

> Real hardware by the minute. Each shell is built and maintained by a Forger, who runs their own gateway. Pick a shell, read its gateway's llms.txt and pay there (x402 in USDC on Solana devnet; test money for now).

Gateway: ${first?.gateway ?? '-'}
MCP: ${site}/mcp
Terms: ${site}/terms

${QUICK_START(site)}
## Shells

Each shell's price is set by its Forger. Payments are USDC on Solana devnet. Escrow (refunds, and a 10 % platform fee on settle) is built and not live yet; the gateway's llms.txt has the current steps.

${live.length ? live.map((s) => `- ${s.name} (${s.id}), ${s.kind}, ${s.location}, ${s.status}. USD ${s.pricing.usd} per ${s.pricing.block_minutes} min. Sensors: ${(s.sensors ?? []).join(', ') || 'angles'}. Forger: ${s.forger?.name ?? '?'}.${s.reputation ? ` Reputation (on-chain): ${s.reputation.completed} completed, ${s.reputation.refunded} refunded (${s.reputation.explorer}).` : ''} Gateway: ${s.gateway} · instructions ${s.gateway}/llms.txt · payment POST ${s.gateway}/api/sessions/x402?shell=${s.id}&blocks=1${s.image ? ` · photo ${s.image}` : ''}`).join('\n') : '- No shells registered yet.'}

## Other entry points

- Catalog JSON: ${site}/api/catalog
- MCP (Streamable HTTP): ${site}/mcp, tools list_shells and get_shell
- Add your hardware as a Forger: ask for a Forger token, then POST ${site}/api/forgers with Authorization: Bearer <token> and {"gateway":"https://your-gateway"}
- Agent skill to rent and test code on real hardware:
  npx skills add francoperez03/rent-a-shell --skill rent-a-shell (or read ${site}/skills/rent/SKILL.md)
- Agent skill for Forgers (installs and configures the gateway, camera and tunnel):
  npx skills add francoperez03/rent-a-shell --skill rent-a-shell-forger (or read ${site}/skills/forger/SKILL.md)
`;
}

/** Site-level agent card: where the catalog and the MCP live, and each shell's gateway. */
export async function agentCard(site: string) {
  const live = await catalog();
  return {
    name: 'Rent a Shell',
    description: 'Time-based rental of real robot bodies for agents and humans. Each shell is published by a Forger who runs its gateway: pay and control there.',
    image: `${site}/og.png`,
    services: [
      { name: 'web', endpoint: site },
      { name: 'catalog', endpoint: `${site}/api/catalog` },
      { name: 'MCP', endpoint: `${site}/mcp`, version: '2025-06-18' },
      { name: 'llms.txt', endpoint: `${site}/llms.txt` },
    ],
    active: true,
    shells: live.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      gateway: s.gateway,
      pricing: s.pricing,
      ...(s.reputation && { reputation: s.reputation }),
      llms: `${s.gateway}/llms.txt`,
      x402: `${s.gateway}/api/sessions/x402?shell=${s.id}&blocks=1`,
      mcp: `${s.gateway}/mcp`,
    })),
  };
}

/** Stateless MCP: a server per request over the web-standard Streamable HTTP transport. */
export async function mcp(req: Request): Promise<Response> {
  const s = new McpServer({ name: 'rent-a-shell-hub', version: '0.1.0' });
  const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] });
  s.registerTool('list_shells', { description: 'Full catalog of rentable real hardware: shells, Forger, sensors, price and the gateway where you pay.' }, async () => text(await catalog()));
  s.registerTool(
    'get_shell',
    { description: "A shell's spec sheet and how to rent it (gateway, llms.txt and x402 endpoint).", inputSchema: { id: z.string() } },
    async ({ id }) => {
      const sh = (await catalog()).find((x) => x.id === id);
      if (!sh) return { ...text({ error: 'unknown_shell' }), isError: true };
      return text({ ...sh, how_to_rent: { llms: `${sh.gateway}/llms.txt`, x402: `${sh.gateway}/api/sessions/x402?shell=${sh.id}&blocks=1`, mcp: `${sh.gateway}/mcp` } });
    },
  );
  const t = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await s.connect(t);
  return t.handleRequest(req);
}

// Agent skills (skills/ folder in the repo): forger = publish hardware, rent = rent it.
const SKILLS: Record<string, { dir: string; files: Record<string, string> }> = {
  forger: { dir: 'rent-a-shell-forger', files: { 'SKILL.md': 'text/markdown; charset=utf-8' } },
  rent: { dir: 'rent-a-shell', files: { 'SKILL.md': 'text/markdown; charset=utf-8', 'rent.mjs': 'text/javascript; charset=utf-8' } },
};

/** Allowlisted skill file, or null. cwd is apps/web locally and on Vercel; the files ship via outputFileTracingIncludes. */
export function skillFile(name: string, file: string): { body: string; type: string } | null {
  const sk = SKILLS[name];
  const type = sk?.files[file];
  if (!sk || !type) return null;
  try {
    return { body: readFileSync(path.join(process.cwd(), '../../skills', sk.dir, file), 'utf8'), type };
  } catch {
    return null;
  }
}
