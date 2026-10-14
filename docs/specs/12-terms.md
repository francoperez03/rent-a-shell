# 12 · Terms and camera

A jury or an investor will ask who answers when a renter breaks a Forger's robot, when the robot hurts someone where it is installed, and what the live camera films. This spec gives the product one short, public answer and shows it where money changes hands. It is not legal advice; a lawyer reviews it before mainnet.

## Terms of use (`docs/terms.md`, served at `/terms`)

| Who | Commits to |
|---|---|
| Renter | uses the shell within the spec sheet's limits and the gateway's command allowlist; does not try to film or identify people; accepts that a block ends on time and the robot returns to HOME; refunds happen only when the shell goes offline during the session (escrow) or never (x402 direct); devnet sessions have no monetary value |
| Forger | keeps the hardware safe for remote use: joint limits and safe cutoff in the firmware, nothing fragile or alive within reach, a fixed camera framing on the robot with a visible notice at the place, no third parties in frame; answers for their equipment and the place where it runs; may ask for a damage deposit per shell |
| Platform | runs the escrow with public rules (90/10, refund on shell down, reclaim after `expires_at` + 1 h), never holds funds outside the program, and may remove a shell or a renter that breaks these terms |

## Where it shows

- Site: `/terms` page, link in the footer, "By paying you accept the terms" next to the rails on `/checkout` and under the Rent box on `/shells/:id`.
- Forger: `pnpm forger` prints the terms URL on start; the Forger skill asks the person to accept them before publishing.
- Agents: the rent skill links the terms next to its real-money rule; `llms.txt` carries a `Terms:` line.

## Camera rule

The camera points at the robot and its work area only, from a fixed mount. A sign at the place says the robot is operated remotely and filmed. If a person walks into frame, the Forger is responsible for stopping the stream (`pnpm forger` can be stopped at any time; sessions in flight are refunded by the offline rule).

## Verification

`/terms` renders on the site build; checkout and the shell page show the sentence with the link; `pnpm forger` logs the URL; the skills mention the terms. `[to verify]` with a lawyer before mainnet: consumer law (Argentina Ley 24.240), image rights (CCyC art. 53) and whether the 10 % take rate on USDC payments falls under CNV RG 994/2024.
