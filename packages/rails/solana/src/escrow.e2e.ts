// End-to-end test of the solana-pay rail with escrow against a local validator with the program loaded:
//   solana-test-validator --reset --bpf-program <PROGRAM_ID> programs/target/deploy/shell_escrow.so
//   pnpm --filter @ras/rails-solana e2e
// Covers: QR (transaction request) → wallet signs deposit → check → finalize completed (90/10) and refund;
// x402 via escrow (spec 14): intent opens the escrow → transfer into the vault (stands in for the facilitator) →
// set_payer → finalize completed (90/10) and refund; a forged deposit is ignored (spec 10).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import anchor, { type Idl } from "@coral-xyz/anchor";
// the package is CJS: values come from the default export
const { AnchorProvider, Program, Wallet, utils } = anchor;
import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { createMint, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo, transferChecked } from "@solana/spl-token";
import idl from "./idl/shell_escrow.json" with { type: "json" };
import { EscrowClient, configPda, sessionId, vaultPda } from "./escrow.ts";
import { solanaPayEscrow } from "./pay-escrow.ts";
import { solanaX402 } from "./x402.ts";

const RPC = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
const c = new Connection(RPC, "confirmed");
// init_config only accepts ADMIN (spec 10): the local solana keypair, same as `anchor test`
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.ESCROW_ADMIN_KEYPAIR ?? `${homedir()}/.config/solana/id.json`, "utf8"))));
const [operator, payer, forger, treasury, stranger] = Array.from({ length: 5 }, () => Keypair.generate());
for (const k of [admin, operator, payer, stranger]) await c.confirmTransaction(await c.requestAirdrop(k.publicKey, 2 * LAMPORTS_PER_SOL));

const mint = await createMint(c, admin, admin.publicKey, null, 6);
const payerAta = await getOrCreateAssociatedTokenAccount(c, payer, mint, payer.publicKey);
await mintTo(c, admin, mint, payerAta.address, admin, 5_000_000);

// marketplace config: treasury + 10 %
const program = new Program(idl as Idl, new AnchorProvider(c, new Wallet(admin), { commitment: "confirmed" }));
if (!(await c.getAccountInfo(configPda()))) {
  await program.methods.initConfig(treasury.publicKey, 1000, mint).accountsPartial({ admin: admin.publicKey }).rpc();
} else {
  console.log("config already existed: run the validator with --reset");
  process.exit(1);
}

const env = {
  SOLANA_RPC_URL: RPC,
  SOLANA_USDC_MINT: mint.toBase58(),
  SOLANA_PAY_TO: forger.publicKey.toBase58(),
  SOLANA_OPERATOR_KEY: utils.bytes.bs58.encode(operator.secretKey),
  PUBLIC_URL: "https://gateway.test",
};
const rail = solanaPayEscrow(env);
const bal = async (owner: Keypair) => Number((await c.getTokenAccountBalance(getAssociatedTokenAddressSync(mint, owner.publicKey)).catch(() => ({ value: { amount: "0" } }))).value.amount);

async function payWithWallet(id: string) {
  const intent = await rail.createIntent!({ usd: "1.00" }, { id });
  assert.equal(intent.instructions.kind, "solana-pay");
  const url = (intent.instructions as { url: string }).url;
  assert.equal(url, `solana:https://gateway.test/api/rails/solana-pay/tx/${id}`);
  const get = await (await rail.fetch!(new Request(url.slice(7)))).json();
  assert.equal(get.label, "Rent a Shell");
  // what Phantom does: POST {account}, sign and send the tx the gateway returns
  const post = await (await rail.fetch!(new Request(url.slice(7), { method: "POST", body: JSON.stringify({ account: payer.publicKey.toBase58() }) }))).json();
  const tx = Transaction.from(Buffer.from(post.transaction, "base64"));
  tx.partialSign(payer);
  await c.confirmTransaction(await c.sendRawTransaction(tx.serialize()), "confirmed");
  const p = await rail.check!(intent);
  assert.ok(p, "the escrowed payment is detected");
  assert.equal(p!.payer, payer.publicKey.toBase58());
  return p!;
}

const p1 = await payWithWallet("intent-ok");
assert.equal(await bal(payer), 4_000_000);
const r1 = await rail.finalize!(p1, "completed");
assert.equal(await bal(forger), 900_000, "90 % to the Forger");
assert.equal(await bal(treasury), 100_000, "10 % to the platform");
assert.equal(await rail.finalize!(p1, "completed"), undefined, "finalize is idempotent");

const p2 = await payWithWallet("intent-caido");
assert.equal(await bal(payer), 3_000_000);
await rail.finalize!(p2, "refund");
assert.equal(await bal(payer), 4_000_000, "full refund if the shell drops");

// spec 10: the renter builds their own deposit for the intent (their key as operator, a past expires_at):
// funded on-chain, but check() ignores it, so no session opens and the gateway never tries a settle it cannot sign
const forged = await rail.createIntent!({ usd: "1.00" }, { id: "intent-forged" });
await program.methods
  .deposit(sessionId("intent-forged"), new anchor.BN(1_000_000), forger.publicKey, stranger.publicKey, new anchor.BN(Math.floor(Date.now() / 1000) - 7200))
  .accountsPartial({ payer: payer.publicKey, mint, payerToken: payerAta.address, tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID })
  .signers([payer])
  .rpc();
assert.equal(await bal(payer), 3_000_000, "the forged deposit did move funds");
assert.equal(await rail.check!(forged), null, "a deposit with a foreign operator does not open a session");

// ---- x402 via escrow (spec 14) ----
const x402 = solanaX402(env);
const client = new EscrowClient(c, operator);
async function payAsAgent(id: string) {
  const intent = await x402.createIntent!({ usd: "1.00" }, { id, shell: "el-tucu", blocks: 1 });
  assert.equal(intent.instructions.kind, "x402");
  assert.equal((intent.instructions as { url: string }).url, `https://gateway.test/api/sessions/x402?shell=el-tucu&blocks=1&intent=${id}`);
  const e0 = await client.escrow(id);
  assert.ok(e0?.state.opened, "the intent opened the escrow");
  // what the facilitator does with the agent's signed payload: one TransferChecked into payTo's ATA (the vault)
  await transferChecked(c, payer, payerAta.address, mint, vaultPda(mint, id), payer, 1_000_000, 6);
  // what the paywall does after processSettlement
  await client.setPayer(id, payer.publicKey);
  const e1 = await client.escrow(id);
  assert.ok(e1?.state.funded && e1.payer.equals(payer.publicKey), "funded with the payer recorded");
  return { intentId: id, rail: "solana-x402", payer: payer.publicKey.toBase58(), paidAt: Date.now() };
}
const f0 = await bal(forger);
const t0 = await bal(treasury);
const a1 = await payAsAgent("agent-ok");
assert.equal(await bal(payer), 2_000_000);
const lamports = await c.getBalance(operator.publicKey);
const ra = await x402.finalize!(a1, "completed");
assert.equal(await bal(forger), f0 + 900_000, "90 % to the Forger (x402)");
assert.equal(await bal(treasury), t0 + 100_000, "10 % to the platform (x402)");
assert.ok((await c.getBalance(operator.publicKey)) > lamports, "vault rent back to the operator");
assert.equal(await x402.finalize!(a1, "completed"), undefined, "finalize is idempotent");

const a2 = await payAsAgent("agent-caido");
assert.equal(await bal(payer), 1_000_000);
await x402.finalize!(a2, "refund");
assert.equal(await bal(payer), 2_000_000, "full refund to the agent if the shell drops");

// set_payer never ran (RPC lag after the facilitator settled): finalize records the payer from the Payment first
const late = await x402.createIntent!({ usd: "1.00" }, { id: "agent-late", shell: "el-tucu", blocks: 1 });
await transferChecked(c, payer, payerAta.address, mint, vaultPda(mint, late.id), payer, 1_000_000, 6);
await x402.finalize!({ intentId: late.id, rail: "solana-x402", payer: payer.publicKey.toBase58(), paidAt: Date.now() }, "refund");
assert.equal(await bal(payer), 2_000_000, "refund after a late set_payer");

console.log(`escrow e2e ok · settle ${(r1 as { tx: string }).tx.slice(0, 16)}… · forger 0.9 · treasury 0.1 · refund ok · foreign-operator deposit ignored · x402 via escrow: settle ${(ra as { tx: string }).tx.slice(0, 16)}… 90/10, refund ok, late set_payer ok`);
