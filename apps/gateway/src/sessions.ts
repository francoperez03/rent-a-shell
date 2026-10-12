// Timed sessions with a per-shell FIFO queue, signed token and automatic cutoff (docs/specs/03-gateway-local.md).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { sign, verify } from "hono/jwt";
import type { Intent, IntentStatus, IntentView, Payment, SessionGrant } from "@ras/shell-spec";
import { bus } from "./events.ts";

export interface Session {
  sid: string;
  shell: string;
  rail: string;
  payer: string;
  starts_at: number;
  expires_at: number;
  ended?: "expired" | "ended" | "offline";
  offline_since?: number;
  /** How the payment was closed on the rail (settle to the Forger or refund); absent = pending. */
  finalized?: "completed" | "refund";
  finalize_tx?: string;
  finalize_retry_at?: number;
  payment?: Payment;
}

export interface IntentRec {
  intent: Intent;
  shell: string;
  blocks: number;
  status: IntentStatus;
  sid?: string;
  lastCheck?: number;
}

/** Customization request a customer leaves for the Forger. */
export interface CustomRequest {
  id: string;
  shell: string;
  contact: string;
  message: string;
  at: number;
}

interface Persisted {
  sessions: Session[];
  intents: IntentRec[];
  requests?: CustomRequest[];
}

export class Sessions {
  sessions = new Map<string, Session>();
  intents = new Map<string, IntentRec>();
  requests: CustomRequest[] = [];
  private tokens = new Map<string, string>(); // sid -> token, returned when a paid intent is queried

  constructor(
    private secret: string,
    private blockMs: number,
    private restMs: number,
    private dataFile: string | null,
  ) {
    this.load();
  }

  /** Session currently controlling the shell (started and not expired). */
  active(shell: string, now = Date.now()): Session | null {
    for (const s of this.sessions.values()) {
      if (s.shell === shell && !s.ended && s.starts_at <= now && now < s.expires_at) return s;
    }
    return null;
  }

  waiting(shell: string, now = Date.now()): Session[] {
    return [...this.sessions.values()]
      .filter((s) => s.shell === shell && !s.ended && s.starts_at > now)
      .sort((a, b) => a.starts_at - b.starts_at);
  }

  /** Issues a session for a confirmed payment. If the shell is busy, it queues after the rest period. */
  async grant(shell: string, blocks: number, payment: Payment): Promise<SessionGrant> {
    const now = Date.now();
    const pending = [...this.sessions.values()].filter((s) => s.shell === shell && !s.ended && s.expires_at > now);
    const lastEnd = pending.reduce((m, s) => Math.max(m, s.expires_at), 0);
    const starts_at = lastEnd ? lastEnd + this.restMs : now;
    const s: Session = {
      sid: crypto.randomUUID(),
      shell,
      rail: payment.rail,
      payer: payment.payer,
      starts_at,
      expires_at: starts_at + blocks * this.blockMs,
      payment,
    };
    this.sessions.set(s.sid, s);
    const token = await sign(
      { sid: s.sid, shell, rail: s.rail, exp: Math.ceil(s.expires_at / 1000) },
      this.secret,
      "HS256",
    );
    this.tokens.set(s.sid, token);
    this.save();
    return { token, sid: s.sid, shell, starts_at, expires_at: s.expires_at, payment };
  }

  /** Validates the token and that the session is still live. Returns the reason if not. */
  async validate(token: string | undefined, shell?: string): Promise<{ s?: Session; error?: string; status?: 401 | 403 }> {
    if (!token) return { error: "missing_token", status: 401 };
    let sid: string;
    try {
      const p = (await verify(token, this.secret, "HS256")) as { sid: string };
      sid = p.sid;
    } catch (e) {
      const msg = (e as Error).name;
      if (msg.includes("NotBefore")) return { error: "session_not_started", status: 403 };
      if (msg.includes("Expired")) return { error: "session_expired", status: 403 };
      return { error: "invalid_token", status: 401 };
    }
    const s = this.sessions.get(sid);
    if (!s) return { error: "unknown_session", status: 401 };
    if (shell && s.shell !== shell) return { error: "wrong_shell", status: 403 };
    if (s.ended) return { error: `session_${s.ended}`, status: 403 };
    const now = Date.now();
    if (now < s.starts_at) return { error: "session_not_started", status: 403 };
    if (now >= s.expires_at) return { error: "session_expired", status: 403 };
    return { s };
  }

  async sessionFor(token: string | undefined) {
    if (!token) return null;
    try {
      const p = (await verify(token, this.secret, "HS256")) as { sid: string };
      return this.sessions.get(p.sid) ?? null;
    } catch {
      return null;
    }
  }

  end(sid: string, reason: Session["ended"]) {
    const s = this.sessions.get(sid);
    if (!s || s.ended) return;
    s.ended = reason;
    if (reason === "ended") s.expires_at = Math.min(s.expires_at, Date.now());
    this.save();
    bus.emit({ type: "session_ended", shell: s.shell, sid, reason: reason! });
  }

  addIntent(rec: IntentRec) {
    this.intents.set(rec.intent.id, rec);
    this.save();
  }

  view(rec: IntentRec): IntentView {
    const { meta: _meta, ...intent } = rec.intent;
    const s = rec.sid ? this.sessions.get(rec.sid) : undefined;
    const token = rec.sid ? this.tokens.get(rec.sid) : undefined;
    return {
      intent,
      status: rec.status,
      session:
        s && token
          ? { token, sid: s.sid, shell: s.shell, starts_at: s.starts_at, expires_at: s.expires_at, payment: s.payment }
          : undefined,
    };
  }

  private load() {
    if (!this.dataFile) return;
    try {
      const d = JSON.parse(readFileSync(this.dataFile, "utf8")) as Persisted & { tokens?: [string, string][] };
      for (const s of d.sessions) this.sessions.set(s.sid, s);
      for (const i of d.intents) this.intents.set(i.intent.id, i);
      for (const [k, v] of d.tokens ?? []) this.tokens.set(k, v);
      this.requests = d.requests ?? [];
    } catch {
      /* first boot */
    }
  }

  save() {
    if (!this.dataFile) return;
    mkdirSync(dirname(this.dataFile), { recursive: true });
    const d = { sessions: [...this.sessions.values()], intents: [...this.intents.values()], tokens: [...this.tokens], requests: this.requests };
    writeFileSync(this.dataFile, JSON.stringify(d, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  }
}
