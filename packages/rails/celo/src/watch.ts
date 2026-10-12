// Watcher de cobros por Transfer ERC-20 hacia PAY_TO (patrón esperarCobro() de pagos-placa/spike.mjs,
// con getLogs en vez de watch para que check() sea idempotente y sobreviva reinicios).
import { createPublicClient, http, parseAbiItem, type PublicClient } from "viem";
import type { CeloNet } from "./config.ts";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
// forno acepta rangos amplios; se pagina por si el intent es viejo.
const MAX_SPAN = 5_000n;

export function client(net: CeloNet, rpc: string): PublicClient {
  return createPublicClient({ chain: net.chain, transport: http(rpc) }) as PublicClient;
}

export interface Match { from: `0x${string}`; tx: `0x${string}`; value: bigint }

/** Busca un Transfer de `token` hacia `to` con valor exacto desde `fromBlock`. Ignora tx ya usadas. */
export async function findTransfer(
  pub: PublicClient,
  token: `0x${string}`,
  to: `0x${string}`,
  fromBlock: bigint,
  accept: (value: bigint) => boolean,
  used: Set<string>,
): Promise<Match | null> {
  const head = await pub.getBlockNumber();
  for (let start = fromBlock; start <= head; start += MAX_SPAN + 1n) {
    const end = start + MAX_SPAN > head ? head : start + MAX_SPAN;
    const logs = await pub.getLogs({ address: token, event: TRANSFER, args: { to }, fromBlock: start, toBlock: end });
    for (const l of logs) {
      const v = l.args.value ?? 0n;
      if (!used.has(l.transactionHash) && accept(v)) {
        return { from: l.args.from!, tx: l.transactionHash, value: v };
      }
    }
  }
  return null;
}
