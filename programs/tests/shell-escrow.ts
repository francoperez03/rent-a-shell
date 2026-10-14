import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createMint, getAccount, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo, transferChecked } from "@solana/spl-token";
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
  let strangerInit: unknown;

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
  // spec 14: the operator opens the escrow for an agent; the facilitator then pays into its vault
  async function open(amount: BN, expiresAt: number) {
    const s = sid();
    await program.methods
      .open(s, amount, forger, new BN(expiresAt))
      .accounts({ operator: operator.publicKey, mint, tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID })
      .signers([operator])
      .rpc();
    return s;
  }
  const vault = (s: number[]) => getAssociatedTokenAddressSync(mint, escrowPda(s), true);
  const payVault = (s: number[], amount: number) => transferChecked(conn, payer, payerToken, mint, vault(s), payer, amount, 6);
  const setPayer = (s: number[], p = payer.publicKey) =>
    program.methods
      .setPayer(p)
      .accountsPartial({ operator: operator.publicKey, escrow: escrowPda(s), mint, tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID })
      .signers([operator])
      .rpc();
  const settle = (s: number[], op = operator, rentTo = payer.publicKey) =>
    program.methods
      .settle()
      .accountsPartial({ operator: op.publicKey, escrow: escrowPda(s), mint, forger, treasury, rentTo, tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID })
      .signers([op])
      .rpc();
  const refund = (s: number[], rentTo = payer.publicKey, p = payer.publicKey) =>
    program.methods
      .refund()
      .accountsPartial({ operator: operator.publicKey, escrow: escrowPda(s), mint, payer: p, rentTo, tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID })
      .signers([operator])
      .rpc();
  const reclaim = (s: number[]) =>
    program.methods
      .reclaim()
      .accountsPartial({ caller: stranger.publicKey, escrow: escrowPda(s), mint, payer: payer.publicKey, rentTo: payer.publicKey, tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID })
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
    // spec 10: init_config is bound to ADMIN (the provider wallet in this repo); the stranger must go first,
    // once the config exists any init fails on "already in use" before reaching the admin check
    strangerInit = await program.methods.initConfig(treasury, 1000, mint).accounts({ admin: stranger.publicKey }).signers([stranger]).rpc().catch((e: Error) => e);
    await program.methods.initConfig(treasury, 1000, mint).accounts({ admin: admin.publicKey }).rpc();
  });

  it("init_config is bound to ADMIN: a stranger fails with WrongAdmin", async () => {
    expect(String((strangerInit as Error).message ?? strangerInit)).to.include("WrongAdmin");
    expect((await program.account.config.fetch(PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0])).admin.toBase58()).to.equal(admin.publicKey.toBase58());
  });

  it("settle splits 90/10 between Forger and treasury", async () => {
    const s = await deposit(USDC(1), now() + 300);
    await settle(s);
    expect(await bal(forger)).to.equal(900_000);
    expect(await bal(treasury)).to.equal(100_000);
    expect((await program.account.escrow.fetch(escrowPda(s))).state).to.deep.equal({ settled: {} });
  });

  it("refund returns everything to the payer", async () => {
    const before = await bal(payer.publicKey);
    const s = await deposit(USDC(2), now() + 300);
    expect(await bal(payer.publicKey)).to.equal(before - 2_000_000);
    await refund(s);
    expect(await bal(payer.publicKey)).to.equal(before);
    expect((await program.account.escrow.fetch(escrowPda(s))).state).to.deep.equal({ refunded: {} });
  });

  it("reclaim fails before expires_at + 1 h and works after", async () => {
    const early = await deposit(USDC(1), now() + 300);
    await fails(reclaim(early), "NotReclaimableYet");
    const before = await bal(payer.publicKey);
    const late = await deposit(USDC(1), now() - 7200);
    await reclaim(late);
    expect(await bal(payer.publicKey)).to.equal(before);
  });

  it("a foreign operator cannot settle", async () => {
    const s = await deposit(USDC(1), now() + 300);
    await fails(settle(s, stranger), "WrongOperator");
  });

  it("cannot settle twice", async () => {
    const s = await deposit(USDC(1), now() + 300);
    await settle(s);
    const f = await bal(forger);
    // the vault is already closed, so Anchor fails before reaching the state check (InvalidState)
    await fails(settle(s), "AccountNotInitialized");
    expect(await bal(forger)).to.equal(f);
  });

  it("rejects a mint other than the configured one", async () => {
    const other = await createMint(conn, admin, admin.publicKey, null, 6);
    const otherToken = (await getOrCreateAssociatedTokenAccount(conn, admin, other, payer.publicKey)).address;
    await mintTo(conn, admin, other, otherToken, admin, 5_000_000);
    await fails(deposit(USDC(1), now() + 300, other, otherToken), "WrongMint");
  });

  it("rejects a zero amount", async () => {
    await fails(deposit(new BN(0), now() + 300), "ZeroAmount");
  });

  it("x402 path: open, facilitator pays the vault, set_payer, settle 90/10 and rent back to the operator", async () => {
    const f = await bal(forger);
    const t = await bal(treasury);
    const s = await open(USDC(1), now() + 300);
    expect((await program.account.escrow.fetch(escrowPda(s))).state).to.deep.equal({ opened: {} });
    await fails(settle(s, operator, operator.publicKey), "InvalidState");
    await fails(setPayer(s), "NotFunded");
    await payVault(s, 1_000_000); // what the x402 facilitator submits: a plain TransferChecked to the vault
    await setPayer(s);
    const e = await program.account.escrow.fetch(escrowPda(s));
    expect(e.state).to.deep.equal({ funded: {} });
    expect(e.payer.toBase58()).to.equal(payer.publicKey.toBase58());
    await fails(setPayer(s), "InvalidState");
    const lamports = await conn.getBalance(operator.publicKey);
    await settle(s, operator, operator.publicKey);
    expect(await bal(forger)).to.equal(f + 900_000);
    expect(await bal(treasury)).to.equal(t + 100_000);
    expect(await conn.getBalance(operator.publicKey)).to.be.greaterThan(lamports, "vault rent returns to the operator");
    await fails(settle(s, operator, payer.publicKey), "AccountNotInitialized");
  });

  it("x402 path: open, pay, set_payer, refund returns the vault balance to the payer", async () => {
    const before = await bal(payer.publicKey);
    const s = await open(USDC(1), now() + 300);
    await fails(refund(s, operator.publicKey, PublicKey.default), "InvalidState"); // no payer yet: nothing to refund to
    await payVault(s, 1_000_000);
    await setPayer(s);
    await refund(s, operator.publicKey);
    expect(await bal(payer.publicKey)).to.equal(before);
    expect((await program.account.escrow.fetch(escrowPda(s))).state).to.deep.equal({ refunded: {} });
  });
});
