# 04 · Payments

Two rails on Solana, a single result: a session token (`03-gateway-local.md`). Everything here lives in `packages/rails/solana` and nothing leaves that package (`08-rail-adapter.md`).

| Rail | `id` in the registry | Who | Confirmation |
|---|---|---|---|
| R1 · x402 | `solana-x402` | agent | x402 facilitator, synchronous: settled before the session is issued |
| R2 · Solana Pay | `solana-pay` | person with a wallet (Phantom, Solflare) | `getSignaturesForAddress(reference)` + token balances, or the escrow account |

Implementation: `packages/rails/solana/src/{config,x402,pay,pay-escrow,escrow,check}.ts`.

## Networks and contracts

| | Devnet | Mainnet |
|---|---|---|
| CAIP-2 | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| USDC (6 decimals) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Facilitator | `https://x402.org/facilitator` (no key) | `https://facilitator.payai.network` |
| Default RPC | `https://api.devnet.solana.com` | `https://api.mainnet-beta.solana.com` |
| Explorer | Solscan `?cluster=devnet` | Solscan |

Selected with `SOLANA_NETWORK=devnet|mainnet`. The mints are the default assets of `@x402/svm` 2.27.0.

## R1 · x402 (agents)

1. The agent calls `POST /api/sessions/x402?shell=el-tucu&blocks=1`.
2. The gateway answers `402` with the x402 requirement, `exact` scheme on the SVM network: USDC asset, `payTo = SOLANA_PAY_TO`, amount = blocks × price in atomic units. The `@x402/svm` server adds `feePayer` (the facilitator's) and a `recentBlockhash`.
3. The agent signs the SPL transfer with `@x402/fetch` + `@x402/svm` (`ExactSvmScheme`, `toClientSvmSigner`) and retries with the payment header. **It needs no SOL**: the facilitator is the fee payer.
4. The gateway calls `verify` and `settle` on the facilitator and only then answers `200` with `{token, sid, starts_at, expires_at, payment}`. If settle fails, there's no token.

## R2 · Solana Pay (people)

1. The person picks blocks at checkout. The website calls `POST /api/sessions/intent` with `{shell, blocks, rail: "solana-pay"}`.
2. The rail generates a `reference` (32 random bytes, as a pubkey) and builds a transfer request:
   `solana:<SOLANA_PAY_TO>?amount=1&spl-token=<USDC>&reference=<ref>&label=Rent%20a%20Shell&message=...` (percent-encoding, as the Solana Pay spec requires).
3. The website draws the QR and an "Open in wallet" button. The person scans with Phantom or Solflare; the wallet adds the `reference` as an account of the tx.
4. `check()`: `getSignaturesForAddress(reference)`, then `getTransaction` (`jsonParsed`), comparing `postTokenBalances` against `preTokenBalances` for the owner `SOLANA_PAY_TO` and the USDC mint. If it went up by at least the amount, the intent becomes `paid`. It covers the new-ATA case (no prior balance).
5. The website polls `GET /api/sessions/intent/:id` (and listens to `payment_seen` over SSE) and receives the token.

With the `reference` there's no need for magic decimals or a contract: each intent has its own account to look up.

## Verified live (2026-10-12, devnet)

- `pnpm check-solana`: `x402.org/facilitator/supported` answers `exact` on `solana:EtWT…`, and the devnet USDC mint exists.
- Real 402 from the gateway: `{"scheme":"exact","network":"solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1","amount":"1000000","asset":"4zMMC9…","payTo":"<SOLANA_PAY_TO>","extra":{"feePayer":"CKPKJW…","recentBlockhash":"…"}}`.
- `pnpm buyer` with an empty wallet: the facilitator simulates the tx and answers `invalid_exact_svm_transaction_simulation_failed` (signature and requirement are valid; balance is missing).
- `POST /api/sessions/intent` with `solana-pay` returns a valid `solana:` link and the checkout shows the QR (`evidence/f4/checkout-rails.png`).
- PayAI answers `/supported` with `exact` on mainnet. `[to verify]` whether settle on mainnet requires `X402_API_KEY` or credits (the rail sends `Authorization: Bearer` only if the variable is set).

## Price

| Parameter | Value | Status |
|---|---|---|
| Block | 5 minutes (`BLOCK_MINUTES`) | `[INPUT]` |
| Price per block | USD 0.05 for El Tucu; each Forger sets `BLOCK_USD` | `[INPUT]` |
| Max per purchase | 6 blocks (30 min) | `[INPUT]` |

The price is charged in USDC, 1:1 with USD.

## Escrow (`shell_escrow` program)

Payments from people with the marketplace fee and automatic refund. Code in `programs/programs/shell-escrow/src/lib.rs` (Anchor 0.32.1), program id `5459LTpropgaL1a7Ct4nRUN6BULGvJs3STMcreh2gf4X`. Client in `packages/rails/solana/src/escrow.ts`.

**Accounts**
- `Config`, PDA `["config"]`: `admin`, `treasury`, `fee_bps` (1000 = 10 %) and `usdc_mint`.
- `Escrow`, PDA `["escrow", session_id]`: `payer`, `forger`, `operator`, `mint`, `amount`, `expires_at` and `state` (Funded, Settled or Refunded). `session_id` is the sha256 of the intent id, so the rail derives it without storing state. The account stays open with its final state: it serves as a record and prevents reusing a `session_id`.
- Vault: USDC ATA of the `Escrow` PDA.

**Instructions**
- `init_config` and `update_config`: admin only. Run with `pnpm --filter @ras/rails-solana init-escrow`.
- `deposit(session_id, amount, forger, operator, expires_at)`: signed by the payer; the USDC moves to its vault. The mint must match `Config`.
- `settle`: signed by the operator. `fee_bps` to the treasury and the rest to the Forger (90/10). Closes the vault and the rent goes back to the payer.
- `refund`: signed by the operator. Everything goes back to the payer.
- `reclaim`: anyone can sign it, after `expires_at` + 1 h with the escrow Funded. Everything goes back to the payer. It protects the payer if the gateway disappears. The rail sets `expires_at` to `ESCROW_HOLD_SECONDS` (6 h by default).

**Operator.** Each gateway has its own wallet (`SOLANA_OPERATOR_KEY`) that can only settle to the Forger and the treasury or refund the payer: the program has no path that sends funds anywhere else. It needs a little SOL for fees. This replaces the earlier rule "the gateway holds no keys": the operator key lives only in `.env.local` on the Forger's machine, and the receiving wallet (`SOLANA_PAY_TO`) still isn't on the gateway.

**Solana Pay transaction request.** With an operator configured, the `solana-pay` rail (`pay-escrow.ts`) swaps the transfer request for a transaction request: the QR carries `solana:<PUBLIC_URL>/api/rails/solana-pay/tx/<intentId>`. The wallet does `GET` (label and icon) and `POST {account}`; the gateway answers with the built `deposit` tx and the `reference` as a read-only account. `check()` reads the `Escrow` account (Funded and correct amount). When the session closes, `finalize()` runs `settle` or `refund` (idempotent: if it's already closed, it does nothing). The URL must be public HTTPS for the wallet to reach it: the tunnel is required. Without an operator, the rail keeps the direct transfer request to `SOLANA_PAY_TO`.

**x402.** Agents keep paying straight to the Forger's wallet, with no fee: the facilitator builds a plain SPL transfer and doesn't invoke programs.

**Verified (2026-10-12, local validator with the program loaded).** `pnpm --filter @ras/rails-solana e2e` (`escrow.e2e.ts`) goes through QR, `GET`/`POST` of the transaction request, payer signature, `check()` and `finalize`. Result: Forger 0.9 USDC, treasury 0.1 USDC, refund returns 100 % and a second `finalize` does nothing. `anchor test` in `programs/`: 7 of 7 (exact split, refund, reclaim before and after the deadline, foreign operator, double settle, wrong mint, zero amount).

## Refunds

With escrow, automatic: if the robot goes down during a paid session and doesn't come back within `OFFLINE_REFUND_SECONDS`, the gateway cuts the session and `finalize("refund")` returns the USDC (`03-gateway-local.md`). x402 payments (direct to the Forger): the refund is still manual from the Forger's wallet.
