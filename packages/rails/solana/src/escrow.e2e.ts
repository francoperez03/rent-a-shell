// Prueba de punta a punta del riel solana-pay con escrow contra un validador local con el programa cargado:
//   solana-test-validator --reset --bpf-program <PROGRAM_ID> programs/target/deploy/shell_escrow.so
//   pnpm --filter @ras/rails-solana e2e
// Cubre: QR (transaction request) → la wallet firma deposit → check → finalize completed (90/10) y refund.
import assert from "node:assert/strict";
import anchor, { type Idl } from "@coral-xyz/anchor";
// el paquete es CJS: los valores salen del default export
const { AnchorProvider, Program, Wallet, utils } = anchor;
import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { createMint, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import idl from "./idl/shell_escrow.json" with { type: "json" };
import { configPda } from "./escrow.ts";
import { solanaPayEscrow } from "./pay-escrow.ts";

const RPC = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
const c = new Connection(RPC, "confirmed");
const [admin, operator, payer, forger, treasury] = Array.from({ length: 5 }, () => Keypair.generate());
for (const k of [admin, operator, payer]) await c.confirmTransaction(await c.requestAirdrop(k.publicKey, 2 * LAMPORTS_PER_SOL));

const mint = await createMint(c, admin, admin.publicKey, null, 6);
const payerAta = await getOrCreateAssociatedTokenAccount(c, payer, mint, payer.publicKey);
await mintTo(c, admin, mint, payerAta.address, admin, 5_000_000);

// config del marketplace: tesorería + 10 %
const program = new Program(idl as Idl, new AnchorProvider(c, new Wallet(admin), { commitment: "confirmed" }));
if (!(await c.getAccountInfo(configPda()))) {
  await program.methods.initConfig(treasury.publicKey, 1000, mint).accountsPartial({ admin: admin.publicKey }).rpc();
} else {
  console.log("config ya existía: usá --reset en el validador");
  process.exit(1);
}

const rail = solanaPayEscrow({
  SOLANA_RPC_URL: RPC,
  SOLANA_USDC_MINT: mint.toBase58(),
  SOLANA_PAY_TO: forger.publicKey.toBase58(),
  SOLANA_OPERATOR_KEY: utils.bytes.bs58.encode(operator.secretKey),
  PUBLIC_URL: "https://gateway.test",
});
const bal = async (owner: Keypair) => Number((await c.getTokenAccountBalance(getAssociatedTokenAddressSync(mint, owner.publicKey)).catch(() => ({ value: { amount: "0" } }))).value.amount);

async function payWithWallet(id: string) {
  const intent = await rail.createIntent!({ usd: "1.00" }, { id });
  assert.equal(intent.instructions.kind, "solana-pay");
  const url = (intent.instructions as { url: string }).url;
  assert.equal(url, `solana:https://gateway.test/api/rails/solana-pay/tx/${id}`);
  const get = await (await rail.fetch!(new Request(url.slice(7)))).json();
  assert.equal(get.label, "Rent a Shell");
  // lo que hace Phantom: POST {account}, firma y envía la tx que devuelve el gateway
  const post = await (await rail.fetch!(new Request(url.slice(7), { method: "POST", body: JSON.stringify({ account: payer.publicKey.toBase58() }) }))).json();
  const tx = Transaction.from(Buffer.from(post.transaction, "base64"));
  tx.partialSign(payer);
  await c.confirmTransaction(await c.sendRawTransaction(tx.serialize()), "confirmed");
  const p = await rail.check!(intent);
  assert.ok(p, "el pago en escrow se detecta");
  assert.equal(p!.payer, payer.publicKey.toBase58());
  return p!;
}

const p1 = await payWithWallet("intent-ok");
assert.equal(await bal(payer), 4_000_000);
const r1 = await rail.finalize!(p1, "completed");
assert.equal(await bal(forger), 900_000, "90 % al Forger");
assert.equal(await bal(treasury), 100_000, "10 % a la plataforma");
assert.equal(await rail.finalize!(p1, "completed"), undefined, "finalize es idempotente");

const p2 = await payWithWallet("intent-caido");
assert.equal(await bal(payer), 3_000_000);
await rail.finalize!(p2, "refund");
assert.equal(await bal(payer), 4_000_000, "reembolso completo si el shell se cae");

console.log(`escrow e2e ok · settle ${(r1 as { tx: string }).tx.slice(0, 16)}… · forger 0.9 · tesorería 0.1 · refund ok`);
