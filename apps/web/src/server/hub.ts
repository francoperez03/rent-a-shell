// Marketplace hub: indexes the Forgers' gateways into a single catalog, served by the site itself.
// Each Forger runs its gateway next to its robot (its wallet, queue and payments); the hub only
// discovers, checks health and publishes the catalog for the website and for agents (API, llms.txt, MCP).
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
}

type Result = { status: number; body: object };

const env = () => ({
  seeds: (process.env.HUB_GATEWAYS ?? '').split(',').map(norm).filter(Boolean),
  adminToken: process.env.HUB_ADMIN_TOKEN || null,
  timeoutMs: Number(process.env.HUB_TIMEOUT_MS ?? 3000),
});

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

/** Open sign-up: the hub checks that the gateway answers with valid shells before listing it. */
export async function register(body: unknown): Promise<Result> {
  const b = (body ?? {}) as { gateway?: unknown };
  if (typeof b.gateway !== 'string' || !/^https?:\/\//.test(b.gateway)) return { status: 400, body: { error: 'invalid_gateway' } };
  const { timeoutMs } = env();
  const url = norm(b.gateway);
  let shells: Shell[];
  try {
    shells = await fetchShells(url, timeoutMs);
  } catch (e) {
    return { status: 422, body: { error: 'gateway_unreachable', message: (e as Error).message } };
  }
  // unique ids in the catalog: if another live gateway publishes the same id, conflict; if it is down
  // (e.g. the same Forger's quick tunnel changed URL), it gets replaced
  const known = await gateways();
  for (const g of known) {
    if (g.url === url || !g.shells.some((s) => shells.some((n) => n.id === s.id))) continue;
    const alive = await fetchShells(g.url, timeoutMs).then(() => true, () => false);
    if (alive) return { status: 409, body: { error: 'shell_id_taken', message: `${g.url} already publishes this id. Pick another SHELL_ID.` } };
    await store.del(g.url);
  }
  await store.set({ url, addedAt: known.find((g) => g.url === url)?.addedAt ?? Date.now(), online: true, lastSeen: Date.now(), shells });
  invalidate();
  return { status: 201, body: { ok: true, url, shells: shells.map((s) => s.id) } };
}

export async function remove(body: unknown, authorization: string | null | undefined): Promise<Result> {
  const { adminToken } = env();
  if (!adminToken || authorization !== `Bearer ${adminToken}`) return { status: 401, body: { error: 'unauthorized' } };
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
node rent.mjs cmd --joint grip --angle 175             # one command at a time; prints the real angle and peak mA
node rent.mjs frame --out after.jpg · node rent.mjs state · node rent.mjs end
\`\`\`
Skill for Claude Code: ${site}/skills/rent/SKILL.md
`;

/** What an agent reads when handed the site URL: intro, the live gateway line (rent.mjs parses it), quick start, the catalog. */
export async function llms(site: string): Promise<string> {
  const live = await catalog();
  const first = live.find((s) => s.status !== 'offline') ?? live[0];
  return `# Rent a Shell

> Real hardware by the minute. Each shell is built and maintained by a Forger, who runs their own gateway. Pick a shell, read its gateway's llms.txt and pay there (x402 in USDC on Solana).

Gateway: ${first?.gateway ?? '-'}
MCP: ${site}/mcp
Terms: ${site}/terms

${QUICK_START(site)}
## Shells

Each shell has its own price, set by its Forger. Platform fee: 10 % of each session, taken when the escrow settles; the rest goes to the Forger. Gateways with escrow bind each x402 payment to an intent (POST <gateway>/api/sessions/intent first): their llms.txt has the steps.

${live.length ? live.map((s) => `- ${s.name} (${s.id}), ${s.kind}, ${s.location}, ${s.status}. USD ${s.pricing.usd} per ${s.pricing.block_minutes} min. Sensors: ${(s.sensors ?? []).join(', ') || 'angles'}. Forger: ${s.forger?.name ?? '?'}.${s.reputation ? ` Reputation (on-chain): ${s.reputation.completed} completed, ${s.reputation.refunded} refunded (${s.reputation.explorer}).` : ''} Gateway: ${s.gateway} · instructions ${s.gateway}/llms.txt · payment POST ${s.gateway}/api/sessions/x402?shell=${s.id}&blocks=1`).join('\n') : '- No shells registered yet.'}

## Other entry points

- Catalog JSON: ${site}/api/catalog
- MCP (Streamable HTTP): ${site}/mcp, tools list_shells and get_shell
- Add your hardware as a Forger: POST ${site}/api/forgers {"gateway":"https://your-gateway"}
- Claude Code skill to rent and test code on real hardware:
  npx skills add francoperez03/rent-a-shell --skill rent-a-shell (or read ${site}/skills/rent/SKILL.md)
- Claude Code skill for Forgers (installs and configures the gateway, camera and tunnel):
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

// Claude Code skills (skills/ folder in the repo): forger = publish hardware, rent = rent it.
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
