// Registers (or updates) this gateway's shell in the escrow program (spec 15). The gateway does the same on start;
// this script is for doing it by hand or checking the record.
//   pnpm --filter @ras/rails-solana register-shell          (reads apps/gateway/.env.local)
// Needs SOLANA_OPERATOR_KEY and SOLANA_PAY_TO; SHELL_ID, BLOCK_USD and BLOCK_MINUTES as the gateway uses them.
import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { EscrowClient, shellPda, shellRegistry } from "./escrow.ts";
import { payTo, rpcUrl, solNet } from "./config.ts";

// the package is CJS: values come from the default export
const { utils } = anchor;
const env = process.env;
if (!env.SOLANA_OPERATOR_KEY) {
  console.error("Missing SOLANA_OPERATOR_KEY.");
  process.exit(1);
}
const net = solNet(env);
const client = new EscrowClient(new Connection(rpcUrl(net, env), "confirmed"), Keypair.fromSecretKey(utils.bytes.bs58.decode(env.SOLANA_OPERATOR_KEY.trim())));
const registry = shellRegistry(client, net, new PublicKey(payTo(env)));
const shell = { id: env.SHELL_ID ?? "el-tucu", pricing: { usd: env.BLOCK_USD ?? "0.05", block_minutes: Number(env.BLOCK_MINUTES ?? 5) } };
await registry.register(shell);
const r = await registry.reputation(shell.id);
console.log(`shell ${shell.id} registered on ${net.label}: ${shellPda(shell.id).toBase58()} · USD ${shell.pricing.usd} per ${shell.pricing.block_minutes} min · ${r?.completed} completed, ${r?.refunded} refunded`);
console.log(r?.explorer);
