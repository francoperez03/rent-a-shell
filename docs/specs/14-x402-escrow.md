# 14 · Agent payments through the escrow

Today x402 pays the Forger directly (`x402.ts`): no 10 % fee and no refund if the shell drops mid-session. Solana Pay already goes through `shell_escrow` (`04-payments.md`). This spec routes x402 through the same escrow, so both rails share one set of public rules.

## How the facilitator pays

The exact SVM scheme (`@x402/svm` 2.27.0) submits one `TransferChecked` from the agent to the associated token account of `payTo`. `payTo` is an owner and may be a PDA; the destination ATA must exist before the payment, and the facilitator never calls another program. So the escrow has to exist before the 402, and the payment lands in its vault.

## Program changes

| Instruction | Signer | Effect |
|---|---|---|
| `open(session_id, amount, forger, expires_at)` | operator | creates `Escrow {payer: default, state: Opened, rent_to: operator}` and its vault ATA (operator pays rent) |
| `set_payer(payer)` | operator | once, while `payer == default`; if `vault.amount >= amount` state becomes `Funded` |
| `settle` / `refund` | operator | require `Funded`; move the vault balance (not the stored amount); `refund` and `reclaim` require `payer != default`; vault rent goes to `rent_to` |

`deposit` keeps working as today (`rent_to = payer`).

## Rail and gateway

1. The agent asks for an intent: `POST /api/sessions/intent {shell, blocks, rail: "solana-x402"}`. The rail calls `open` with `session_id = sha256(intent_id)`, keeps the intent 15 min and answers `instructions.x402.url = …/api/sessions/x402?shell&blocks&intent=<id>`.
2. The agent calls that URL. The paywall for that intent uses `payTo = escrow PDA` and `extra.memo = intent_id`, so the facilitator rejects a payment to any other account. The 402 carries the usual `accepts`.
3. After `processSettlement` succeeds the rail calls `set_payer(payer)` and the gateway grants the session with `Payment.intentId = intent_id`.
4. When the session ends, `finalize()` settles 90/10; if the shell went offline, it refunds the payer. Same code path as Solana Pay.

Without `SOLANA_OPERATOR_KEY` the rail behaves as before (direct payment to `SOLANA_PAY_TO`) and `llms.txt` says the fee does not apply.

## Clients

`rent.mjs rent` and `apps/buyer` create the intent first and pay the URL they get. `llms.txt`, the MCP `rent_shell` answer and `05-agents.md` describe the two steps.

## Verification

- `anchor test`: open → direct transfer to the vault → set_payer → settle 90/10; open → set_payer → refund; `set_payer` twice fails; settle on an unfunded `Opened` escrow fails with `InvalidState`.
- `escrow.e2e.ts` on the local validator: the same two flows through the rail, with a `transferChecked` from the payer standing in for the facilitator.
- Live on devnet (Franco): `pnpm buyer` with a wallet holding devnet USDC, then the settle on Solscan.
