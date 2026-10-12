// Configures the marketplace in the escrow program (once per network): treasury, fee and USDC mint.
//   ESCROW_ADMIN_KEY=<secret base58> ESCROW_TREASURY=<address> pnpm --filter @ras/rails-solana init-escrow
// FEE_BPS defaults to 1000 (10 %). If the config already exists, it is updated (admin only).
import anchor, { type Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import idl from "./idl/shell_escrow.json" with { type: "json" };
import { configPda } from "./escrow.ts";
import { rpcUrl, solNet } from "./config.ts";

// the package is CJS: values come from the default export
const { AnchorProvider, Program, Wallet, utils } = anchor;
const env = process.env;
if (!env.ESCROW_ADMIN_KEY || !env.ESCROW_TREASURY) {
  console.error("Missing ESCROW_ADMIN_KEY and ESCROW_TREASURY.");
  process.exit(1);
}
const net = solNet(env);
const c = new Connection(rpcUrl(net, env), "confirmed");
const admin = Keypair.fromSecretKey(utils.bytes.bs58.decode(env.ESCROW_ADMIN_KEY.trim()));
const program = new Program(idl as Idl, new AnchorProvider(c, new Wallet(admin), { commitment: "confirmed" }));
const treasury = new PublicKey(env.ESCROW_TREASURY);
const fee = Number(env.FEE_BPS ?? 1000);
const mint = new PublicKey(net.usdc);
const exists = Boolean(await c.getAccountInfo(configPda()));
const tx = exists
  ? await program.methods.updateConfig(treasury, fee, mint).accountsPartial({ admin: admin.publicKey }).rpc()
  : await program.methods.initConfig(treasury, fee, mint).accountsPartial({ admin: admin.publicKey }).rpc();
console.log(`${exists ? "update" : "init"}_config on ${net.label}: treasury ${treasury.toBase58()}, ${fee / 100} %, USDC ${mint.toBase58()}`);
console.log(net.explorerTx(tx));
