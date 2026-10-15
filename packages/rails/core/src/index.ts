import type { MiddlewareHandler } from "hono";
import type { Intent, Money, Payment, RailManifest, Reputation, Shell } from "@ras/shell-spec";

export type { Intent, Money, Payment, RailManifest, Reputation };

/** Shell registry on the rail's chain (spec 15): the gateway registers its shell on start and reads its counters. */
export interface ShellRegistry {
  register(shell: Pick<Shell, "id" | "pricing">): Promise<void>;
  reputation(shellId: string): Promise<Reputation | null>;
}

export interface IntentOpts {
  asset?: string;
  /** stable id the rail can use as a reference; set by the gateway */
  id: string;
  /** what the intent buys, for rails whose instructions carry a URL back into the gateway (x402 via escrow) */
  shell?: string;
  blocks?: number;
}

/**
 * A payment method. The gateway only knows this interface (spec 08).
 * Synchronous rails (x402) expose paywall(); asynchronous ones (Solana Pay, approval) expose check().
 */
export interface PaymentRail {
  id: string;
  manifest(): RailManifest;
  createIntent?(price: Money, opts: IntentOpts): Promise<Intent>;
  check?(intent: Intent): Promise<Payment | null>;
  /**
   * Middleware that charges before reaching the handler. Once the payment settles,
   * it leaves the Payment in c.get("payment") (the gateway reads it after next()).
   * priceFor returns the price for the request (blocks requested).
   */
  paywall?(path: string, priceFor: (query: Record<string, string>) => Money, description: string): MiddlewareHandler;
  /** Client example for llms.txt and /agents: how an agent pays on this rail. `url` is the endpoint to pay. */
  clientExample?(url: string): string;
  /** Rail-owned routes (e.g. the Solana Pay transaction request). The gateway mounts them at /api/rails/:id/*. */
  fetch?(req: Request): Promise<Response>;
  /**
   * Closes the payment when the session ends: "completed" releases it to the Forger (minus the platform fee),
   * "refund" returns it to the payer. Rails that charge directly (x402) do not implement it.
   */
  finalize?(payment: Payment, outcome: Outcome): Promise<{ tx?: string } | void>;
  /** Rails with an on-chain shell record (escrow program). */
  registry?: ShellRegistry;
}

export type Outcome = "completed" | "refund";

export type RailFactory = (env: Record<string, string | undefined>) => PaymentRail | PaymentRail[];

/** Converts "1.50" USD to atomic units with `decimals` decimals, without floats. */
export function toAtomic(amount: string, decimals: number): bigint {
  const [i, f = ""] = amount.split(".");
  if (!/^\d+$/.test(i) || !/^\d*$/.test(f)) throw new Error(`invalid amount: ${amount}`);
  return BigInt(i + f.padEnd(decimals, "0").slice(0, decimals));
}

export function fromAtomic(v: bigint, decimals: number): string {
  const s = v.toString().padStart(decimals + 1, "0");
  const i = s.slice(0, -decimals) || "0";
  const f = s.slice(-decimals).replace(/0+$/, "");
  return f ? `${i}.${f}` : i;
}

export function mulUsd(usd: string, n: number): string {
  return fromAtomic(toAtomic(usd, 6) * BigInt(n), 6);
}

/**
 * Development rail: pays on the second check(). For tests and for running the site without a chain.
 */
export function fakeRail(): PaymentRail {
  const seen = new Map<string, number>();
  return {
    id: "fake",
    manifest: () => ({
      id: "fake",
      label: "Test payment",
      description: "Simulates a confirmed payment. Development only.",
      audience: ["human", "agent"],
      available: true,
      assets: [{ symbol: "USD", decimals: 2 }],
    }),
    async createIntent(price, { id }) {
      return {
        id,
        rail: "fake",
        amount: price.usd,
        asset: "USD",
        expiresAt: Date.now() + 15 * 60_000,
        instructions: { kind: "approval", ref: id, note: "Simulated payment: confirms on its own in a few seconds." },
      };
    },
    async check(intent) {
      const n = (seen.get(intent.id) ?? 0) + 1;
      seen.set(intent.id, n);
      return n >= 2 ? { intentId: intent.id, rail: "fake", payer: "dev", paidAt: Date.now() } : null;
    },
    paywall(_path, priceFor) {
      // Without the X-Fake-Pay header it answers 402 like a real rail; with it, it lets the request through.
      return async (c, next) => {
        const price = priceFor(c.req.query());
        if (c.req.header("x-fake-pay") !== "1") {
          return c.json({ error: "payment_required", rail: "fake", price, hint: "retry with header X-Fake-Pay: 1" }, 402);
        }
        c.set("payment" as never, { intentId: crypto.randomUUID(), rail: "fake", payer: "dev-agent", paidAt: Date.now() } as never);
        await next();
      };
    },
  };
}
