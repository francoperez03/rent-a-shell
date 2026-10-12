import type { RailFactory } from "@ras/rails-core";
import { celoX402 } from "./x402.ts";
import { celoWallet, ripio } from "./wallet.ts";
import { registrations } from "./erc8004.ts";
import { celoNet } from "./config.ts";

export const rails: Record<string, RailFactory> = {
  "celo-x402": celoX402,
  "celo-wallet": celoWallet,
  ripio,
};

/** Identidad on-chain para la agent card (ERC-8004). */
export function identity(env: Record<string, string | undefined>) {
  return { registrations: registrations(env), network: celoNet(env).label };
}
