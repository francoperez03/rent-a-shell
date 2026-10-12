import type { RailFactory } from "@ras/rails-core";
import { solanaX402 } from "./x402.ts";
import { solanaPay } from "./pay.ts";
import { solanaPayEscrow } from "./pay-escrow.ts";

export const rails: Record<string, RailFactory> = {
  "solana-x402": solanaX402,
  // with an operator, human payments go to the escrow program; without one, direct transfer (local dev)
  "solana-pay": (env) => (env.SOLANA_OPERATOR_KEY ? solanaPayEscrow(env) : solanaPay(env)),
};
