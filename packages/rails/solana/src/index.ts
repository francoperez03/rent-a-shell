import type { RailFactory } from "@ras/rails-core";
import { solanaX402 } from "./x402.ts";
import { solanaPay } from "./pay.ts";
import { solanaPayEscrow } from "./pay-escrow.ts";

export const rails: Record<string, RailFactory> = {
  "solana-x402": solanaX402,
  // con operador el pago de personas va al programa de escrow; sin él, transferencia directa (dev local)
  "solana-pay": (env) => (env.SOLANA_OPERATOR_KEY ? solanaPayEscrow(env) : solanaPay(env)),
};
