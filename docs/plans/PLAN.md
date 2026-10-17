# Plan · Rent a Shell on Solana for Colosseum

Start: 2026-10-11. Switch to Solana only: 2026-10-12 (the Celo version stayed in a separate backup, commit `5f83196`). Submission text in [`../colosseum.md`](../colosseum.md).

Each phase says where it runs. What runs next to the robot, on the ESP32 or requires wallets is done by hand with each phase's commands; the output is recorded in `evidence/<phase>/`.

## Status

| Phase | What | Where | Status | Evidence |
|---|---|---|---|---|
| F0 | Live checks | Mac + Franco | in progress: x402.org facilitator supports `exact` on devnet, devnet USDC mint exists, PayAI supports mainnet (2026-10-12); PayAI key and tunnel pending | `docs/specs/04-payments.md` |
| F1 | Gateway against the mock | Mac | done: 8 tests (allowlist, queue, return to HOME, rate limit, x402, MCP, Forger requests, finalize completed/refund), isolation ok | `apps/gateway/src/app.test.ts` |
| F2 | Agent payment with x402 | Mac + wallet | code done; real 402 on devnet and buyer tested up to the facilitator simulation (`invalid_exact_svm_transaction_simulation_failed` with an empty wallet); a wallet with devnet USDC is pending | `apps/buyer` |
| F3 | Person payment with Solana Pay | Mac + Phantom | code done; intent with `solana:` link and QR verified; a real payment by scanning is pending | `packages/rails/solana/src/pay.ts` |
| F4 | Website: landing, checkout, console | Mac | done: QR checkout, `/agents` with SVM example, build green | `evidence/f4/` |
| F5 | Real El Tucu + camera + tunnel | Mac + ESP32 | to do | `evidence/f5/` |
| F6 | MCP, `llms.txt`, agent card | Mac | code done; testing with a fresh agent session against devnet is pending | `apps/gateway/src/{mcp,discovery}.ts` |
| F7 | Demo rehearsal, video and submission | all | to do | `evidence/f7/` |
| F8 | Marketplace: Forger hub | Mac | done (2026-10-12): registration, catalog, health, `llms.txt`, MCP; tested with two gateways and one down. Merged into the Next.js site on 2026-10-14 (`apps/web/src/server/hub.ts`, registry in Upstash Redis) | `apps/hub`, `docs/specs/09-hub.md` |
| F9 | 90/10 escrow with refund | Mac + devnet | program and rail done (2026-10-12): `anchor test` 7/7 and e2e on a local validator (90/10, refund, idempotency); devnet deploy and a Phantom payment pending | `programs/`, `packages/rails/solana/src/pay-escrow.ts` |
| F10 | Current sensor (INA219) | robot-a + Mac | firmware builds (`idf.py build`) and conversion test ok; mock, gateway, buyer and console show `current_ma`; soldering the chip pending | `robot-a/apps/firmware/main/ina219.c` |
| F11 | Customization requests | Mac | done: endpoint, form on the spec page and reading with `FORGER_TOKEN` | `apps/gateway/src/app.ts` |
| F12 | Agent skills and Forger launcher | Mac | done: rent skill + `rent.mjs` (spending cap, report), Forger skill + `pnpm forger` / `forger:doctor` / `forger:esp32` | `skills/`, `scripts/forger/` |

Critical path: F2 (real devnet payment) → F5 → F7.

## After the review (Superteam Argentina, 2026-10-13 · 56/100, target 80)

Submission tagged `colosseum-submission` (`e8a5989`). Only the `/llms.txt` fix went to `main` after it (`2898f7d`, a P0 in the review); everything else lands on `post-submission` and merges after judging. Each phase starts with its spec in `docs/specs/` (same format as the existing ones, with its own verification) and is marked here.

| Phase | Spec | Priority | What | Done when |
|---|---|---|---|---|
| F13 | `10-escrow-guard.md` | P1 | `check()` in `packages/rails/solana/src/pay-escrow.ts` requires `operator == gateway operator`, `forger == payTo` and `expires_at` inside the expected window; `init_config` restricted to a fixed admin; `[programs.devnet]` in `Anchor.toml` | done (2026-10-14): `acceptableDeposit` in `pay-escrow.ts` (unit tests in `pay-escrow.test.ts`), `ADMIN` constant and `WrongAdmin` on `init_config`, `[programs.devnet]`; `anchor test` 12/12, e2e ignores a forged deposit |
| F14 | `11-claims.md` | P1 | README, `docs/colosseum.md` and the application say what exists today: one shell built by us, per 5-minute block held in escrow, INA219 as roadmap, a "What is real today vs roadmap" section; program id with explorer link, a deposit and a settle signature, the agent → gateway → rail → robot → HOME diagram, what the firmware repo holds | done (2026-10-14): README has the real-vs-roadmap table (program id, deposit and settle signatures, `el-tucu` firmware repo) and the two-branch flow diagram; the spec grep only hits the specs themselves and the 0.1 USDC verification line in `04-payments.md` |
| F15 | `12-terms.md` | P1 | terms for renters and Forgers (who covers what, joint limits and safe cutoff, optional damage deposit per shell); camera rule: fixed framing on the robot, visible notice, no third parties | done (2026-10-14): `docs/terms.md`, `/terms` (`apps/web/src/pages/Terms.tsx`, build green, 200 on the dev server), footer link, sentence on checkout and under the Rent box, `pnpm forger` logs the URL, both skills mention the terms, `llms.txt` carries `Terms:` |
| F16 | `13-pricing.md` | P2 | price per shell set by the Forger in the spec sheet and published in `llms.txt`, MCP and checkout; 10% take rate; monthly package for courses; worked example in `docs/costs.md` | copy done (2026-10-14): landing reads the catalog price, `docs/costs.md` has the per-shell table, Forger skill asks for `BLOCK_USD`, `forger:doctor` warns on the default price; gateway part done (2026-10-14): tests set `BLOCK_USD`, `llms.txt` (gateway and hub) prints the 10 % fee, `SHELL_SENSORS` defaults to `angles` (`apps/gateway/src/{app.test,discovery,config}.ts`) |
| F17 | `14-x402-escrow.md` | P2 | agent payments go through the escrow (x402 `payTo` = session vault, or the agent signs `deposit`); `finalize()` settles 90/10 or refunds | done (2026-10-14) on the local validator: `open`/`set_payer` in the program, per-intent paywall (`payTo` = vault, `extra.memo` = intent), shared `EscrowClient.finalize`, clients create the intent first; `anchor test` 12/12, `escrow.e2e.ts` settles 90/10 and refunds the agent; devnet deploy, a real facilitator payment and the Solscan refund pending (Franco) |
| F18 | `15-shell-registry.md` | P2 | PDA per shell (price, Forger wallet, completed and refunded counters updated by `settle` and `refund`), exposed in `llms.txt` and MCP; mainnet with small amounts and the upgrade authority in a Squads multisig | done (2026-10-14) except mainnet: `ShellRecord` PDA with counters on `settle`/`refund`/`reclaim`, `register-shell` script, gateway registers on start, reputation in `llms.txt`, agent card, MCP, hub and `rent.mjs info`; `anchor test` 12/12, e2e reads 1/0 after the first settle; mainnet runbook not executed |

Follow-ups found while building (2026-10-14): an `Opened` escrow that never gets paid keeps about 0.0035 SOL of operator rent with no close path, so `POST /api/sessions/intent` with `rail: solana-x402` can drain the operator's SOL; needs a `close_opened` instruction plus rail cleanup on intent expiry, or a rate limit on intents. The devnet program is behind the branch (`Escrow` gained `rent_to` and `shell`, state `Opened`, instructions `open`, `set_payer`, `register_shell`): `anchor deploy --provider.cluster devnet` before any live test. Toolchain on this Mac: `cargo-build-sbf` 3.0.13 breaks on its own `rustup toolchain list -v` output, so run `rustup toolchain uninstall 1.89.0-sbpf-solana-v1.52` right before `npm run build`; `anchor test` needs `rm -rf programs/.anchor/test-ledger` and `COPYFILE_DISABLE=1` when macOS leaves `._genesis.bin` behind.

Before re-recording the demo: live HLS through the gateway proxy (`/live/*`, MediaMTX `cookieCheck` redirect), still open since 2026-10-12.

Outside the repo (Franco, this week): 2:00 pitch with the review's structure and subtitles; demo that runs the block out to HOME and opens deposit and settle on Solscan labelled devnet; chapter form fields (one-liner, stack, go-to-market, repo, videos, Colosseum link); first external Forger and first renters with numbers; firmware repo pinned on GitHub, LinkedIn and X linked.

## To verify

| # | What | How | Blocks |
|---|---|---|---|
| 1 | Whether PayAI requires a key or credits for `settle` on mainnet | a USD 0.01 payment on mainnet | mainnet |
| 2 | That Phantom and Solflare on devnet resolve the transaction request | scan the checkout QR | F3 |
| 3 | Camera permission when `pnpm forger` starts from Login Items | reboot the Mac and check the doctor | F5 |

## F2 · Agent payment with x402

`packages/rails/solana` with `solana-x402` and `apps/buyer` paying with `@x402/fetch` + `@x402/svm`.

**Verification:** `apps/buyer` pays 1 block on devnet, gets a token, moves the mock and ends at HOME. Solscan tx recorded in `evidence/f2/tx.md`.

## F3 · Person payment

`solana-pay` in `packages/rails/solana`: intent with `reference`, `check()` via `getSignaturesForAddress` (or the escrow account).

**Verification:** scan the QR with Phantom on devnet, pay 0.05 USDC, intent `paid` in under 30 s and the console opens on its own. Evidence in `evidence/f3/`.

## F5 · Real El Tucu

Steps (Franco, on the Mac next to the robot; the Forger skill covers it in detail):
1. Clone `rent-a-shell`, `pnpm install`, `brew install node pnpm ffmpeg mediamtx cloudflared`.
2. ESP32 with El Tucu on the own router; `pnpm forger:esp32`.
3. `.env.local` with `ESP32_URL`, `CAMERA` (from `pnpm forger:cameras`), `SOLANA_PAY_TO`, `HUB_URL`.
4. `pnpm forger` (camera, tunnel, gateway and hub registration) and `pnpm forger:doctor`.
5. Website on Vercel (Next.js, root `apps/web`): the Forger registers with `HUB_URL=<site url>`; the registry lives in Upstash Redis (Marketplace).

**Verification:** from a phone on mobile data (off the network), pay 1 block with the QR and move the arm while watching it on camera. Screen video in `evidence/f5/` (outside git).

## F6 · Agents

`/mcp` in the gateway, `/llms.txt`, agent card at `/.well-known/agent.json`.

**Verification:** a fresh agent session, with no help (or with the `rent-a-shell` skill), reads `llms.txt`, pays with x402 on devnet and runs the demo test routine (`05-agents.md`). Transcript in `evidence/f6/`.

## F7 · Rehearsal, video and submission

- Full rehearsal of the 90 s script three times in a row; note how many sessions the SG90 holds without overheating.
- Demo video: agent pays with x402, moves El Tucu, report with the Solscan tx; a person pays with the QR.
- Colosseum submission with `docs/colosseum.md`.

## Franco's pending items

- [INPUT] Block price and length.
- [INPUT] Owner wallet `SOLANA_PAY_TO`.
- [INPUT] Domain (if using a named `cloudflared` tunnel).
- [INPUT] Hero copy for each door.

## Franco's steps for the marketplace and escrow (2026-10-12)

1. **Deploy the program to devnet** (needs devnet SOL in `~/.config/solana/id.json`, see https://faucet.solana.com):
   ```bash
   cd programs
   export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"   # Agave 3.x, shadows Homebrew's solana 1.18
   npm run build
   /opt/homebrew/bin/anchor deploy --provider.cluster devnet
   ```
2. **Marketplace config**: `ESCROW_ADMIN_KEY=<base58 secret> ESCROW_TREASURY=<treasury address> pnpm --filter @ras/rails-solana init-escrow` (FEE_BPS defaults to 1000).
3. **Gateway operator**: `pnpm --filter @ras/rails-solana -s operator-key` (writes `SOLANA_OPERATOR_KEY` to `apps/gateway/.env.local` and prints only the address) and fund it with devnet SOL. With it, Solana Pay switches to escrow; the QR needs an HTTPS `PUBLIC_URL` (tunnel).
4. **Hub**: it is the site. Locally `cp apps/web/.env.example apps/web/.env.local` with `HUB_GATEWAYS=<gateway url>` and `pnpm web`; the gateway's `HUB_URL` is the site URL.
5. **INA219**: solder it to the servos' 5 V bus with SDA on GPIO 21 and SCL on GPIO 22 (address 0x40), flash the robot-a firmware and check that `curl http://<ip>/state` shows `current_ma` rising while moving.

Escrow e2e locally (no devnet):

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana-test-validator --reset --bpf-program 5459LTpropgaL1a7Ct4nRUN6BULGvJs3STMcreh2gf4X programs/target/deploy/shell_escrow.so
pnpm --filter @ras/rails-solana e2e     # in another terminal
```

## Franco's steps to close Solana (2026-10-12)

Everything in `apps/gateway/.env.local` (copy from `.env.example`).

1. **Owner wallet**: create or use a Phantom account and put its address in `SOLANA_PAY_TO`. It only receives; the key never goes to the gateway.
2. **Preflight**: `pnpm check-solana` (devnet) and `SOLANA_NETWORK=mainnet pnpm check-solana`.
3. **Agent wallet**: `pnpm --filter buyer keygen`. Fund the address with devnet USDC at https://faucet.circle.com (Solana Devnet network) and, if needed, devnet SOL at https://faucet.solana.com. Paste `BUYER_SOLANA_KEY=...` into `apps/buyer/.env.local`.
4. **Agent payment on devnet**: `pnpm mock` in one terminal, `pnpm gateway` in another, `pnpm buyer` in another. It should print the tx and 6 measured steps.
5. **Person payment on devnet**: `pnpm web`, buy 1 block with "Solana Pay", switch Phantom to devnet and scan the QR.
6. **Mainnet**: `SOLANA_NETWORK=mainnet BLOCK_USD=0.01` and repeat 4 and 5 with real USDC. If PayAI's facilitator rejects settle for lack of a key, get one from PayAI and set it in `X402_API_KEY`.
