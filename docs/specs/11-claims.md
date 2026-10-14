# 11 · Claims: what the material says versus what exists

The Superteam review (2026-10-13) listed sentences in the README, `docs/colosseum.md`, the site and the skills that the product does not back yet. This spec fixes the wording once and adds what a reviewer needs to verify the rest in a minute.

## Wording

| Today | Now |
|---|---|
| "Forgers: makers, labs and workshops who build a shell…" (as if several) | "Today one shell, built by us; open to makers and labs." The marketplace text stays as design. |
| "paid per minute straight to their wallet" | "per 5-minute block; with Solana Pay held in escrow and settled when the session ends (90 % to the Forger); with x402 paid upfront to the Forger" |
| "one cent per minute" as the product's price | "from USD 0.05 per block; each Forger sets the price of their shell" |
| INA219 "the console and the example agent already show it" | roadmap: "driver and mock ready; the sensor is not soldered on El Tucu yet; the console does not show current" |
| "if the gateway disappears, the payer reclaims on their own" | "anyone can call `reclaim` on the program after `expires_at` + 1 h; there is no client for it yet" |
| "pays 1 USD in USDC" (05-agents) and "one-dollar action" (PRODUCT) | USD 0.05 |

The site copy stops promising current readings and per-minute pay; the gateway stops advertising `current_ma` by default (`SHELL_SENSORS` defaults to `angles`).

## README for the reviewer

- New section **What is real today vs roadmap** after "Demo case": devnet program id `5459LTpropgaL1a7Ct4nRUN6BULGvJs3STMcreh2gf4X` with its Solscan link, one deposit and one settle signature from 2026-10-13, what the firmware repo holds (`github.com/francoperez03/el-tucu`: joint limits, HOME, INA219 driver) and why it is a separate repo.
- "Flow" becomes a diagram with both branches: agent → `llms.txt` → x402 → gateway → robot → HOME, and person → QR → escrow deposit → gateway → robot → HOME → settle 90/10.
- The escrow row in "Pieces" carries the program id. `pnpm mock` reads `ROBOT_A_DIR` instead of a hardcoded path.

## Verification

`grep -rn "per minute\|straight to their wallet\|already show it\|1 USD\|one-dollar" README.md docs PRODUCT.md apps/web/src skills` returns nothing but the historical 402 sample in `04-payments.md`. The README shows program id, two signatures and the diagram above the fold of "Pieces".
