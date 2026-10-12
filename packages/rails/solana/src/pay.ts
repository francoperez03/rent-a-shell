// solana-pay rail: a human scans a Solana Pay QR (Phantom, Solflare) and pays USDC.
// Each intent carries a `reference` (random pubkey) that the wallet adds to the tx, so the payment
// is found with getSignaturesForAddress(reference), with no contract and no magic decimals.
// Spec: https://docs.solanapay.com/spec (transfer request).
import { createSolanaRpc, getAddressDecoder, signature, type Address } from "@solana/kit";
import { fromAtomic, toAtomic, type IntentOpts, type Money, type PaymentRail } from "@ras/rails-core";
import type { Intent, Payment } from "@ras/shell-spec";
import { USDC, payTo, rpcUrl, solNet } from "./config.ts";

type Env = Record<string, string | undefined>;
const TTL = 15 * 60_000;

export const newReference = (): Address => getAddressDecoder().decode(crypto.getRandomValues(new Uint8Array(32)));

export function solanaPayUrl(o: { to: string; amount: string; mint: string; reference: string; label: string; message: string }) {
  // percent-encoding (%20) as the spec asks: URLSearchParams would emit "+" and some wallets show it literally
  const q = Object.entries({ amount: o.amount, "spl-token": o.mint, reference: o.reference, label: o.label, message: o.message })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `solana:${o.to}?${q}`;
}

/** How much the `owner` balance of token `mint` grew in the tx (atomic units). */
export function received(
  meta: { preTokenBalances?: readonly Bal[] | null; postTokenBalances?: readonly Bal[] | null } | null | undefined,
  owner: string,
  mint: string,
): bigint {
  const sum = (bs?: readonly Bal[] | null) =>
    (bs ?? []).filter((b) => b.owner === owner && b.mint === mint).reduce((n, b) => n + BigInt(b.uiTokenAmount.amount), 0n);
  return sum(meta?.postTokenBalances) - sum(meta?.preTokenBalances);
}
type Bal = { owner?: string; mint: string; uiTokenAmount: { amount: string } };

export function solanaPay(env: Env): PaymentRail {
  const net = solNet(env);
  const rpc = createSolanaRpc(rpcUrl(net, env));

  return {
    id: "solana-pay",
    manifest: () => ({
      id: "solana-pay",
      label: `Solana Pay · ${net.label}`,
      description: "Scan the QR with Phantom or Solflare and pay in USDC. Confirms in seconds.",
      audience: ["human"],
      available: Boolean(env.SOLANA_PAY_TO),
      wallet: { chains: [{ id: net.caip2, name: net.label, rpc: rpcUrl(net, env), explorer: net.explorer, nativeSymbol: "SOL" }] },
      assets: [{ symbol: USDC.symbol, decimals: USDC.decimals }],
    }),

    async createIntent(price: Money, { id }: IntentOpts): Promise<Intent> {
      const to = payTo(env);
      const atomic = toAtomic(price.usd, USDC.decimals);
      const amount = fromAtomic(atomic, USDC.decimals);
      const reference = newReference();
      return {
        id,
        rail: "solana-pay",
        amount,
        asset: USDC.symbol,
        expiresAt: Date.now() + TTL,
        instructions: {
          kind: "solana-pay",
          url: solanaPayUrl({ to, amount, mint: net.usdc, reference, label: "Rent a Shell", message: `Session ${id.slice(0, 8)}` }),
          reference,
          to,
          amount,
          symbol: USDC.symbol,
        },
        meta: { reference, atomic: atomic.toString() },
      };
    },

    async check(intent: Intent): Promise<Payment | null> {
      const m = intent.meta as { reference: Address; atomic: string };
      const sigs = await rpc.getSignaturesForAddress(m.reference, { limit: 5 }).send();
      const to = payTo(env);
      for (const s of sigs) {
        if (s.err) continue;
        const tx = await rpc
          .getTransaction(signature(s.signature), { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" })
          .send();
        if (!tx || received(tx.meta as never, to, net.usdc) < BigInt(m.atomic)) continue;
        const keys = tx.transaction.message.accountKeys as readonly { pubkey: string; signer: boolean }[];
        return {
          intentId: intent.id,
          rail: "solana-pay",
          payer: keys.find((k) => k.signer)?.pubkey ?? "unknown",
          tx: s.signature,
          explorerUrl: net.explorerTx(s.signature),
          paidAt: Date.now(),
        };
      }
      return null;
    },
  };
}
