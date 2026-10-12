// Riel celo-wallet: una persona transfiere USDC (o wARS en mainnet) desde su wallet.
// Riel ripio: pesos por ramp.ripio.com, llega wARS a PAY_TO (solo mainnet, sin webhook).
// Ambos confirman mirando Transfer on-chain (pagos-placa/README.md: Ripio no avisa).
import { formatUnits } from "viem";
import { fromAtomic, toAtomic, type IntentOpts, type Money, type PaymentRail } from "@ras/rails-core";
import type { Intent, Payment } from "@ras/shell-spec";
import { NETWORKS, RIPIO_RAMP, TEXTILE, USDC, USDT_MAINNET, WARS, celoNet, payTo, rpcUrl, type CeloNet } from "./config.ts";
import { dataSuffix } from "./attribution.ts";
import { client, findTransfer } from "./watch.ts";

type Env = Record<string, string | undefined>;
const TTL = 15 * 60_000;

/** wARS por 1 USD según Textile RFQ preview (USDT → wARS), cache de 60 s. */
let fx: { at: number; warsPerUsd: number } | null = null;
export async function warsPerUsd(): Promise<number> {
  if (fx && Date.now() - fx.at < 60_000) return fx.warsPerUsd;
  const r = await fetch(`${TEXTILE}/rfq/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chainId: NETWORKS.mainnet.chain.id, sellToken: USDT_MAINNET, buyToken: NETWORKS.mainnet.wars, sellAmount: "1000000" }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json()) as { data?: { buyAmount?: string } };
  if (!r.ok || !j.data?.buyAmount) throw new Error(`Textile preview ${r.status}`);
  fx = { at: Date.now(), warsPerUsd: Number(formatUnits(BigInt(j.data.buyAmount), WARS.decimals)) };
  return fx.warsPerUsd;
}

function chainInfo(net: CeloNet, env: Env) {
  return { id: net.chain.id, name: net.label, rpc: rpcUrl(net, env), explorer: net.explorer, nativeSymbol: "CELO" };
}

/** Referencias en los últimos decimales para asociar el Transfer al intent sin contrato. */
class Refs {
  private open = new Map<string, number>(); // intentId -> ref
  take(id: string): number {
    const used = new Set(this.open.values());
    for (let i = 0; i < 50; i++) {
      const r = 1 + Math.floor(Math.random() * 999);
      if (!used.has(r)) {
        this.open.set(id, r);
        return r;
      }
    }
    throw new Error("Demasiados pagos abiertos, probá en un minuto.");
  }
  release(id: string) {
    this.open.delete(id);
  }
}

export function celoWallet(env: Env): PaymentRail {
  const net = celoNet(env);
  const pub = client(net, rpcUrl(net, env));
  const refs = new Refs();
  const used = new Set<string>();
  const assets = [{ symbol: USDC.symbol, decimals: USDC.decimals }, ...(net.wars ? [{ symbol: WARS.symbol, decimals: WARS.decimals }] : [])];

  return {
    id: "celo-wallet",
    manifest: () => ({
      id: "celo-wallet",
      label: `Wallet · ${net.label}`,
      description: `Pagás desde tu wallet en ${net.label} con ${assets.map((a) => a.symbol).join(" o ")}. Funciona desde cualquier país.`,
      audience: ["human"],
      available: Boolean(env.CELO_PAY_TO),
      wallet: { chains: [chainInfo(net, env)] },
      assets,
    }),

    async createIntent(price: Money, { id, asset }: IntentOpts): Promise<Intent> {
      const to = payTo(env);
      const fromBlock = await pub.getBlockNumber();
      const ref = refs.take(id);
      let token: `0x${string}`, decimals: number, symbol: string, atomic: bigint;
      if (asset === WARS.symbol && net.wars) {
        const ars = Math.ceil(Number(price.usd) * (await warsPerUsd()));
        token = net.wars;
        decimals = WARS.decimals;
        symbol = WARS.symbol;
        atomic = toAtomic(String(ars), decimals) + BigInt(ref) * 10n ** 15n; // ref en milésimos de wARS
      } else {
        token = net.usdc;
        decimals = USDC.decimals;
        symbol = USDC.symbol;
        atomic = toAtomic(price.usd, decimals) + BigInt(ref); // ref en millonésimos de USDC
      }
      return {
        id,
        rail: "celo-wallet",
        amount: fromAtomic(atomic, decimals),
        asset: symbol,
        expiresAt: Date.now() + TTL,
        instructions: {
          kind: "transfer",
          chainId: net.chain.id,
          token,
          to,
          amount: fromAtomic(atomic, decimals),
          decimals,
          symbol,
          dataSuffix: dataSuffix(env),
        },
        meta: { fromBlock: fromBlock.toString(), atomic: atomic.toString(), token },
      };
    },

    async check(intent: Intent): Promise<Payment | null> {
      const m = intent.meta as { fromBlock: string; atomic: string; token: `0x${string}` };
      const want = BigInt(m.atomic);
      const hit = await findTransfer(pub, m.token, payTo(env), BigInt(m.fromBlock), (v) => v === want, used);
      if (!hit) {
        if (Date.now() > intent.expiresAt) refs.release(intent.id);
        return null;
      }
      used.add(hit.tx);
      refs.release(intent.id);
      return { intentId: intent.id, rail: "celo-wallet", payer: hit.from, tx: hit.tx, explorerUrl: net.explorerTx + hit.tx, paidAt: Date.now() };
    },
  };
}

export function ripio(env: Env): PaymentRail {
  const net = celoNet(env);
  const live = net.key === "mainnet" && Boolean(net.wars);
  const pub = client(net, rpcUrl(net, env));
  const used = new Set<string>();
  const minArs = Number(env.RIPIO_MIN_ARS ?? 2100);
  let openIntent: { id: string; until: number } | null = null;

  return {
    id: "ripio",
    manifest: () => ({
      id: "ripio",
      label: "Pesos con Ripio",
      description: live
        ? "Pagás en pesos por transferencia o Mercado Pago. Ripio lo convierte a wARS en Celo. Primera vez: KYC en Ripio."
        : "Disponible en Celo mainnet. En esta red de prueba no hay wARS.",
      audience: ["human"],
      available: live && Boolean(env.CELO_PAY_TO),
      countries: ["AR"],
      assets: [{ symbol: WARS.symbol, decimals: WARS.decimals }],
    }),

    async createIntent(price: Money, { id }: IntentOpts): Promise<Intent> {
      if (!live) throw new Error("Ripio solo funciona en Celo mainnet (CELO_NETWORK=mainnet).");
      // Ripio fija el monto final en ARS y no lleva referencia: un solo intent Ripio abierto a la vez.
      if (openIntent && openIntent.until > Date.now() && openIntent.id !== id) {
        throw new Error("Hay otro pago con Ripio en curso. Probá en unos minutos o pagá con wallet.");
      }
      const ars = Math.max(minArs, Math.ceil(Number(price.usd) * (await warsPerUsd())));
      const to = payTo(env);
      const fromBlock = await pub.getBlockNumber();
      openIntent = { id, until: Date.now() + TTL };
      const url = `${RIPIO_RAMP}?country=AR&chain=${net.chain.id}&token=WARS&amount=${ars}&address=${to}`;
      return {
        id,
        rail: "ripio",
        amount: String(ars),
        asset: "ARS",
        expiresAt: Date.now() + TTL,
        instructions: {
          kind: "redirect",
          url,
          note: ars === minArs ? `Ripio cobra un mínimo de ${minArs} ARS por operación.` : undefined,
        },
        meta: { fromBlock: fromBlock.toString(), expected: toAtomic(String(ars), WARS.decimals).toString() },
      };
    },

    async check(intent: Intent): Promise<Payment | null> {
      const m = intent.meta as { fromBlock: string; expected: string };
      const min = (BigInt(m.expected) * 90n) / 100n; // comisiones de Ripio: acepta desde el 90 %
      const hit = await findTransfer(pub, net.wars!, payTo(env), BigInt(m.fromBlock), (v) => v >= min, used);
      if (!hit) return null;
      used.add(hit.tx);
      if (openIntent?.id === intent.id) openIntent = null;
      return { intentId: intent.id, rail: "ripio", payer: hit.from, tx: hit.tx, explorerUrl: net.explorerTx + hit.tx, paidAt: Date.now() };
    },
  };
}
