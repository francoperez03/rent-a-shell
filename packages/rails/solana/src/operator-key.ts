// Generates the escrow operator wallet and stores it in apps/gateway/.env.local without showing the key.
// Prints only the address (to send it SOL for fees). If one already exists, it is kept.
//   pnpm --filter @ras/rails-solana operator-key
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import anchor from "@coral-xyz/anchor";

const file = new URL("../../../../apps/gateway/.env.local", import.meta.url);
const cur = existsSync(file) ? readFileSync(file, "utf8") : "";
const line = cur.split(/\r?\n/).find((l) => /^SOLANA_OPERATOR_KEY=\S+/.test(l));
if (line) {
  const kp = Keypair.fromSecretKey(anchor.utils.bytes.bs58.decode(line.split("=")[1].replace(/\s+#.*$/, "").trim()));
  console.log(`operator already set: ${kp.publicKey.toBase58()}`);
} else {
  const kp = Keypair.generate();
  appendFileSync(file, `${cur && !cur.endsWith("\n") ? "\n" : ""}SOLANA_OPERATOR_KEY=${anchor.utils.bytes.bs58.encode(kp.secretKey)}\n`, { mode: 0o600 });
  console.log(`operator created: ${kp.publicKey.toBase58()} (send it ~0.05 SOL for fees)`);
}
