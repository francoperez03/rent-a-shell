import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { mulUsd, type PaymentRail } from "@ras/rails-core";
import type { Command, GatewayEvent, Joint, Payment, Shell, ShellStatus } from "@ras/shell-spec";
import type { Config, Env } from "./config.ts";
import { loadRails } from "./rails.ts";
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
  const hits = new Map<string, number[]>(); // rate limit per session

  let status: ShellStatus = "online";
  let lastActive: string | null = null;

  const shell = (): Shell => ({
    ...cfg.shell,
    status,
    camera: { hls: cfg.liveUrl, frame: `${cfg.publicUrl}/api/shells/${cfg.shell.id}/frame` },
    gateway: cfg.publicUrl,
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
      // 5 min grace for late payments
      rec.status = "expired";
      sessions.save();
    }
  }

  /** Closes payments of finished sessions on their rail: settle to the Forger, or refund if the shell went down. */
  async function finalizeEnded() {
    for (const s of sessions.sessions.values()) {
      if (!s.ended || s.finalized || !s.payment) continue;
      if (s.finalize_retry_at && Date.now() < s.finalize_retry_at) continue;
      const outcome = s.ended === "offline" ? "refund" : "completed";
      const rail = byId.get(s.payment.rail);
      try {
        const r = rail?.finalize ? await rail.finalize(s.payment, outcome) : undefined;
        s.finalized = outcome;
        if (r && r.tx) s.finalize_tx = r.tx;
        sessions.save();
        if (rail?.finalize) console.log(`[finalize] session ${s.sid} ${outcome}${r && r.tx ? ` tx ${r.tx}` : ""}`);
      } catch (e) {
        // retried on a later tick; funds stay in escrow and the payer can reclaim them if it never closes
        console.error(`[finalize] session ${s.sid} ${outcome}:`, (e as Error).message);
        s.finalize_retry_at = Date.now() + 30_000;
      }
    }
  }

  /** Clock: starts and ends sessions, detects a dead robot, checks pending payments. */
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
    // spec 04: if the robot drops during a paid session and is not back within offlineRefundMs, end it and refund
    if (act && !robot.online) {
      act.offline_since ??= now;
      if (now - act.offline_since >= cfg.offlineRefundMs) sessions.end(act.sid, "offline");
      sessions.save();
    } else if (act?.offline_since) {
      delete act.offline_since;
      sessions.save();
    }
    await finalizeEnded();
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
  // Rail-owned routes (e.g. the Solana Pay transaction request); the gateway does not know what they do.
  app.all("/api/rails/:id/*", (c) => {
    const r = byId.get(c.req.param("id"));
    return r?.fetch ? r.fetch(c.req.raw) : c.json({ error: "unknown_rail" }, 404);
  });

  // Customization requests to the Forger: public to create, private to read.
  const reqHits = new Map<string, number[]>();
  app.post("/api/shells/:id/requests", async (c) => {
    if (c.req.param("id") !== cfg.shell.id) return c.json({ error: "unknown_shell" }, 404);
    if (!cfg.shell.forger.customizations) return c.json({ error: "customizations_closed" }, 403);
    const raw = await c.req.text();
    if (raw.length > 4000) return c.json({ error: "too_large" }, 413);
    const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "local";
    const now = Date.now();
    const h = (reqHits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
    if (h.length >= 5) return c.json({ error: "rate_limited" }, 429);
    let b: { contact?: unknown; message?: unknown };
    try {
      b = JSON.parse(raw);
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const contact = typeof b.contact === "string" ? b.contact.trim() : "";
    const message = typeof b.message === "string" ? b.message.trim() : "";
    if (!contact || contact.length > 200 || message.length < 10 || message.length > 2000) {
      return c.json({ error: "invalid_request", hint: "contact (1 to 200) and message (10 to 2000 characters)" }, 400);
    }
    reqHits.set(ip, [...h, now]);
    const r = { id: crypto.randomUUID(), shell: cfg.shell.id, contact, message, at: now };
    sessions.requests.push(r);
    sessions.save();
    return c.json({ ok: true, id: r.id }, 201);
  });
  app.get("/api/forger/requests", (c) => {
    const auth = c.req.header("authorization") ?? "";
    if (!cfg.forgerToken || auth !== `Bearer ${cfg.forgerToken}`) return c.json({ error: "unauthorized" }, 401);
    return c.json(sessions.requests);
  });

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

  // x402: validate the request BEFORE the paywall so invalid requests are never charged.
  const x402Rails = rails.filter((r) => r.paywall);
  const paywalls = new Map(
    x402Rails.map((r) => [
      r.id,
      r.paywall!("/api/sessions/x402", (q) => price(parseBlocks(q.blocks) ?? 1), `${cfg.shell.pricing.block_minutes}-minute session block with ${cfg.shell.name}`),
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

  const card = () => agentCard(cfg, rails);
  // MediaMTX HLS proxy: the Forger's camera goes out through the same tunnel as the API.
  // The bearer matches hlsCDNSecret in scripts/forger/mediamtx.yml (local only): MediaMTX then serves HLS as a CDN,
  // without the cookieCheck redirect nor per-client sessions, which a server-side proxy cannot follow.
  app.get("/live/*", async (c) => {
    if (!cfg.hlsUpstream) return c.json({ error: "no_camera" }, 404);
    const path = c.req.path.slice("/live".length);
    if (path.includes("..")) return c.json({ error: "bad_path" }, 400);
    const r = await fetch(cfg.hlsUpstream + path + (new URL(c.req.url).search || ""), { headers: { authorization: "Bearer rent-a-shell-local" }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!r) return c.json({ error: "camera_offline" }, 502);
    return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/octet-stream", "cache-control": "no-store" } });
  });

  app.get("/llms.txt", (c) => c.text(llmsTxt(cfg, shell(), rails)));
  app.get("/.well-known/agent.json", (c) => c.json(card()));
  app.all("/mcp", (c) => mcpHandler(c.req.raw, { cfg, shell, rails, robot, sessions, frames, price, publicUrl: cfg.publicUrl }));

  return { app, tick, robot, sessions, rails };
}
