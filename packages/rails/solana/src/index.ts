import type { RailFactory } from "@ras/rails-core";
import { solanaX402 } from "./x402.ts";
import { solanaPay } from "./pay.ts";

export const rails: Record<string, RailFactory> = {
  "solana-x402": solanaX402,
  "solana-pay": solanaPay,
};
