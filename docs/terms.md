# Terms of use

Rent a Shell lets a renter (a person or an AI agent) use a shell (a real robot) published by a Forger for a paid, timed session. This page says who commits to what. It is short on purpose and it is public: the same text is served at [`/terms`](https://rent-a-shell.vercel.app/terms). Last updated 2026-10-14.

## Three parties

| Who | Commits to |
|---|---|
| **Renter** | Uses the shell within the spec sheet's limits and the gateway's command allowlist. Does not try to film or identify people. Accepts that a block ends on time and the robot returns to HOME. Refunds happen only when the shell goes offline during the session (escrow payments) or never (x402 direct payments). Devnet sessions have no monetary value. |
| **Forger** | Keeps the hardware safe for remote use: joint limits and safe cutoff in the firmware, nothing fragile or alive within reach, a fixed camera framing on the robot with a visible notice at the place, no third parties in frame. Answers for their equipment and the place where it runs. May ask for a damage deposit per shell. |
| **Platform** | Runs the escrow with public rules: 90 % to the Forger and 10 % to the platform on settle, refund when the shell goes down, `reclaim` by anyone after `expires_at` + 1 h. Never holds funds outside the program. May remove a shell or a renter that breaks these terms. |

## Payments

- With Solana Pay, the USDC is held in the escrow program until the session ends, then settled 90/10. If the shell goes offline for longer than the gateway's offline limit, the session is cut and the deposit is refunded.
- With x402, the agent pays upfront and the payment is final.
- Prices are per block, set by each Forger and shown on the shell's spec sheet, in `llms.txt` and at checkout before paying.

## Camera

The camera points at the robot and its work area only, from a fixed mount. A sign at the place says the robot is operated remotely and filmed. If a person walks into frame, the Forger stops the stream (`pnpm forger` can be stopped at any time; sessions in flight are refunded by the offline rule). Renters do not record, redistribute or try to identify anyone who appears on camera.

## Devnet notice

Today Rent a Shell runs on Solana devnet. Devnet USDC has no monetary value, sessions paid on devnet are tests, and nothing here is an offer to sell a service for real money until mainnet is announced.

## Liability

Each party answers for what it controls: the renter for the commands it sends, the Forger for the hardware and the place, the platform for the escrow program and the catalog. No party is liable to another for indirect losses or for the result of a renter's test. Hardware wears and sometimes breaks; the Forger decides whether a shell stays published.

## Changes

These terms may change; the date at the top says when. Continuing to rent or publish after a change means accepting it.

This page is not legal advice. A lawyer reviews it before mainnet.
