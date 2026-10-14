// solana-x402 rail: agents pay USDC via x402 `exact` on Solana (@x402/svm 2.27.0).
// The facilitator (x402.org on devnet, PayAI on mainnet) pays the fee: the agent needs no SOL.
// Manual flow with x402HTTPResourceServer to settle BEFORE issuing the session:
// if settle fails, the handler never runs and no free token is left behind.
//
// With SOLANA_OPERATOR_KEY (spec 14) the payment goes through the shell_escrow program: the agent first creates an
// intent, the rail opens an escrow for it, and the 402 for that intent asks the facilitator to pay the escrow's
// vault (payTo = escrow PDA, extra.memo = intent id). After settlement the rail records the payer; the session's
// end settles 90/10 or refunds, same as Solana Pay. Without an operator the agent pays the Forger directly, no fee.
import type { MiddlewareHandler } from "hono";
import { HonoAdapter } from "@x402/hono";
import { HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer, type HTTPRequestContext } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import anchor from "@coral-xyz/anchor";
// the package is CJS: values come from the default export
const { utils } = anchor;
import { fromAtomic, toAtomic, type IntentOpts, type Money, type Outcome, type PaymentRail } from "@ras/rails-core";
import type { Intent, Payment } from "@ras/shell-spec";
import { USDC, facilitatorUrl, payTo, rpcUrl, solNet } from "./config.ts";
import { EscrowClient, escrowPda, sessionId } from "./escrow.ts";

type Env = Record<string, string | undefined>;
const TTL = 15 * 60_000;
type Ctx = HTTPRequestContext & { intent?: { id: string; atomic: bigint } };

export function solanaX402(env: Env): PaymentRail {
  const net = solNet(env);
  const apiKey = env.X402_API_KEY ?? "";
  const facilitator = new HTTPFacilitatorClient({
    url: facilitatorUrl(net, env),
    // ponytail: x402.org (devnet) needs no key; PayAI on mainnet may ask for one
    ...(apiKey && {
      createAuthHeaders: async () => {
        const h = { Authorization: `Bearer ${apiKey}` };
        return { verify: h, settle: h, supported: h };
      },
    }),
  });
  const resource = new x402ResourceServer(facilitator);
  resource.register(net.caip2, new ExactSvmScheme({ rpcUrl: rpcUrl(net, env) }));

  // escrow mode (spec 14)
  const escrow = env.SOLANA_OPERATOR_KEY
    ? new EscrowClient(new Connection(rpcUrl(net, env), "confirmed"), Keypair.fromSecretKey(utils.bytes.bs58.decode(env.SOLANA_OPERATOR_KEY.trim())))
    : null;
  const publicUrl = (env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 8787}`).replace(/\/$/, "");
  const holdSec = Number(env.ESCROW_HOLD_SECONDS ?? 6 * 3600);
  const mint = new PublicKey(net.usdc);
  // ponytail: open intents in memory; after a restart the paywall reads the Opened escrow back from the chain
  const open = new Map<string, { atomic: bigint; expiresAt: number }>();
  async function intentFor(id: string | undefined) {
    if (!id || !escrow) return undefined;
    const it = open.get(id);
    if (it && Date.now() <= it.expiresAt) return { id, atomic: it.atomic };
    const e = await escrow.escrow(id);
    return e?.state.opened ? { id, atomic: BigInt(e.amount.toString()) } : undefined;
  }
  const query = (ctx: HTTPRequestContext) =>
    Object.fromEntries(Object.entries(ctx.adapter.getQueryParams?.() ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string>;
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json" } });

  return {
    id: "solana-x402",
    manifest: () => ({
      id: "solana-x402",
      label: `USDC via x402 · ${net.label}`,
      description: escrow
        ? "For agents: create an intent, POST its URL to get a 402, sign the USDC transfer and the facilitator submits it into the session's escrow and pays the fee. The agent needs no SOL. If the robot drops, the escrow refunds you."
        : "For agents: the endpoint answers 402, the agent signs the USDC transfer and the facilitator submits it and pays the fee. The agent needs no SOL.",
      audience: ["agent"],
      available: Boolean(env.SOLANA_PAY_TO),
      wallet: { chains: [{ id: net.caip2, name: net.label, rpc: rpcUrl(net, env), explorer: net.explorer, nativeSymbol: "SOL" }] },
      assets: [{ symbol: USDC.symbol, decimals: USDC.decimals }],
    }),

    clientExample: (url) => `\`\`\`ts
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { toClientSvmSigner } from "@x402/svm";
import { createKeyPairSignerFromBytes, getBase58Encoder } from "@solana/kit";
// wallet with USDC on ${net.label}; no SOL needed for the fee
const kp = await createKeyPairSignerFromBytes(getBase58Encoder().encode(process.env.SOLANA_KEY));
const client = new x402Client();
client.register("solana:*", new ExactSvmScheme(toClientSvmSigner(kp)));
const pay = wrapFetchWithPayment(fetch, client);
${
  escrow
    ? `// 1) the intent opens an escrow for this session; its URL is the x402 endpoint bound to it (valid 15 min)
const u = new URL("${url}");
const { intent } = await (await fetch(\`\${u.origin}/api/sessions/intent\`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shell: u.searchParams.get("shell"), blocks: Number(u.searchParams.get("blocks")), rail: "solana-x402" }) })).json();
// 2) pay it
const grant = await (await pay(intent.instructions.url, { method: "POST" })).json();`
    : `const grant = await (await pay("${url}", { method: "POST" })).json();`
}
\`\`\``,

    ...(escrow && {
      async createIntent(price: Money, { id, shell, blocks }: IntentOpts): Promise<Intent> {
        const atomic = toAtomic(price.usd, USDC.decimals);
        await escrow.open({ intentId: id, mint, amount: atomic, forger: new PublicKey(payTo(env)), expiresAt: Math.floor(Date.now() / 1000) + holdSec });
        open.set(id, { atomic, expiresAt: Date.now() + TTL });
        const q = new URLSearchParams({ ...(shell && { shell }), ...(blocks && { blocks: String(blocks) }), intent: id });
        return {
          id,
          rail: "solana-x402",
          amount: fromAtomic(atomic, USDC.decimals),
          asset: USDC.symbol,
          expiresAt: Date.now() + TTL,
          instructions: { kind: "x402", url: `${publicUrl}/api/sessions/x402?${q}` },
          meta: { atomic: atomic.toString(), escrow: escrowPda(sessionId(id)).toBase58() },
        };
      },
      finalize: (p: Payment, outcome: Outcome) => escrow.finalize(p.intentId, outcome, p.payer),
    }),

    paywall(path, priceFor: (q: Record<string, string>) => Money, description) {
      const to = payTo(env);
      const http = new x402HTTPResourceServer(resource, {
        [`POST ${path}`]: {
          accepts: {
            scheme: "exact",
            network: net.caip2,
            // per request: the intent's escrow vault, or the Forger's wallet without escrow
            payTo: (ctx: Ctx) => (ctx.intent ? escrowPda(sessionId(ctx.intent.id)).toBase58() : to),
            price: (ctx: Ctx) =>
              ctx.intent
                ? { amount: ctx.intent.atomic.toString(), asset: net.usdc, extra: { memo: ctx.intent.id } }
                : { amount: toAtomic(priceFor(query(ctx)).usd, USDC.decimals).toString(), asset: net.usdc },
          },
          description,
          mimeType: "application/json",
        },
      } as never);
      let ready: Promise<void> | null = null;

      const mw: MiddlewareHandler = async (c, next) => {
        ready ??= http.initialize().catch((e) => {
          ready = null;
          throw e;
        });
        await ready;
        const adapter = new HonoAdapter(c);
        const ctx: Ctx = {
          adapter,
          path: c.req.path,
          method: c.req.method,
          paymentHeader: c.req.header("payment-signature") ?? c.req.header("x-payment"),
        };
        if (escrow) {
          const id = c.req.query("intent");
          if (!id) return json(402, { error: "intent_required", create: "POST /api/sessions/intent", body: { shell: c.req.query("shell"), blocks: Number(c.req.query("blocks") ?? 1), rail: "solana-x402" } });
          ctx.intent = await intentFor(id);
          if (!ctx.intent) return json(404, { error: "intent_not_found", create: "POST /api/sessions/intent" });
        }
        const r = await http.processHTTPRequest(ctx);
        if (r.type === "payment-error") {
          return new Response(
            typeof r.response.body === "string" ? r.response.body : JSON.stringify(r.response.body ?? {}),
            { status: r.response.status, headers: { ...r.response.headers, "content-type": "application/json" } },
          );
        }
        if (r.type === "no-payment-required") return next();

        const s = await http.processSettlement(
          r.paymentPayload,
          r.paymentRequirements,
          r.declaredExtensions,
          { request: ctx },
          undefined,
          r.beforeHandlerSettlement,
        );
        if (!s.success) {
          return json(s.response.status, s.response.body ?? { error: s.errorReason, message: s.errorMessage }, { ...s.response.headers, ...s.headers });
        }
        if (escrow && ctx.intent) {
          // the facilitator's transfer is in the vault: record the payer so refund has a destination.
          // If the RPC lags, finalize() retries it with Payment.payer before settling.
          open.delete(ctx.intent.id);
          for (let i = 0; i < 3; i++) {
            try {
              await escrow.setPayer(ctx.intent.id, new PublicKey(s.payer ?? ""));
              break;
            } catch (e) {
              console.error(`[solana-x402] set_payer ${ctx.intent.id} (${i + 1}/3):`, (e as Error).message);
              await new Promise((r) => setTimeout(r, 1500));
            }
          }
        }
        c.set("payment" as never, {
          intentId: ctx.intent?.id ?? crypto.randomUUID(),
          rail: "solana-x402",
          payer: s.payer ?? "unknown",
          tx: s.transaction,
          explorerUrl: net.explorerTx(s.transaction),
          paidAt: Date.now(),
        } as never);
        await next();
        for (const [k, v] of Object.entries(s.headers)) c.res.headers.set(k, v);
      };
      return mw;
    },
  };
}
