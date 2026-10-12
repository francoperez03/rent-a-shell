// Registra Rent a Shell en el Identity Registry ERC-8004 de Celo. Lo corre Franco con su key.
//   CELO_OWNER_PK=0x... AGENT_CARD_URL=https://<url-publica>/.well-known/agent.json pnpm --filter @ras/rails-celo register-8004
// Después: poner CELO_AGENT_ID=<id> en apps/gateway/.env.local (la card pasa a incluir `registrations`).
import { createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withAttribution } from "@celo/attribution-tags";
import { celoNet, rpcUrl } from "./config.ts";
import { attributionCode } from "./attribution.ts";
import { IDENTITY_ABI } from "./erc8004.ts";

const env = process.env;
const pk = env.CELO_OWNER_PK as `0x${string}` | undefined;
const uri = env.AGENT_CARD_URL;
if (!pk || !uri) {
  console.error("Faltan CELO_OWNER_PK y AGENT_CARD_URL.");
  process.exit(1);
}
const net = celoNet(env);
const account = privateKeyToAccount(pk);
const transport = http(rpcUrl(net, env));
const pub = createPublicClient({ chain: net.chain, transport });
const wallet = createWalletClient({ account, chain: net.chain, transport }).extend(withAttribution(attributionCode(env)));

const card = await fetch(uri).then((r) => (r.ok ? r.json() : null)).catch(() => null);
if (!card?.name) {
  console.error(`La agent card no responde en ${uri}. Levantá el gateway y el túnel primero.`);
  process.exit(1);
}

console.log(`Registrando "${card.name}" en ${net.label} (${net.identityRegistry}) desde ${account.address}`);
const { request } = await pub.simulateContract({ account, address: net.identityRegistry, abi: IDENTITY_ABI, functionName: "register", args: [uri] });
const hash = await wallet.writeContract(request);
const receipt = await pub.waitForTransactionReceipt({ hash });
const [ev] = parseEventLogs({ abi: IDENTITY_ABI, eventName: "Registered", logs: receipt.logs });
console.log("tx:", net.explorerTx + hash);
console.log("agentId:", ev?.args.agentId?.toString());
console.log("Siguiente: CELO_AGENT_ID=" + ev?.args.agentId + " en apps/gateway/.env.local");
