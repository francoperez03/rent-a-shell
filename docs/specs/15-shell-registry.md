# 15 · Shell registry and reputation

An agent choosing a shell needs more than a price: how many sessions this shell completed and how many were refunded. Escrow accounts stay on-chain after settle and refund, so the data exists; this spec gives it a home per shell that no operator can inflate, and the path to mainnet.

## Program

`ShellRecord` PDA `["shell", sha256(shell_id)]`:

| Field | Set by |
|---|---|
| `shell_id_hash`, `forger`, `operator`, `price_usd_cents`, `block_minutes` | `register_shell` (operator signs; creates or updates, only the same operator updates) |
| `completed`, `refunded` | `settle` (+1 completed), `refund` and `reclaim` (+1 refunded) |

`Escrow` gains `shell: Pubkey` (default when not bound), set by `deposit` and `open`. `settle`, `refund` and `reclaim` take an optional `shell` account: when `escrow.shell != default` it must match and its counter moves. A refund counts against the shell because the renter paid and did not get the time.

## Rail, gateway, hub

- `EscrowClient.registerShell(shell)` and `shellRecord(shellId)`; `pnpm --filter @ras/rails-solana register-shell`. A gateway with an operator key registers or updates its shell on start, with the spec's price.
- `llms.txt` (gateway and hub) prints `Reputation (on-chain): N completed, M refunded` with the Solscan link of the PDA; the agent card and MCP `list_shells` carry `reputation {completed, refunded, address}`. The rent client shows it in `info`.

## Mainnet (runbook, not executed here)

1. `[programs.mainnet]` in `Anchor.toml`; `anchor deploy --provider.cluster mainnet` with the same keypair.
2. `init_config` with `ADMIN`, treasury on mainnet USDC, `fee_bps = 1000`.
3. Move the upgrade authority to a Squads multisig: `solana program set-upgrade-authority <program> --new-upgrade-authority <squads vault>`.
4. First blocks at USD 0.01 (`BLOCK_USD=0.01`), `SOLANA_NETWORK=mainnet`, PayAI facilitator (`[to verify]` key or credits for settle).

## Verification

`anchor test`: register, update by the same operator, update by another operator fails, settle and refund move the counters, a foreign shell account fails. `escrow.e2e.ts`: after one settle the record reads 1/0 and the gateway's `/llms.txt` shows it.

**Verified (2026-10-14, local validator).** `cd programs && npm test`: 12 passing, with "register, update by the same operator, another operator cannot" (`WrongOperator`) and "settle, refund and reclaim move the counters; a foreign or missing record fails" (`ShellMissing`, `WrongShell`; an escrow with `shell = default` counts nothing). `pnpm --filter @ras/rails-solana e2e`: the rail registers `el-tucu`, the record reads 1/0 after the first settle and 2/3 at the end (two settles, three refunds across both rails; the forged deposit counts nothing). `cd apps/gateway && pnpm test`: a rail with a `registry` is registered on start with the spec's price, and `/api/shells`, `/llms.txt` (`Reputation (on-chain): 7 completed, 1 refunded (…)`) and `/.well-known/agent.json` carry it; without one, `llms.txt` says "not registered yet". Decision: the rail binds an escrow to the record only when the record exists (`EscrowClient.shellFor`), and `check()` rejects a deposit bound to any other record, since a bound escrow cannot settle without it. Mainnet runbook not executed.
