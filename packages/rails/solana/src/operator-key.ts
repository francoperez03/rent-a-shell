// Genera la wallet del operador del escrow y la guarda en apps/gateway/.env.local sin mostrar la clave.
// Imprime solo la address (para mandarle SOL de fees). Si ya hay una, no la pisa.
//   pnpm --filter @ras/rails-solana operator-key
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import anchor from "@coral-xyz/anchor";

const file = new URL("../../../../apps/gateway/.env.local", import.meta.url);
const cur = existsSync(file) ? readFileSync(file, "utf8") : "";
const line = cur.split("\n").find((l) => /^SOLANA_OPERATOR_KEY=\S+/.test(l));
if (line) {
  const kp = Keypair.fromSecretKey(anchor.utils.bytes.bs58.decode(line.split("=")[1].replace(/\s+#.*$/, "").trim()));
  console.log(`ya hay operador: ${kp.publicKey.toBase58()}`);
} else {
  const kp = Keypair.generate();
  appendFileSync(file, `${cur && !cur.endsWith("\n") ? "\n" : ""}SOLANA_OPERATOR_KEY=${anchor.utils.bytes.bs58.encode(kp.secretKey)}\n`, { mode: 0o600 });
  console.log(`operador creado: ${kp.publicKey.toBase58()} (mandale ~0,05 SOL para fees)`);
}
