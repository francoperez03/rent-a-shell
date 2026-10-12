// Riel solana-x402: agentes pagan USDC por x402 `exact` en Solana (@x402/svm 2.27.0).
// El facilitator (x402.org en devnet, PayAI en mainnet) paga el fee: el agente no necesita SOL.
// Flujo manual con x402HTTPResourceServer para liquidar ANTES de emitir la sesión:
// si el settle falla, el handler nunca corre y no queda un token regalado.
import type { MiddlewareHandler } from "hono";
import { HonoAdapter } from "@x402/hono";
import { HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer, type HTTPRequestContext } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { toAtomic, type Money, type PaymentRail } from "@ras/rails-core";
import { USDC, facilitatorUrl, payTo, rpcUrl, solNet } from "./config.ts";

type Env = Record<string, string | undefined>;

export function solanaX402(env: Env): PaymentRail {
  const net = solNet(env);
  const apiKey = env.X402_API_KEY ?? "";
  const facilitator = new HTTPFacilitatorClient({
    url: facilitatorUrl(net, env),
    // ponytail: x402.org (devnet) no pide key; PayAI en mainnet puede pedir una
    ...(apiKey && {
      createAuthHeaders: async () => {
        const h = { Authorization: `Bearer ${apiKey}` };
        return { verify: h, settle: h, supported: h };
      },
    }),
  });
  const resource = new x402ResourceServer(facilitator);
  resource.register(net.caip2, new ExactSvmScheme({ rpcUrl: rpcUrl(net, env) }));

  return {
    id: "solana-x402",
    manifest: () => ({
      id: "solana-x402",
      label: `USDC por x402 · ${net.label}`,
      description: "Para agentes: el endpoint responde 402, el agente firma la transferencia de USDC y el facilitator la envía y paga el fee. El agente no necesita SOL.",
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
// wallet con USDC en ${net.label}; no necesita SOL para el fee
const kp = await createKeyPairSignerFromBytes(getBase58Encoder().encode(process.env.SOLANA_KEY));
const client = new x402Client();
client.register("solana:*", new ExactSvmScheme(toClientSvmSigner(kp)));
const pay = wrapFetchWithPayment(fetch, client);
const grant = await (await pay("${url}", { method: "POST" })).json();
\`\`\``,

    paywall(path, priceFor: (q: Record<string, string>) => Money, description) {
      const to = payTo(env);
      const http = new x402HTTPResourceServer(resource, {
        [`POST ${path}`]: {
          accepts: {
            scheme: "exact",
            network: net.caip2,
            payTo: to,
            price: (ctx: HTTPRequestContext) => {
              const q = Object.fromEntries(
                Object.entries(ctx.adapter.getQueryParams?.() ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
              ) as Record<string, string>;
              return {
                amount: toAtomic(priceFor(q).usd, USDC.decimals).toString(),
                asset: net.usdc,
              };
            },
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
        const ctx = {
          adapter,
          path: c.req.path,
          method: c.req.method,
          paymentHeader: c.req.header("payment-signature") ?? c.req.header("x-payment"),
        };
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
          return new Response(JSON.stringify(s.response.body ?? { error: s.errorReason, message: s.errorMessage }), {
            status: s.response.status,
            headers: { ...s.response.headers, ...s.headers, "content-type": "application/json" },
          });
        }
        c.set("payment" as never, {
          intentId: crypto.randomUUID(),
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
