# Rent a Shell

![Rent a Shell: rent El Tucu, a real robot arm, from the browser or from an agent](evidence/f4/landing.png)

Real hardware, rented by the minute, so small teams can build physical solutions without buying or installing the hardware. Developers and their AI agents use it, and it's paid in USDC on Solana.

## Thesis

With AI, a small team can already build solutions that involve hardware: the agent writes the firmware, the control loop and the integration. What's missing is access. A bootstrapped team, or one without people who know how to install and maintain equipment, only has simulators, and a simulator never shows the servo that lands two degrees short or the sensor that reads noisy.

Rent a Shell puts real hardware one request away. The developer (or their agent) rents a shell in five-minute blocks, tests their code against the physical world, measures and keeps iterating. The result is less development time and less money spent on equipment used for a few hours. On the other side, whoever already owns the hardware gets paid for time that used to sit idle.

Goal: **Colosseum** submission (text in [`docs/colosseum.md`](docs/colosseum.md)).

## Idea

An agent lives in software. When it needs to do something in the physical world, it rents a "shell": a robotic body available on the platform. It pays on its own, programs it with what it needs to do, uses it for the paid time and gives it back.

- **Shells**: robots published by their owners (arm, rover, drone, mobile camera, etc.) with their capabilities described in a format an agent can read.
- **Agents**: look for a shell that fits what they need, pay for usage time and send it instructions or a program.
- **People**: can rent too, paying with a Solana Pay QR.
- **Forgers**: build, publish and maintain the shells in the catalog. They get paid per minute of use straight to their wallet and can offer customizations. Cost of owning versus renting in [`docs/costs.md`](docs/costs.md).

## Flow

1. The agent receives a task that needs a physical body.
2. It reads the gateway's `llms.txt` or MCP and picks a shell by capability, location and price.
3. It pays autonomously with x402 (USDC on Solana; the facilitator pays the fee, the agent needs no SOL).
4. The gateway settles the payment and **assigns it the shell** for the paid time window.
5. The agent programs the shell (commands) and gets feedback: camera, state, measured angles.
6. When time runs out the robot returns to HOME and is released. The payment goes straight to the owner's wallet.

## Demo case

Robotics software testing: the agent tests its own code on real hardware. It pays for a block, runs a motion sequence, measures whether each joint reached the requested position and returns a report with the tx (`apps/buyer`).

## Pieces

| Piece | Where |
|---|---|
| Forger gateway (sessions, queue, return to HOME, MCP, `llms.txt`, customization requests) | `apps/gateway` |
| Marketplace hub (Forger catalog, health, `llms.txt`, MCP) | `apps/hub` |
| Solana payment rails (`solana-x402`, `solana-pay` with escrow) | `packages/rails/solana` |
| Escrow program (Anchor, 90/10 split and refund) | `programs/programs/shell-escrow` |
| Website (landing, QR checkout, console, agent guide) | `apps/web` |
| Example buyer agent | `apps/buyer` |
| Robot: El Tucu (ESP32, 4 servos) | `robot-a` repo (firmware and mock) |

## Run

```bash
pnpm install
pnpm check-solana          # facilitator and USDC mint on devnet
pnpm mock                  # simulated El Tucu (port 8080)
pnpm gateway               # port 8787, config in apps/gateway/.env.local
pnpm hub                   # port 8790, Forger catalog (apps/hub/.env.local)
pnpm web                   # port 5175
pnpm --filter buyer keygen # throwaway wallet for the agent
pnpm buyer                 # the agent pays and tests the sequence
```

## Relation to Project A

They share the same base (hardware published by third parties, pay per time, access that opens and closes). In A, the renter is a person practicing Physical AI; in Rent a Shell, the renter is an agent that pays on its own.

## Docs

Specs and plan in [`docs/`](docs/README.md). The ESP32 stays on the local network only, behind a gateway exposed through a tunnel. Payments live behind an adapter (`docs/specs/08-rail-adapter.md`).

Prior reference: `paybot` (`github.com/superposition/paybot`), x402 payment to control a robot with a webcam.

## Claude Code skills

- **`skills/rent-a-shell`** (rent): a Claude Code instance rents a shell, runs a motion plan, measures angles, current and photos, and returns a report. It pays with x402 under a spending cap approved by the person. The client is `skills/rent-a-shell/rent.mjs`.
- **`skills/rent-a-shell-forger`** (publish): turns a computer (macOS first, also Windows and Linux) into a Forger with `pnpm forger`, which starts the camera, tunnel, gateway and hub registration, and finishes with `pnpm forger:doctor`.

The hub serves both at `/skills/rent/SKILL.md` and `/skills/forger/SKILL.md`.
