// ERC-8004 en Celo (docs.celo.org/build/agents/8004): Identity Registry, register(agentURI) → agentId.
import { celoNet } from "./config.ts";

type Env = Record<string, string | undefined>;

export const IDENTITY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "setAgentURI",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newURI", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;

/** Entradas `registrations` de la agent card, si ya se registró (CELO_AGENT_ID). */
export function registrations(env: Env) {
  if (!env.CELO_AGENT_ID) return [];
  const net = celoNet(env);
  return [{ agentId: Number(env.CELO_AGENT_ID), agentRegistry: `${net.caip2}:${net.identityRegistry}` }];
}
