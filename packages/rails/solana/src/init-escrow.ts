// Configura el marketplace en el programa de escrow (una sola vez por red): tesorería, comisión y mint de USDC.
//   ESCROW_ADMIN_KEY=<secret base58> ESCROW_TREASURY=<address> pnpm --filter @ras/rails-solana init-escrow
// FEE_BPS por defecto 1000 (10 %). Si la config ya existe, la actualiza (solo el admin puede).
import anchor, { type Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import idl from "./idl/shell_escrow.json" with { type: "json" };
import { configPda } from "./escrow.ts";
import { rpcUrl, solNet } from "./config.ts";

// el paquete es CJS: los valores salen del default export
const { AnchorProvider, Program, Wallet, utils } = anchor;
const env = process.env;
if (!env.ESCROW_ADMIN_KEY || !env.ESCROW_TREASURY) {
  console.error("Faltan ESCROW_ADMIN_KEY y ESCROW_TREASURY.");
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
console.log(`${exists ? "update" : "init"}_config en ${net.label}: tesorería ${treasury.toBase58()}, ${fee / 100} %, USDC ${mint.toBase58()}`);
console.log(net.explorerTx(tx));
