// The only place in the repo with Solana mints, CAIP-2 networks and URLs (spec 08).
// Sources: @x402/svm 2.27.0 (default assets), /supported from x402.org and PayAI (2026-10-12).
import { address, type Address } from "@solana/kit";

export interface SolNet {
  key: "devnet" | "mainnet";
  caip2: `solana:${string}`;
  label: string;
  rpc: string;
  facilitator: string;
  usdc: Address;
  explorerTx: (sig: string) => string;
  explorerAccount: (address: string) => string;
  explorer: string;
}

export const NETWORKS: Record<SolNet["key"], SolNet> = {
  devnet: {
    key: "devnet",
    caip2: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    label: "Solana Devnet",
    rpc: "https://api.devnet.solana.com",
    facilitator: "https://x402.org/facilitator",
    usdc: address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
    explorerTx: (sig) => `https://solscan.io/tx/${sig}?cluster=devnet`,
    explorerAccount: (a) => `https://solscan.io/account/${a}?cluster=devnet`,
    explorer: "https://solscan.io/?cluster=devnet",
  },
  mainnet: {
    key: "mainnet",
    caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    label: "Solana",
    rpc: "https://api.mainnet-beta.solana.com",
    facilitator: "https://facilitator.payai.network",
    usdc: address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    explorerTx: (sig) => `https://solscan.io/tx/${sig}`,
    explorerAccount: (a) => `https://solscan.io/account/${a}`,
    explorer: "https://solscan.io",
  },
};

export const USDC = { symbol: "USDC", decimals: 6 } as const;

type Env = Record<string, string | undefined>;

export function solNet(env: Env): SolNet {
  const net = NETWORKS[env.SOLANA_NETWORK === "mainnet" ? "mainnet" : "devnet"];
  // ponytail: mint override only for the local validator (escrow tests); unused on devnet/mainnet
  return env.SOLANA_USDC_MINT ? { ...net, usdc: address(env.SOLANA_USDC_MINT) } : net;
}

export function rpcUrl(net: SolNet, env: Env) {
  return env.SOLANA_RPC_URL || net.rpc;
}

export function facilitatorUrl(net: SolNet, env: Env) {
  return env.X402_FACILITATOR_URL || net.facilitator;
}

export function payTo(env: Env): Address {
  const v = env.SOLANA_PAY_TO;
  if (!v) throw new Error("Missing SOLANA_PAY_TO: the wallet that gets paid (shell owner).");
  return address(v);
}
