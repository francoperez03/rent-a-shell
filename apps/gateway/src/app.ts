import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { mulUsd, type PaymentRail } from "@ras/rails-core";
import type { Command, GatewayEvent, Joint, Payment, Shell, ShellStatus } from "@ras/shell-spec";
import type { Config, Env } from "./config.ts";
import { loadRails, identities } from "./rails.ts";
import { Robot } from "./robot.ts";
import { Sessions } from "./sessions.ts";
import { bus } from "./events.ts";
import { Frames } from "./frame.ts";
import { llmsTxt, agentCard } from "./discovery.ts";
import { mcpHandler } from "./mcp.ts";

const JOINTS: Joint[] = ["base", "shoulder", "elbow", "grip"];

export function createApp(cfg: Config, env: Env, opts: { rails?: PaymentRail[] } = {}) {
  const rails = opts.rails ?? loadRails(cfg.rails, env);
  const byId = new Map(rails.map((r) => [r.id, r]));
  const robot = new Robot(cfg.esp32, cfg.shell.home);
  const blockMs = cfg.shell.pricing.block_minutes * 60_000;
  const sessions = new Sessions(cfg.secret, blockMs, cfg.restMs, cfg.dataFile);
  const frames = new Frames(cfg.rtspUrl);
  const hits = new Map<string, number[]>(); // rate limit por sesión

  let status: ShellStatus = "online";
  let lastActive: string | null = null;

  const shell = (): Shell => ({
    ...cfg.shell,
    status,
    camera: { hls: cfg.liveUrl, frame: `${cfg.publicUrl}/api/shells/${cfg.shell.id}/frame` },
  });
  const price = (blocks: number) => ({ usd: mulUsd(cfg.shell.pricing.usd, blocks) });
  const parseBlocks = (v: unknown) => {
    const n = Number(v ?? 1);
    return Number.isInteger(n) && n >= 1 && n <= cfg.maxBlocks ? n : null;
  };

  async function settleIntent(id: string, p: Payment) {
    const rec = sessions.intents.get(id);
    if (!rec || rec.status !== "pending") return;
    const g = await sessions.grant(rec.shell, rec.blocks, p);
    rec.status = "paid";
    rec.sid = g.sid;
    sessions.save();
    bus.emit({ type: "payment_seen", intentId: id, rail: p.rail, tx: p.tx, explorerUrl: p.explorerUrl });
  }

  async function checkIntent(id: string, force = false) {
    const rec = sessions.intents.get(id);
    if (!rec || rec.status !== "pending") return;
    if (!force && rec.lastCheck && Date.now() - rec.lastCheck < 3000) return;
    rec.lastCheck = Date.now();
    const rail = byId.get(rec.intent.rail);
    const p = await rail?.check?.(rec.intent).catch((e) => {
      console.error(`[${rec.intent.rail}] check`, (e as Error).message);
      return null;
    });
    if (p) await settleIntent(id, p);
    else if (Date.now() > rec.intent.expiresAt + 5 * 60_000) {
      // 5 min de gracia por pagos que llegan tarde
      rec.status = "expired";
      sessions.save();
    }
  }

  /** Reloj: arranca y corta sesiones, detecta robot caído, revisa pagos pendientes. */
  let ticks = 0;
  async function tick() {
    ticks++;
    const now = Date.now();
    for (const s of sessions.sessions.values()) {
      if (!s.ended && s.starts_at <= now && now >= s.expires_at) {
        sessions.end(s.sid, "expired");
        await robot.goHome();
      }
    }
    const act = sessions.active(cfg.shell.id);
    if (act && act.sid !== lastActive) {
      bus.emit({ type: "session_started", shell: act.shell, sid: act.sid, rail: act.rail, expires_at: act.expires_at });
    }
    lastActive = act?.sid ?? null;

    const st = await robot.state();
    const next: ShellStatus = !robot.online ? "offline" : act ? "busy" : "online";
    if (next !== status) {
      status = next;
      bus.emit({ type: "status", shell: cfg.shell.id, status });
    }
    if (act && !robot.online && !act.refund_due) {
      act.refund_due = true; // spec 04: reembolso manual si el robot se cae con sesión paga
      sessions.save();
      console.warn(`[refund_due] sesión ${act.sid} pagó ${act.payment?.tx ?? act.rail} y el robot está offline`);
    }
    if (st) bus.emit({ type: "state", shell: cfg.shell.id, state: st });
    if (ticks % 5 === 0) {
      for (const [id, rec] of sessions.intents) if (rec.status === "pending") await checkIntent(id);
    }
  }

  const app = new Hono();
  app.use("*", cors({ origin: cfg.allowedOrigin, exposeHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE", "X-PAYMENT-RESPONSE"] }));
  app.onError((e, c) => {
    console.error(e);
    return c.json({ error: "internal", message: e.message }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true, rails: rails.map((r) => r.id), robot: robot.online }));
  app.get("/api/shells", (c) => c.json([shell()]));
  app.get("/api/shells/:id/state", async (c) => {
    if (c.req.param("id") !== cfg.shell.id) return c.json({ error: "unknown_shell" }, 404);
    const st = await robot.state();
    return st ? c.json(st) : c.json({ error: "robot_offline" }, 503);
  });
  app.get("/api/shells/:id/queue", (c) => {
    const a = sessions.active(cfg.shell.id);
    return c.json({
      active: a ? { sid: a.sid, rail: a.rail, expires_at: a.expires_at } : null,
      waiting: sessions.waiting(cfg.shell.id).length,
    });
  });
  app.get("/api/shells/:id/frame", async (c) => {
    const f = await frames.latest();
    if (!f) return c.json({ error: "no_camera" }, 404);
    return c.body(f, 200, { "content-type": "image/jpeg", "cache-control": "no-store" });
  });

  app.get("/api/rails", (c) => c.json(rails.map((r) => r.manifest())));

  app.post("/api/sessions/intent", async (c) => {
    const b = await c.req.json<{ shell?: string; blocks?: number; rail?: string; asset?: string }>().catch(() => ({}) as never);
    if (b.shell !== cfg.shell.id) return c.json({ error: "unknown_shell" }, 404);
    const blocks = parseBlocks(b.blocks);
    if (!blocks) return c.json({ error: "invalid_blocks", max: cfg.maxBlocks }, 400);
    const rail = b.rail ? byId.get(b.rail) : undefined;
    if (!rail?.createIntent) return c.json({ error: "unknown_rail" }, 400);
    if (!rail.manifest().available) return c.json({ error: "rail_unavailable" }, 409);
    try {
      const intent = await rail.createIntent(price(blocks), { id: crypto.randomUUID(), asset: b.asset });
      const rec = { intent, shell: cfg.shell.id, blocks, status: "pending" as const };
      sessions.addIntent(rec);
      return c.json(sessions.view(rec));
    } catch (e) {
      return c.json({ error: "intent_failed", message: (e as Error).message }, 409);
    }
  });

  app.get("/api/sessions/intent/:id", async (c) => {
    const id = c.req.param("id");
    await checkIntent(id);
    const rec = sessions.intents.get(id);
    return rec ? c.json(sessions.view(rec)) : c.json({ error: "unknown_intent" }, 404);
  });

  // x402: se valida el pedido ANTES del paywall para no cobrar pedidos inválidos.
  const x402Rails = rails.filter((r) => r.paywall);
  const paywalls = new Map(
    x402Rails.map((r) => [
      r.id,
      r.paywall!("/api/sessions/x402", (q) => price(parseBlocks(q.blocks) ?? 1), `Sesión de ${cfg.shell.pricing.block_minutes} min por bloque con ${cfg.shell.name}`),
    ]),
  );
  app.post(
    "/api/sessions/x402",
    async (c, next) => {
      if ((c.req.query("shell") ?? cfg.shell.id) !== cfg.shell.id) return c.json({ error: "unknown_shell" }, 404);
      if (!parseBlocks(c.req.query("blocks"))) return c.json({ error: "invalid_blocks", max: cfg.maxBlocks }, 400);
      const id = c.req.query("rail") ?? x402Rails[0]?.id;
      const pw = id && paywalls.get(id);
      if (!pw) return c.json({ error: "no_x402_rail" }, 404);
      return pw(c, next);
    },
    async (c) => {
      const p = c.get("payment" as never) as Payment | undefined;
      if (!p) return c.json({ error: "payment_missing" }, 402);
      const g = await sessions.grant(cfg.shell.id, parseBlocks(c.req.query("blocks"))!, p);
      bus.emit({ type: "payment_seen", intentId: p.intentId, rail: p.rail, tx: p.tx, explorerUrl: p.explorerUrl });
      return c.json(g);
    },
  );

  const bearer = (h?: string) => h?.replace(/^Bearer\s+/i, "");

  app.get("/api/session", async (c) => {
    const s = await sessions.sessionFor(bearer(c.req.header("authorization")));
    if (!s) return c.json({ error: "invalid_token" }, 401);
    const now = Date.now();
    return c.json({ sid: s.sid, shell: s.shell, starts_at: s.starts_at, expires_at: s.expires_at, active: !s.ended && s.starts_at <= now && now < s.expires_at, ended: s.ended ?? null });
  });

  app.post("/api/cmd", async (c) => {
    const v = await sessions.validate(bearer(c.req.header("authorization")), cfg.shell.id);
    if (!v.s) return c.json({ error: v.error }, v.status!);
    const cmd = await c.req.json<Command>().catch(() => null);
    const bad = () => c.json({ error: "invalid_command", allowed: ["joint", "dance", "stop"] }, 400);
    if (!cmd) return bad();
    if (cmd.cmd === "joint" && !(JOINTS.includes(cmd.args?.joint) && Number.isFinite(cmd.args?.angle))) return bad();
    if (cmd.cmd === "dance" && !cfg.shell.routines.includes(cmd.args?.rutina)) return bad();
    if (!["joint", "dance", "stop"].includes(cmd.cmd)) return bad();
    if (cmd.cmd !== "stop") {
      const now = Date.now();
      const h = (hits.get(v.s.sid) ?? []).filter((t) => now - t < 1000);
      if (h.length >= 10) return c.json({ error: "rate_limited" }, 429);
      h.push(now);
      hits.set(v.s.sid, h);
    }
    const r = await robot.send(cmd);
    return c.json(r.data as object, r.status as 200);
  });

  app.post("/api/sessions/end", async (c) => {
    const v = await sessions.validate(bearer(c.req.header("authorization")));
    if (!v.s) return c.json({ error: v.error }, v.status!);
    sessions.end(v.s.sid, "ended");
    await robot.goHome();
    return c.json({ ok: true });
  });

  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const off = bus.on((e: GatewayEvent) => void stream.writeSSE({ data: JSON.stringify(e) }));
      await stream.writeSSE({ data: JSON.stringify({ type: "status", shell: cfg.shell.id, status } satisfies GatewayEvent) });
      stream.onAbort(() => void off());
      while (!stream.aborted) await stream.sleep(15_000).then(() => stream.writeSSE({ event: "ping", data: "" }));
    }),
  );

  const card = () => agentCard(cfg, rails, identities(cfg.rails, env));
  app.get("/llms.txt", (c) => c.text(llmsTxt(cfg, shell(), rails)));
  app.get("/.well-known/agent.json", (c) => c.json(card()));
  app.get("/.well-known/agent-registration.json", (c) => c.json(card()));
  app.all("/mcp", (c) => mcpHandler(c.req.raw, { cfg, shell, rails, robot, sessions, frames, price, publicUrl: cfg.publicUrl }));

  return { app, tick, robot, sessions, rails };
}
