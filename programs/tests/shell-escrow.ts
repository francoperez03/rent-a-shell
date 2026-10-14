import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { createHash } from "node:crypto";
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

  const shellHash = (id: string) => Array.from(createHash("sha256").update(id).digest());
  const shellPda = (id: string) => PublicKey.findProgramAddressSync([Buffer.from("shell"), Buffer.from(shellHash(id))], program.programId)[0];
  const register = (id: string, op = operator, cents = 5, minutes = 5) =>
    program.methods.registerShell(shellHash(id), forger, new BN(cents), minutes).accounts({ operator: op.publicKey }).signers([op]).rpc();
  const record = (id: string) => program.account.shellRecord.fetch(shellPda(id));

  async function deposit(amount: BN, expiresAt: number, m = mint, from = payerToken, shell = PublicKey.default) {
    const s = sid();
    await program.methods
      .deposit(s, amount, forger, operator.publicKey, new BN(expiresAt), shell)
      .accounts({ payer: payer.publicKey, mint: m, payerToken: from, tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID })
      .signers([payer])
      .rpc();
    return s;
  }
  // spec 14: the operator opens the escrow for an agent; the facilitator then pays into its vault
  async function open(amount: BN, expiresAt: number, shell = PublicKey.default) {
    const s = sid();
    await program.methods
      .open(s, amount, forger, new BN(expiresAt), shell)
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
  const settle = (s: number[], op = operator, rentTo = payer.publicKey, shell: PublicKey | null = null) =>
    program.methods
      .settle()
      .accountsPartial({ operator: op.publicKey, escrow: escrowPda(s), mint, forger, treasury, rentTo, shell, tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID })
      .signers([op])
      .rpc();
  const refund = (s: number[], rentTo = payer.publicKey, p = payer.publicKey, shell: PublicKey | null = null) =>
    program.methods
      .refund()
      .accountsPartial({ operator: operator.publicKey, escrow: escrowPda(s), mint, payer: p, rentTo, shell, tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID })
      .signers([operator])
      .rpc();
  const reclaim = (s: number[], shell: PublicKey | null = null) =>
    program.methods
      .reclaim()
      .accountsPartial({ caller: stranger.publicKey, escrow: escrowPda(s), mint, payer: payer.publicKey, rentTo: payer.publicKey, shell, tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID })
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

  it("shell registry: register, update by the same operator, another operator cannot", async () => {
    await register("el-tucu");
    let r = await record("el-tucu");
    expect(r.operator.toBase58()).to.equal(operator.publicKey.toBase58());
    expect(r.forger.toBase58()).to.equal(forger.toBase58());
    expect(r.priceUsdCents.toNumber()).to.equal(5);
    expect(r.completed.toNumber()).to.equal(0);
    await register("el-tucu", operator, 200, 10);
    r = await record("el-tucu");
    expect(r.priceUsdCents.toNumber()).to.equal(200);
    expect(r.blockMinutes).to.equal(10);
    await fails(register("el-tucu", stranger), "WrongOperator");
  });

  it("shell registry: settle, refund and reclaim move the counters; a foreign or missing record fails", async () => {
    await register("bench", operator, 200, 5);
    const sh = shellPda("bench");
    const s1 = await deposit(USDC(1), now() + 300, mint, payerToken, sh);
    await fails(settle(s1), "ShellMissing");
    await fails(settle(s1, operator, payer.publicKey, shellPda("el-tucu")), "WrongShell");
    await settle(s1, operator, payer.publicKey, sh);
    let r = await record("bench");
    expect([r.completed.toNumber(), r.refunded.toNumber()]).to.deep.equal([1, 0]);
    const s2 = await open(USDC(1), now() + 300, sh);
    await payVault(s2, 1_000_000);
    await setPayer(s2);
    await refund(s2, operator.publicKey, payer.publicKey, sh);
    const s3 = await deposit(USDC(1), now() - 7200, mint, payerToken, sh);
    await reclaim(s3, sh);
    r = await record("bench");
    expect([r.completed.toNumber(), r.refunded.toNumber()]).to.deep.equal([1, 2]);
    // an escrow not bound to a shell counts nothing, with or without a record passed
    const s4 = await deposit(USDC(1), now() + 300);
    await settle(s4, operator, payer.publicKey, sh);
    r = await record("bench");
    expect(r.completed.toNumber()).to.equal(1);
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
