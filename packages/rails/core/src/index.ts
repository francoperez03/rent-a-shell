import type { MiddlewareHandler } from "hono";
import type { Intent, Money, Payment, RailManifest } from "@ras/shell-spec";

export type { Intent, Money, Payment, RailManifest };

export interface IntentOpts {
  asset?: string;
  /** id estable para que el riel lo use como referencia; lo pone el gateway */
  id: string;
}

/**
 * Un medio de pago. El gateway solo conoce esta interfaz (spec 08).
 * Rieles síncronos (x402) exponen paywall(); asíncronos (transfer, redirect) exponen check().
 */
export interface PaymentRail {
  id: string;
  manifest(): RailManifest;
  createIntent?(price: Money, opts: IntentOpts): Promise<Intent>;
  check?(intent: Intent): Promise<Payment | null>;
  /**
   * Middleware que cobra antes de llegar al handler. Si el pago se liquidó,
   * deja el Payment en c.get("payment") (lo lee el gateway después de next()).
   * priceFor devuelve el precio según el request (bloques pedidos).
   */
  paywall?(path: string, priceFor: (query: Record<string, string>) => Money, description: string): MiddlewareHandler;
  /** Ejemplo de cliente para llms.txt y /agents: cómo paga un agente este riel. `url` es el endpoint a pagar. */
  clientExample?(url: string): string;
}

export type RailFactory = (env: Record<string, string | undefined>) => PaymentRail | PaymentRail[];

/** Convierte "1.50" USD a unidades atómicas con `decimals` decimales, sin floats. */
export function toAtomic(amount: string, decimals: number): bigint {
  const [i, f = ""] = amount.split(".");
  if (!/^\d+$/.test(i) || !/^\d*$/.test(f)) throw new Error(`monto inválido: ${amount}`);
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
 * Riel de desarrollo: paga solo al segundo check(). Para tests y para correr el sitio sin chain.
 */
export function fakeRail(): PaymentRail {
  const seen = new Map<string, number>();
  return {
    id: "fake",
    manifest: () => ({
      id: "fake",
      label: "Pago de prueba",
      description: "Simula un pago confirmado. Solo para desarrollo.",
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
        instructions: { kind: "approval", ref: id, note: "Pago simulado: se confirma solo en unos segundos." },
      };
    },
    async check(intent) {
      const n = (seen.get(intent.id) ?? 0) + 1;
      seen.set(intent.id, n);
      return n >= 2 ? { intentId: intent.id, rail: "fake", payer: "dev", paidAt: Date.now() } : null;
    },
    paywall(_path, priceFor) {
      // Sin header X-Fake-Pay devuelve 402 como un riel real; con él, deja pasar.
      return async (c, next) => {
        const price = priceFor(c.req.query());
        if (c.req.header("x-fake-pay") !== "1") {
          return c.json({ error: "payment_required", rail: "fake", price, hint: "reintentar con header X-Fake-Pay: 1" }, 402);
        }
        c.set("payment" as never, { intentId: crypto.randomUUID(), rail: "fake", payer: "dev-agent", paidAt: Date.now() } as never);
        await next();
      };
    },
  };
}
