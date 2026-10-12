import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createMint, getAccount, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { expect } from "chai";
import { ShellEscrow } from "../target/types/shell_escrow";

describe("shell-escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.ShellEscrow as Program<ShellEscrow>;
  const conn = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const payer = Keypair.generate();
  const operator = Keypair.generate();
  const stranger = Keypair.generate();
  const forger = Keypair.generate().publicKey;
  const treasury = Keypair.generate().publicKey;
  let mint: PublicKey;
  let payerToken: PublicKey;

  const USDC = (n: number) => new BN(n * 1_000_000);
  const sid = () => Array.from(Keypair.generate().publicKey.toBytes());
  const escrowPda = (s: number[]) => PublicKey.findProgramAddressSync([Buffer.from("escrow"), Buffer.from(s)], program.programId)[0];
  const bal = async (owner: PublicKey) => {
    try {
      return Number((await getAccount(conn, getAssociatedTokenAddressSync(mint, owner))).amount);
    } catch {
      return 0;
    }
  };
  const fails = async (p: Promise<unknown>, code: string) => {
    try {
      await p;
    } catch (e) {
      expect(String((e as Error).message ?? e)).to.include(code);
      return;
    }
    expect.fail(`esperaba ${code}`);
  };

  async function deposit(amount: BN, expiresAt: number, m = mint, from = payerToken) {
    const s = sid();
    await program.methods
      .deposit(s, amount, forger, operator.publicKey, new BN(expiresAt))
      .accounts({ payer: payer.publicKey, mint: m, payerToken: from, tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID })
      .signers([payer])
      .rpc();
    return s;
  }
  const settle = (s: number[], op = operator) =>
    program.methods
      .settle()
      .accountsPartial({ operator: op.publicKey, escrow: escrowPda(s), mint, forger, treasury, payer: payer.publicKey, tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID })
      .signers([op])
      .rpc();
  const refund = (s: number[]) =>
    program.methods
      .refund()
      .accountsPartial({ operator: operator.publicKey, escrow: escrowPda(s), mint, payer: payer.publicKey, tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID })
      .signers([operator])
      .rpc();
  const reclaim = (s: number[]) =>
    program.methods
      .reclaim()
      .accountsPartial({ caller: stranger.publicKey, escrow: escrowPda(s), mint, payer: payer.publicKey, tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID })
      .signers([stranger])
      .rpc();
  const now = () => Math.floor(Date.now() / 1000);

  before(async () => {
    for (const k of [payer, operator, stranger]) {
      await conn.confirmTransaction(await conn.requestAirdrop(k.publicKey, 2 * LAMPORTS_PER_SOL));
    }
    mint = await createMint(conn, admin, admin.publicKey, null, 6);
    payerToken = (await getOrCreateAssociatedTokenAccount(conn, admin, mint, payer.publicKey)).address;
    await mintTo(conn, admin, mint, payerToken, admin, 100_000_000);
    await program.methods.initConfig(treasury, 1000, mint).accounts({ admin: admin.publicKey }).rpc();
  });

  it("settle reparte 90/10 entre Forger y tesorería", async () => {
    const s = await deposit(USDC(1), now() + 300);
    await settle(s);
    expect(await bal(forger)).to.equal(900_000);
    expect(await bal(treasury)).to.equal(100_000);
    expect((await program.account.escrow.fetch(escrowPda(s))).state).to.deep.equal({ settled: {} });
  });

  it("refund devuelve todo al payer", async () => {
    const before = await bal(payer.publicKey);
    const s = await deposit(USDC(2), now() + 300);
    expect(await bal(payer.publicKey)).to.equal(before - 2_000_000);
    await refund(s);
    expect(await bal(payer.publicKey)).to.equal(before);
    expect((await program.account.escrow.fetch(escrowPda(s))).state).to.deep.equal({ refunded: {} });
  });

  it("reclaim falla antes de expires_at + 1 h y funciona después", async () => {
    const early = await deposit(USDC(1), now() + 300);
    await fails(reclaim(early), "NotReclaimableYet");
    const before = await bal(payer.publicKey);
    const late = await deposit(USDC(1), now() - 7200);
    await reclaim(late);
    expect(await bal(payer.publicKey)).to.equal(before);
  });

  it("un operator ajeno no puede liquidar", async () => {
    const s = await deposit(USDC(1), now() + 300);
    await fails(settle(s, stranger), "WrongOperator");
  });

  it("no se puede liquidar dos veces", async () => {
    const s = await deposit(USDC(1), now() + 300);
    await settle(s);
    const f = await bal(forger);
    // el vault ya está cerrado, así que Anchor corta antes de llegar al chequeo de estado (InvalidState)
    await fails(settle(s), "AccountNotInitialized");
    expect(await bal(forger)).to.equal(f);
  });

  it("rechaza un mint distinto del configurado", async () => {
    const other = await createMint(conn, admin, admin.publicKey, null, 6);
    const otherToken = (await getOrCreateAssociatedTokenAccount(conn, admin, other, payer.publicKey)).address;
    await mintTo(conn, admin, other, otherToken, admin, 5_000_000);
    await fails(deposit(USDC(1), now() + 300, other, otherToken), "WrongMint");
  });

  it("rechaza monto cero", async () => {
    await fails(deposit(new BN(0), now() + 300), "ZeroAmount");
  });
});
