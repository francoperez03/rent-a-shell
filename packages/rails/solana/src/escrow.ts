// Client for the shell_escrow program (programs/programs/shell-escrow). A payment sits in a vault per session
// (a person's deposit via Solana Pay, or an agent's x402 transfer into an escrow the operator opened first); when
// the session ends the gateway (operator) releases it to the Forger minus the platform fee, or refunds it if the
// shell went down. If the gateway disappears, the payer gets everything back with `reclaim` after the deadline.
import { createHash } from "node:crypto";
import anchor, { type Idl, type BN as BNType, type Program as ProgramType } from "@coral-xyz/anchor";
// the package is CJS: values come from the default export
const { AnchorProvider, BN, Program, Wallet } = anchor;
import { Connection, Keypair, PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { Outcome } from "@ras/rails-core";
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
  state: { funded?: object; settled?: object; refunded?: object; opened?: object };
  rentTo: PublicKey;
}

/** USDC vault of a session: the ATA of the escrow PDA. For x402 it is the `payTo` owner's token account. */
export const vaultPda = (mint: PublicKey, intentId: string) => getAssociatedTokenAddressSync(mint, escrowPda(sessionId(intentId)), true);

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

  /** x402 path (spec 14): opens the escrow and its vault before the 402, so the facilitator's transfer lands there. */
  async open(o: { intentId: string; mint: PublicKey; amount: bigint; forger: PublicKey; expiresAt: number }): Promise<string> {
    return this.program.methods
      .open(sessionId(o.intentId), new BN(o.amount.toString()), o.forger, new BN(o.expiresAt))
      .accountsPartial({ operator: this.operator.publicKey, mint: o.mint, escrow: escrowPda(sessionId(o.intentId)), tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
  }

  /** After the facilitator settled: records the payer and moves the escrow to Funded (fails until the vault holds the amount). */
  async setPayer(intentId: string, payer: PublicKey): Promise<string> {
    const e = await this.escrow(intentId);
    if (!e) throw new Error("escrow inexistente");
    return this.program.methods
      .setPayer(payer)
      .accountsPartial({ operator: this.operator.publicKey, escrow: escrowPda(sessionId(intentId)), mint: e.mint, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
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
        rentTo: e.rentTo,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  async refund(intentId: string): Promise<string> {
    const e = await this.escrow(intentId);
    if (!e) throw new Error("escrow inexistente");
    return this.program.methods
      .refund()
      .accountsPartial({ operator: this.operator.publicKey, escrow: escrowPda(sessionId(intentId)), mint: e.mint, payer: e.payer, rentTo: e.rentTo, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
  }

  /**
   * Closes a session's escrow on both rails: settle (fee to the treasury, rest to the Forger) or refund the payer.
   * Idempotent: an escrow that is already closed does nothing. An x402 escrow whose set_payer failed after the
   * facilitator paid is still Opened: `payer` (from the Payment) lets finalize record it first.
   */
  async finalize(intentId: string, outcome: Outcome, payer?: string): Promise<{ tx: string } | undefined> {
    let e = await this.escrow(intentId);
    if (e?.state.opened && payer) {
      await this.setPayer(intentId, new PublicKey(payer));
      e = await this.escrow(intentId);
    }
    if (!e || !e.state.funded) return; // already closed (earlier settle/refund/reclaim) or never paid: nothing to do
    const tx = outcome === "completed" ? await this.settle(intentId) : await this.refund(intentId);
    return { tx };
  }
}
