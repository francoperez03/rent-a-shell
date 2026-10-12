// solana-pay rail with escrow: the QR is a Solana Pay *transaction request*. The wallet asks the gateway
// for the tx, which builds a `deposit` into the shell_escrow program. When the session ends, finalize() releases
// it to the Forger (fee_bps to the treasury) or refunds the payer if the shell went down.
// Spec: https://docs.solanapay.com/spec#transaction-request
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import anchor, { type Idl } from "@coral-xyz/anchor";
// the package is CJS: values come from the default export
const { utils } = anchor;
import { fromAtomic, toAtomic, type IntentOpts, type Money, type Outcome, type PaymentRail } from "@ras/rails-core";
import type { Intent, Payment } from "@ras/shell-spec";
import { USDC, payTo, rpcUrl, solNet } from "./config.ts";
import { EscrowClient, escrowPda, sessionId } from "./escrow.ts";
import { newReference } from "./pay.ts";

type Env = Record<string, string | undefined>;
const TTL = 15 * 60_000;

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#000c29"/><path d="M18 44h28M24 44V28l8-8 8 8v16" stroke="#fff" stroke-width="4" fill="none"/></svg>`;

export function solanaPayEscrow(env: Env): PaymentRail {
  const net = solNet(env);
  const connection = new Connection(rpcUrl(net, env), "confirmed");
  const operator = Keypair.fromSecretKey(utils.bytes.bs58.decode(env.SOLANA_OPERATOR_KEY!.trim()));
  const client = new EscrowClient(connection, operator);
  const publicUrl = (env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 8787}`).replace(/\/$/, "");
  const holdSec = Number(env.ESCROW_HOLD_SECONDS ?? 6 * 3600); // time before the payer can reclaim (+1 h in the program)
  // ponytail: intents in memory; if the gateway restarts, open QRs (15 min) stop serving the tx
  const open = new Map<string, { atomic: bigint; reference: string; expiresAt: number }>();
  const forger = () => new PublicKey(payTo(env));
  const mint = new PublicKey(net.usdc);

  return {
    id: "solana-pay",
    manifest: () => ({
      id: "solana-pay",
      label: `Solana Pay · ${net.label}`,
      description: "Scan the QR with Phantom or Solflare and pay in USDC. The payment stays in escrow until your session ends: if the robot goes down, it goes back to your wallet.",
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
      open.set(id, { atomic, reference, expiresAt: Date.now() + TTL });
      return {
        id,
        rail: "solana-pay",
        amount,
        asset: USDC.symbol,
        expiresAt: Date.now() + TTL,
        // transaction request: the wallet GETs/POSTs this URL (no query, so no encoding needed)
        instructions: { kind: "solana-pay", url: `solana:${publicUrl}/api/rails/solana-pay/tx/${id}`, reference, to, amount, symbol: USDC.symbol },
        meta: { atomic: atomic.toString(), reference },
      };
    },

    async fetch(req: Request): Promise<Response> {
      const path = new URL(req.url).pathname;
      if (path.endsWith("/icon.svg")) return new Response(ICON, { headers: { "content-type": "image/svg+xml" } });
      const m = path.match(/\/tx\/([\w-]+)$/);
      const it = m && open.get(m[1]);
      const cors = { "access-control-allow-origin": "*", "content-type": "application/json" };
      if (!m || !it || Date.now() > it.expiresAt) return new Response(JSON.stringify({ error: "intent_not_found" }), { status: 404, headers: cors });
      if (req.method === "GET") {
        return new Response(JSON.stringify({ label: "Rent a Shell", icon: `${publicUrl}/api/rails/solana-pay/icon.svg` }), { headers: cors });
      }
      if (req.method !== "POST") return new Response(null, { status: 405, headers: cors });
      const body = (await req.json().catch(() => ({}))) as { account?: string };
      let payer: PublicKey;
      try {
        payer = new PublicKey(body.account ?? "");
      } catch {
        return new Response(JSON.stringify({ error: "invalid_account" }), { status: 400, headers: cors });
      }
      const transaction = await client.depositTx({
        intentId: m[1],
        payer,
        mint,
        amount: it.atomic,
        forger: forger(),
        expiresAt: Math.floor(Date.now() / 1000) + holdSec,
        reference: new PublicKey(it.reference),
      });
      return new Response(JSON.stringify({ transaction, message: `Rent a Shell session · ${fromAtomic(it.atomic, USDC.decimals)} USDC in escrow` }), { headers: cors });
    },

    async check(intent: Intent): Promise<Payment | null> {
      const e = await client.escrow(intent.id);
      const want = BigInt((intent.meta as { atomic: string }).atomic);
      if (!e || !e.state.funded || BigInt(e.amount.toString()) < want || !e.mint.equals(mint)) return null;
      open.delete(intent.id);
      const [sig] = await connection.getSignaturesForAddress(escrowPda(sessionId(intent.id)), { limit: 1 });
      return {
        intentId: intent.id,
        rail: "solana-pay",
        payer: e.payer.toBase58(),
        tx: sig?.signature,
        explorerUrl: sig ? net.explorerTx(sig.signature) : undefined,
        paidAt: Date.now(),
      };
    },

    async finalize(payment: Payment, outcome: Outcome) {
      const e = await client.escrow(payment.intentId);
      if (!e || !e.state.funded) return; // already closed (earlier settle/refund/reclaim): nothing to do
      const tx = outcome === "completed" ? await client.settle(payment.intentId) : await client.refund(payment.intentId);
      return { tx };
    },
  };
}
