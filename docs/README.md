# Rent a Shell · docs

Specs and plans for the Colosseum version: payments on Solana only (USDC via x402 for agents, Solana Pay for people).

A real robot (El Tucu) is rented in time blocks. A person from any country or an AI agent can rent it. They pay, get a session, move the robot and watch it on a live camera. When time runs out, the robot returns to HOME and the session closes.

## Reading order

| # | File | What it defines |
|---|---|---|
| 1 | [`specs/01-architecture.md`](specs/01-architecture.md) | Full map, who talks to whom, ESP32 vs Legion decision, variables |
| 2 | [`specs/02-robot.md`](specs/02-robot.md) | El Tucu as shell #1: API, limits, session commands, spec sheet |
| 3 | [`specs/03-gateway-local.md`](specs/03-gateway-local.md) | Server on the Legion: sessions, ESP32 proxy, camera, tunnel |
| 4 | [`specs/04-payments.md`](specs/04-payments.md) | Two Solana payment rails (x402 and Solana Pay) leading to the same session token |
| 5 | [`specs/05-agents.md`](specs/05-agents.md) | How an agent discovers, pays and controls: `llms.txt`, MCP, x402 |
| 6 | [`specs/06-site.md`](specs/06-site.md) | Website: pages, taste, motion, stack |
| 7 | [`specs/07-project-a.md`](specs/07-project-a.md) | The "people practicing Physical AI" front on the same core |
| 8 | [`specs/08-rail-adapter.md`](specs/08-rail-adapter.md) | `PaymentRail` interface and isolation rule |
| 9 | [`specs/09-hub.md`](specs/09-hub.md) | Marketplace hub: Forger registration, catalog, `llms.txt` and MCP |
| · | [`forgers.md`](forgers.md) | How a Forger publishes their hardware and gets paid |
| · | [`costs.md`](costs.md) | Owning versus renting |
| · | [`plans/PLAN.md`](plans/PLAN.md) | Phases with verification, who runs each one |

Cross-cutting rule: every connection to Solana, mints and facilitators lives in `packages/rails/*`. The gateway and the website only know the interface.

## Conventions

- `[INPUT]`: a piece of data or a decision from Franco is missing.
- `[to verify]`: must be tested live before building on top of it. They're all gathered in phase F0 of the plan.
- What runs on the Mac is done by Claude Code. What runs on the Legion, the ESP32 or requires wallets is done by Franco with the exact commands in the plan.

## Reused sources

| Piece | Where it lives |
|---|---|
| Robot, firmware, mock, camera, tunnel | `robot-a` repo (`SPEC.md`, `PLAN.md`, `apps/firmware`, `apps/mock`, `apps/web`) |
| Session UI with payment | `paybot/apps/web` |
| Taste and motion | Crisol `docs/landing/research`, `packages/motion-kit` |
| Colosseum evaluation | Rent a Shell 7/10, Project A 6.5/10; submission text in [`colosseum.md`](colosseum.md) |
