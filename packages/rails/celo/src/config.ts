// Único lugar del repo con addresses, chain IDs y URLs de Celo (spec 08).
// Fuentes: celo-org/x402-celo-example/src/config.ts, docs.celo.org/build/agents/8004, pagos-placa/README.md.
import { getAddress, type Chain } from "viem";
import { celo, celoSepolia } from "viem/chains";

export interface CeloNet {
  key: "sepolia" | "mainnet";
  chain: Chain;
  caip2: `eip155:${number}`;
  label: string;
  rpc: string;
  facilitator: string;
  explorerTx: string;
  explorer: string;
  usdc: `0x${string}`;
  wars?: `0x${string}`;       // solo mainnet
  identityRegistry: `0x${string}`;
}

export const NETWORKS: Record<CeloNet["key"], CeloNet> = {
  sepolia: {
    key: "sepolia",
    chain: celoSepolia,
    caip2: "eip155:11142220",
    label: "Celo Sepolia",
    rpc: "https://forno.celo-sepolia.celo-testnet.org",
    facilitator: "https://api.x402.sepolia.celo.org",
    explorerTx: "https://celo-sepolia.blockscout.com/tx/",
    explorer: "https://celo-sepolia.blockscout.com",
    usdc: getAddress("0x01C5C0122039549AD1493B8220cABEdD739BC44E"),
    identityRegistry: getAddress("0x8004A818BFB912233c491871b3d84c89A494BD9e"),
  },
  mainnet: {
    key: "mainnet",
    chain: celo,
    caip2: "eip155:42220",
    label: "Celo",
    rpc: "https://forno.celo.org",
    facilitator: "https://api.x402.celo.org",
    explorerTx: "https://celoscan.io/tx/",
    explorer: "https://celoscan.io",
    usdc: getAddress("0xcebA9300f2b948710d2653dD7B07f33A8B32118C"),
    wars: getAddress("0x0dc4f92879b7670e5f4e4e6e3c801d229129d90d"),
    identityRegistry: getAddress("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"),
  },
};

export const USDC = { symbol: "USDC", decimals: 6, eip712: { name: "USDC", version: "2" } } as const;
export const WARS = { symbol: "wARS", decimals: 18 } as const;
export const USDT_MAINNET = getAddress("0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e");
export const TEXTILE = "https://api.textilecredit.com/v2";
export const RIPIO_RAMP = "https://ramp.ripio.com/";

export function celoNet(env: Record<string, string | undefined>): CeloNet {
  return NETWORKS[env.CELO_NETWORK === "mainnet" ? "mainnet" : "sepolia"];
}

export function rpcUrl(net: CeloNet, env: Record<string, string | undefined>) {
  return env.CELO_RPC_URL || net.rpc;
}

export function payTo(env: Record<string, string | undefined>): `0x${string}` {
  const v = env.CELO_PAY_TO;
  if (!v) throw new Error("Falta CELO_PAY_TO: la address que cobra (wallet del dueño del shell).");
  return getAddress(v);
}
