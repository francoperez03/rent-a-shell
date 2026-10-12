// Hub del marketplace: indexa los gateways de los Forgers y arma un catálogo único.
// Cada Forger corre su gateway al lado de su robot (su wallet, su cola, sus pagos); el hub solo
// descubre, chequea salud y publica el catálogo para el sitio y para agentes (API, llms.txt, MCP).
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

/** Valida lo mínimo que el sitio y los agentes necesitan de cada shell. */
function isShell(s: unknown): s is Shell {
  const v = s as Shell;
  return Boolean(v && typeof v.id === "string" && typeof v.name === "string" && v.pricing && typeof v.pricing.usd === "string" && v.joints);
}

async function fetchShells(url: string, timeoutMs: number): Promise<Shell[]> {
  const r = await fetch(`${url}/api/shells`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const list = (await r.json()) as unknown[];
  if (!Array.isArray(list) || !list.every(isShell)) throw new Error("respuesta sin forma de shells");
  // ponytail: el gateway del Forger define su propia URL; si no la manda, se usa la registrada
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
          g.online = false; // se conserva la última ficha conocida para mostrarla como offline
        }
      }),
    );
    save();
  }

  /** Catálogo plano: cada shell con su gateway y el estado del gateway. */
  const catalog = () =>
    [...gateways.values()].flatMap((g) =>
      g.shells.map((s) => ({ ...s, status: g.online ? s.status : ("offline" as const), gateway: s.gateway || g.url })),
    );

  const llms = () => {
    const live = catalog();
    return `# Rent a Shell · catálogo

> Hardware real por minutos. Cada shell lo arma y mantiene un Forger, que corre su propio gateway. Elegí un shell, leé el llms.txt de su gateway y pagá ahí (x402 en USDC sobre Solana).

## Shells

${live.length ? live.map((s) => `- ${s.name} (${s.id}), ${s.kind}, ${s.location}, ${s.status}. USD ${s.pricing.usd} por ${s.pricing.block_minutes} min. Sensores: ${(s.sensors ?? []).join(", ") || "angles"}. Forger: ${s.forger?.name ?? "?"}. Gateway: ${s.gateway} · instrucciones ${s.gateway}/llms.txt · pago POST ${s.gateway}/api/sessions/x402?shell=${s.id}&blocks=1`).join("\n") : "- Todavía no hay shells registrados."}

## Otras entradas

- Catálogo JSON: ${publicUrl}/api/catalog
- MCP (Streamable HTTP): ${publicUrl}/mcp, tools list_shells y get_shell
- Sumar tu hardware como Forger: POST ${publicUrl}/api/forgers {"gateway":"https://tu-gateway"}
`;
  };

  const app = new Hono();
  app.use("*", cors({ origin: env.ALLOWED_ORIGIN ?? "*" }));
  app.get("/api/health", (c) => c.json({ ok: true, gateways: gateways.size, online: [...gateways.values()].filter((g) => g.online).length }));
  app.get("/api/catalog", (c) => c.json(catalog()));
  app.get("/api/forgers", (c) => c.json([...gateways.values()].map(({ url, online, lastSeen, shells }) => ({ url, online, lastSeen, shells: shells.map((s) => s.id) }))));

  // Alta abierta: el hub verifica que el gateway responda con shells válidos antes de listarlo.
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

  app.all("/mcp", async (c) => {
    const s = new McpServer({ name: "rent-a-shell-hub", version: "0.1.0" });
    const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] });
    s.registerTool("list_shells", { description: "Catálogo completo de hardware real alquilable: shells, Forger, sensores, precio y gateway donde se paga." }, async () => text(catalog()));
    s.registerTool(
      "get_shell",
      { description: "Ficha de un shell y cómo alquilarlo (gateway, llms.txt y endpoint x402).", inputSchema: { id: z.string() } },
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
