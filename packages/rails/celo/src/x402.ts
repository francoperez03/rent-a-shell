// Riel celo-x402: agentes pagan USDC por x402 `exact` con el facilitator de Celo.
// Base: celo-org/x402-celo-example (seller.ts, facilitator.ts), @x402/* 2.27.0.
// Flujo manual con x402HTTPResourceServer para liquidar ANTES de emitir la sesión:
// si el settle falla, el handler nunca corre y no queda un token regalado.
import type { MiddlewareHandler } from "hono";
import { HonoAdapter } from "@x402/hono";
import { HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer, type HTTPRequestContext } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { toAtomic, type Money, type PaymentRail } from "@ras/rails-core";
import { USDC, celoNet, payTo, rpcUrl } from "./config.ts";

type Env = Record<string, string | undefined>;

export function celoX402(env: Env): PaymentRail {
  const net = celoNet(env);
  const apiKey = env.X402_API_KEY ?? "";
  const facilitator = new HTTPFacilitatorClient({
    url: env.CELO_X402_FACILITATOR_URL || net.facilitator,
    createAuthHeaders: async () => {
      const h: Record<string, string> = { "X-API-Key": apiKey };
      return { verify: h, settle: h, supported: h };
    },
  });
  const resource = new x402ResourceServer(facilitator);
  resource.register("eip155:*", new ExactEvmScheme());

  return {
    id: "celo-x402",
    manifest: () => ({
      id: "celo-x402",
      label: `USDC por x402 · ${net.label}`,
      description: "Para agentes: el endpoint responde 402, el agente firma EIP-3009 y el facilitator de Celo liquida. Sin gas para el agente.",
      audience: ["agent"],
      available: Boolean(apiKey && env.CELO_PAY_TO),
      wallet: { chains: [{ id: net.chain.id, name: net.label, rpc: rpcUrl(net, env), explorer: net.explorer, nativeSymbol: "CELO" }] },
      assets: [{ symbol: USDC.symbol, decimals: USDC.decimals }],
    }),

    clientExample: (url) => `\`\`\`ts
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
// wallet con USDC en ${net.label}; no necesita CELO para gas
const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(privateKeyToAccount(process.env.PK)));
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
                extra: { ...USDC.eip712 },
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
          rail: "celo-x402",
          payer: s.payer ?? "unknown",
          tx: s.transaction,
          explorerUrl: net.explorerTx + s.transaction,
          paidAt: Date.now(),
        } as never);
        await next();
        for (const [k, v] of Object.entries(s.headers)) c.res.headers.set(k, v);
      };
      return mw;
    },
  };
}
