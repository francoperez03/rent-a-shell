# 10 · Escrow guard

The gateway opens a session as soon as it sees a funded escrow for the intent (`04-payments.md`). Today `check()` in `packages/rails/solana/src/pay-escrow.ts` only looks at state, amount and mint. The intent id is public and `session_id = sha256(intent_id)`, so a renter can build their own `deposit` with their wallet as operator and a past `expires_at`, get the session, watch the gateway's `settle` fail with `WrongOperator` forever and `reclaim` the funds one hour later. This spec closes that, and fixes who can initialize the program's config.

## Deposit check in the gateway

`check()` accepts an escrow only when all of these hold:

| Field | Rule | Why |
|---|---|---|
| `state` | `Funded` | unchanged |
| `amount` | `>= intent.meta.atomic` | unchanged |
| `mint` | `== USDC of the network` | unchanged |
| `operator` | `== gateway operator (SOLANA_OPERATOR_KEY)` | only this gateway can settle or refund |
| `forger` | `== payTo(env)` (`SOLANA_PAY_TO`) | the split goes to the shell's Forger |
| `expires_at` | within `[now + hold − 15 min − 60 s, now + hold + 60 s]` | the transaction request sets `now + ESCROW_HOLD_SECONDS`; an intent lives 15 min; the clock may drift a little |

The rule is a pure function, `acceptableDeposit(escrow, {operator, forger, now, holdSec})`, so it is unit-tested without a chain (`pay-escrow.test.ts`). A rejected deposit leaves the intent `pending`; the funds stay in that escrow until the payer reclaims them after `expires_at + 1 h`.

## Program config

`init_config` is restricted to a fixed admin: `pub const ADMIN: Pubkey` in `lib.rs` (the devnet upgrade authority, `GUBSsjpKTLwUMBnAncG4AK34xFNwaNuEu1PCYW4PN3JP`). Any other signer fails with `WrongAdmin`. `update_config` keeps `has_one = admin`. Deploying to another network therefore cannot be front-run; the admin changes only with a program upgrade.

`deposit` keeps accepting any `operator`, `forger` and `expires_at`: binding them on-chain would need a registry of gateways, and the gateway check above already makes a foreign deposit worthless for a session.

## Anchor.toml

`[programs.devnet]` with the same id, so `anchor deploy --provider.cluster devnet` and `anchor idl` work without editing the file.

## Verification

- `pnpm --filter @ras/rails-solana test`: `acceptableDeposit` rejects wrong operator, wrong forger, `expires_at` too early and too late, and accepts the deposit the rail builds.
- `cd programs && npm test`: a stranger calling `init_config` fails with `WrongAdmin`; the admin's call succeeds; the previous seven cases still pass.
- `pnpm --filter @ras/rails-solana e2e` (local validator): a hand-built deposit with another operator for the same intent is ignored by `check()`.
