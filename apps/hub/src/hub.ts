// Marketplace hub: indexes the Forgers' gateways into a single catalog.
// Each Forger runs its gateway next to its robot (its wallet, queue and payments); the hub only
// discovers, checks health and publishes the catalog for the website and for agents (API, llms.txt, MCP).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { Shell } from "@ras/shell-spec";

type Env = Record<string, string | undefined>;

export interface GatewayEntry {
  url: string;
  addedAt: number;
  online: boolean;
  lastSeen: number | null;
  shells: Shell[];
}

const norm = (u: string) => u.trim().replace(/\/$/, "");

/** Validates the minimum the website and agents need from each shell. */
function isShell(s: unknown): s is Shell {
  const v = s as Shell;
  return Boolean(v && typeof v.id === "string" && typeof v.name === "string" && v.pricing && typeof v.pricing.usd === "string" && v.joints);
}

async function fetchShells(url: string, timeoutMs: number): Promise<Shell[]> {
  const r = await fetch(`${url}/api/shells`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const list = (await r.json()) as unknown[];
  if (!Array.isArray(list) || !list.every(isShell)) throw new Error("response is not a list of shells");
  // ponytail: the Forger gateway sets its own URL; if missing, the registered one is used
  return list.map((s) => ({ ...s, gateway: s.gateway || url }));
}

export function createHub(env: Env) {
  const publicUrl = norm(env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 8790}`);
  const dataFile = env.HUB_DATA_FILE === "" ? null : (env.HUB_DATA_FILE ?? "data/hub.json");
  const adminToken = env.HUB_ADMIN_TOKEN || null;
  const timeoutMs = Number(env.HUB_TIMEOUT_MS ?? 3000);
  const gateways = new Map<string, GatewayEntry>();

  const save = () => {
    if (!dataFile) return;
    mkdirSync(dirname(dataFile), { recursive: true });
    writeFileSync(dataFile, JSON.stringify([...gateways.values()], null, 2));
  };
  if (dataFile) {
    try {
      for (const g of JSON.parse(readFileSync(dataFile, "utf8")) as GatewayEntry[]) gateways.set(g.url, g);
    } catch {
      /* primer arranque */
    }
  }
  for (const u of (env.HUB_GATEWAYS ?? "").split(",").map(norm).filter(Boolean)) {
    if (!gateways.has(u)) gateways.set(u, { url: u, addedAt: Date.now(), online: false, lastSeen: null, shells: [] });
  }

  async function poll() {
    await Promise.all(
      [...gateways.values()].map(async (g) => {
        try {
          g.shells = await fetchShells(g.url, timeoutMs);
          g.online = true;
          g.lastSeen = Date.now();
        } catch {
          g.online = false; // keep the last known spec sheet so it shows as offline
        }
      }),
    );
    save();
  }

  /** Flat catalog: every shell with its gateway and the gateway status. */
  const catalog = () =>
    [...gateways.values()].flatMap((g) =>
      g.shells.map((s) => ({ ...s, status: g.online ? s.status : ("offline" as const), gateway: s.gateway || g.url })),
    );

  const llms = () => {
    const live = catalog();
    return `# Rent a Shell · catalog

> Real hardware by the minute. Each shell is built and maintained by a Forger, who runs their own gateway. Pick a shell, read its gateway's llms.txt and pay there (x402 in USDC on Solana).

## Shells

${live.length ? live.map((s) => `- ${s.name} (${s.id}), ${s.kind}, ${s.location}, ${s.status}. USD ${s.pricing.usd} per ${s.pricing.block_minutes} min. Sensors: ${(s.sensors ?? []).join(", ") || "angles"}. Forger: ${s.forger?.name ?? "?"}. Gateway: ${s.gateway} · instructions ${s.gateway}/llms.txt · payment POST ${s.gateway}/api/sessions/x402?shell=${s.id}&blocks=1`).join("\n") : "- No shells registered yet."}

## Other entry points

- Catalog JSON: ${publicUrl}/api/catalog
- MCP (Streamable HTTP): ${publicUrl}/mcp, tools list_shells and get_shell
- Add your hardware as a Forger: POST ${publicUrl}/api/forgers {"gateway":"https://your-gateway"}
- Claude Code skill to rent and test code on real hardware:
  npx skills add francoperez03/rent-a-shell --skill rent-a-shell (or read ${publicUrl}/skills/rent/SKILL.md)
- Claude Code skill for Forgers (installs and configures the gateway, camera and tunnel):
  npx skills add francoperez03/rent-a-shell --skill rent-a-shell-forger (or read ${publicUrl}/skills/forger/SKILL.md)
`;
  };

  const app = new Hono();
  app.use("*", cors({ origin: env.ALLOWED_ORIGIN ?? "*" }));
  app.get("/api/health", (c) => c.json({ ok: true, gateways: gateways.size, online: [...gateways.values()].filter((g) => g.online).length }));
  app.get("/api/catalog", (c) => c.json(catalog()));
  app.get("/api/forgers", (c) => c.json([...gateways.values()].map(({ url, online, lastSeen, shells }) => ({ url, online, lastSeen, shells: shells.map((s) => s.id) }))));

  // Open sign-up: the hub checks that the gateway answers with valid shells before listing it.
  app.post("/api/forgers", async (c) => {
    const b = await c.req.json<{ gateway?: unknown }>().catch(() => ({}) as { gateway?: unknown });
    if (typeof b.gateway !== "string" || !/^https?:\/\//.test(b.gateway)) return c.json({ error: "invalid_gateway" }, 400);
    const url = norm(b.gateway);
    let shells: Shell[];
    try {
      shells = await fetchShells(url, timeoutMs);
    } catch (e) {
      return c.json({ error: "gateway_unreachable", message: (e as Error).message }, 422);
    }
    // unique ids in the catalog: if another live gateway publishes the same id, conflict; if it is down
    // (e.g. the same Forger's quick tunnel changed URL), it gets replaced
    for (const g of [...gateways.values()]) {
      if (g.url === url || !g.shells.some((s) => shells.some((n) => n.id === s.id))) continue;
      const alive = await fetchShells(g.url, timeoutMs).then(() => true, () => false);
      if (alive) return c.json({ error: "shell_id_taken", message: `${g.url} already publishes this id. Pick another SHELL_ID.` }, 409);
      gateways.delete(g.url);
    }
    gateways.set(url, { url, addedAt: gateways.get(url)?.addedAt ?? Date.now(), online: true, lastSeen: Date.now(), shells });
    save();
    return c.json({ ok: true, url, shells: shells.map((s) => s.id) }, 201);
  });

  app.delete("/api/forgers", async (c) => {
    if (!adminToken || c.req.header("authorization") !== `Bearer ${adminToken}`) return c.json({ error: "unauthorized" }, 401);
    const b = await c.req.json<{ gateway?: string }>().catch(() => ({}) as { gateway?: string });
    const ok = gateways.delete(norm(b.gateway ?? ""));
    save();
    return c.json({ ok });
  });

  app.get("/llms.txt", (c) => c.text(llms()));

  // Claude Code skills (skills/ folder in the repo): forger = publish hardware, rent = rent it.
  const SKILLS: Record<string, { dir: string; files: Record<string, string> }> = {
    forger: { dir: "rent-a-shell-forger", files: { "SKILL.md": "text/markdown; charset=utf-8" } },
    rent: { dir: "rent-a-shell", files: { "SKILL.md": "text/markdown; charset=utf-8", "rent.mjs": "text/javascript; charset=utf-8" } },
  };
  app.get("/skills/:name/:file", (c) => {
    const sk = SKILLS[c.req.param("name")];
    const type = sk?.files[c.req.param("file")];
    if (!sk || !type) return c.json({ error: "not_found" }, 404);
    try {
      return c.body(readFileSync(new URL(`../../../skills/${sk.dir}/${c.req.param("file")}`, import.meta.url), "utf8"), 200, { "content-type": type });
    } catch {
      return c.json({ error: "not_found" }, 404);
    }
  });

  app.all("/mcp", async (c) => {
    const s = new McpServer({ name: "rent-a-shell-hub", version: "0.1.0" });
    const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] });
    s.registerTool("list_shells", { description: "Full catalog of rentable real hardware: shells, Forger, sensors, price and the gateway where you pay." }, async () => text(catalog()));
    s.registerTool(
      "get_shell",
      { description: "A shell's spec sheet and how to rent it (gateway, llms.txt and x402 endpoint).", inputSchema: { id: z.string() } },
      async ({ id }) => {
        const sh = catalog().find((x) => x.id === id);
        if (!sh) return { ...text({ error: "unknown_shell" }), isError: true };
        return text({ ...sh, how_to_rent: { llms: `${sh.gateway}/llms.txt`, x402: `${sh.gateway}/api/sessions/x402?shell=${sh.id}&blocks=1`, mcp: `${sh.gateway}/mcp` } });
      },
    );
    const t = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await s.connect(t);
    return t.handleRequest(c.req.raw);
  });

  return { app, poll, gateways };
}
