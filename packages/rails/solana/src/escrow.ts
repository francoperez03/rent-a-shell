// Client for the shell_escrow program (programs/programs/shell-escrow). A human's payment sits in a vault
// per session; when it ends the gateway (operator) releases it to the Forger minus the platform fee, or refunds it
// if the shell went down. If the gateway disappears, the payer gets everything back with `reclaim` after the deadline.
import { createHash } from "node:crypto";
import anchor, { type Idl, type BN as BNType, type Program as ProgramType } from "@coral-xyz/anchor";
// the package is CJS: values come from the default export
const { AnchorProvider, BN, Program, Wallet } = anchor;
import { Connection, Keypair, PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import idl from "./idl/shell_escrow.json" with { type: "json" };

export const PROGRAM_ID = new PublicKey(idl.address);

/** Escrow session_id: sha256 of the intent id, so the rail derives it without storing state. */
export const sessionId = (intentId: string) => [...createHash("sha256").update(intentId).digest()];

export const configPda = (program = PROGRAM_ID) => PublicKey.findProgramAddressSync([Buffer.from("config")], program)[0];
export const escrowPda = (sid: number[], program = PROGRAM_ID) =>
  PublicKey.findProgramAddressSync([Buffer.from("escrow"), Buffer.from(sid)], program)[0];

export interface EscrowAccount {
  payer: PublicKey;
  forger: PublicKey;
  operator: PublicKey;
  mint: PublicKey;
  amount: BNType;
  expiresAt: BNType;
  state: { funded?: object; settled?: object; refunded?: object };
}

export class EscrowClient {
  readonly program: ProgramType;
  constructor(readonly connection: Connection, readonly operator: Keypair) {
    const provider = new AnchorProvider(connection, new Wallet(operator), { commitment: "confirmed" });
    this.program = new Program(idl as Idl, provider);
  }

  async config() {
    return (await (this.program.account as never as Record<string, { fetch(a: PublicKey): Promise<unknown> }>).config.fetch(configPda())) as {
      treasury: PublicKey;
      feeBps: number;
      usdcMint: PublicKey;
    };
  }

  async escrow(intentId: string): Promise<EscrowAccount | null> {
    const acc = this.program.account as never as Record<string, { fetchNullable(a: PublicKey): Promise<unknown> }>;
    return (await acc.escrow.fetchNullable(escrowPda(sessionId(intentId)))) as EscrowAccount | null;
  }

  /** deposit instruction signed by the payer; the Solana Pay reference goes as an extra read-only account. */
  async depositIx(o: { intentId: string; payer: PublicKey; mint: PublicKey; amount: bigint; forger: PublicKey; expiresAt: number; reference?: PublicKey }): Promise<TransactionInstruction> {
    const ix = await this.program.methods
      .deposit(sessionId(o.intentId), new BN(o.amount.toString()), o.forger, this.operator.publicKey, new BN(o.expiresAt))
      .accountsPartial({
        payer: o.payer,
        mint: o.mint,
        payerToken: getAssociatedTokenAddressSync(o.mint, o.payer, true),
        escrow: escrowPda(sessionId(o.intentId)),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
    if (o.reference) ix.keys.push({ pubkey: o.reference, isSigner: false, isWritable: false });
    return ix;
  }

  /** Transaction ready for the wallet to sign (Solana Pay transaction request). */
  async depositTx(o: Parameters<EscrowClient["depositIx"]>[0]): Promise<string> {
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: o.payer, blockhash, lastValidBlockHeight }).add(await this.depositIx(o));
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
  }

  async settle(intentId: string): Promise<string> {
    const e = await this.escrow(intentId);
    if (!e) throw new Error("escrow inexistente");
    const cfg = await this.config();
    return this.program.methods
      .settle()
      .accountsPartial({
        operator: this.operator.publicKey,
        escrow: escrowPda(sessionId(intentId)),
        mint: e.mint,
        forger: e.forger,
        treasury: cfg.treasury,
        payer: e.payer,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  async refund(intentId: string): Promise<string> {
    const e = await this.escrow(intentId);
    if (!e) throw new Error("escrow inexistente");
    return this.program.methods
      .refund()
      .accountsPartial({ operator: this.operator.publicKey, escrow: escrowPda(sessionId(intentId)), mint: e.mint, payer: e.payer, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
  }
}
