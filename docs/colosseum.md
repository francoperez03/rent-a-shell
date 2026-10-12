# Rent a Shell · Colosseum submission

## Name

Rent a Shell

## One-liner

Real hardware by the minute so small teams and their AI agents can test and build physical solutions without buying or installing equipment. Paid in USDC on Solana.

## Thesis

With AI, a small team can already build solutions with hardware: the agent writes the firmware, the control loop and the integration. The bottleneck moved to access. A bootstrapped team, or one without people who install and maintain equipment, stays in the simulator and never touches the real world. Rent a Shell gives them real hardware per request: they rent, test, measure and iterate. They save development time and money, and the hardware owner monetizes idle hours.

## Problem

Small teams already write, with help from AI agents, the code for solutions with hardware, but they have nowhere to test it on real hardware. Buying the equipment, building it and maintaining it takes money and skills a bootstrapped team doesn't have, and simulators don't show the servo that lands two degrees short. On the other side, people who know how to build hardware have no way to charge for that work beyond selling it once.

## Solution

A gateway puts a real robot behind an API with timed sessions. The agent reads `llms.txt` or the MCP, pays for a block with x402, gets a token and sends commands while watching the camera. When time runs out, the robot returns to HOME on its own and is free for the next renter. People rent the same robot from the browser, paying with a Solana Pay QR. The owner gets paid straight to their wallet, without intervening.

## Forgers: who brings the hardware

The catalog is built by **Forgers**: makers, labs and workshops who build a shell, publish it with its spec sheet (capabilities, ranges, sensors, price) and keep it online. They get paid for every minute of use straight to their wallet, and can offer customizations (an extra sensor, a different end effector, a different mount) to customers who ask for them. The catalog grows as a marketplace: each Forger adds the hardware they know and the platform provides sessions, payments, queue and safe cutoff.

Today there is one Forger (the team, with El Tucu). The spec sheet already carries the Forger and whether it accepts customizations, and `llms.txt` exposes it to agents.

## How much it saves

Owning El Tucu costs about USD 45 in parts, 14 days of waiting and 10 h of assembly and calibration (details in [`costs.md`](costs.md)). Rented: USD 1 per 5 minutes, starting today. The parts are worth ≈ 3.75 h of use, and an iteration (upload the routine, run it, measure) fits in a USD 1 block. The first test moves from day 15 to day 1. The gap grows with expensive hardware, which is what Forgers add.

## Why Solana

Solana is the infrastructure agents operate on: they discover the shell, pay, test and verify themselves with no account, no card and no human in the middle.

- **Agents that test themselves**: an agent that wrote a controller runs it on real hardware, measures (position reached and, with a current sensor on the shell, the mA each servo draws while moving) and fixes its own code. Each iteration is a USD 1 payment, and that only works with sub-cent fees and confirmation in seconds.
- **Gasless x402 for the agent**: the agent signs a USDC transfer and the facilitator submits it and pays the fee. A wallet holding only USDC is enough.
- **Solana Pay** for people: a QR with a `reference` per session. It's confirmed by looking up that account, with no contract and no odd amounts.
- **Confirmation in seconds and sub-cent fees**: they make USD 1 blocks viable and open the session as soon as the payment lands.
- **Global payments with no intermediaries**: a team in any country pays in USDC, and the Forger gets paid straight to their wallet.

## Demo

An agent tests its robotics code on real hardware:

1. It reads `llms.txt` and sees El Tucu (4-axis arm with live camera), USD 1 per 5 minutes.
2. It pays for 1 block with x402 in USDC and gets the session token.
3. It runs its motion sequence on the real arm.
4. It measures whether each joint reached the requested angle.
5. It returns the report with the tx on Solscan. The arm returns to HOME.
6. Video close: "this test cost USD 1 and 5 minutes; building the arm, USD 45 and two weeks".

In parallel, a person scans the QR with Phantom and takes control from the web console.

## Status

- Gateway with sessions, FIFO queue, automatic return to HOME, rate limit, MCP, `llms.txt` and agent card. Tests green.
- `solana-x402` rail: real 402 on devnet with USDC and the facilitator's fee payer; the example agent signs and the facilitator simulates the tx.
- `solana-pay` rail: Solana Pay QR (transaction request) that deposits into escrow.
- Escrow on Solana (Anchor program `shell_escrow`): when the session ends, 90 % to the Forger and 10 % to the platform; if the shell goes down, automatic refund; if the gateway disappears, the payer reclaims on their own. `anchor test` 7/7 and e2e on a local validator.
- Marketplace hub: Forgers register their gateway, the hub builds the catalog, checks health and publishes it via `llms.txt` and MCP.
- Customization requests: the customer writes to the Forger from the spec page; the Forger reads them with their token.
- Current sensor (INA219): driver in El Tucu's firmware, `current_ma` in `/state`; the mock, the gateway, the console and the example agent already show it (peak mA per step).
- Claude Code skills: one to rent and test code on a shell (with a spending cap) and one to turn a computer into a Forger (`pnpm forger`).
- Website: landing, catalog, QR checkout, console with camera and agent guide.
- Robot: El Tucu (ESP32 + 4 servos) running at events; the ESP32 stays on the local network behind the gateway.

## Roadmap

- Deploy the escrow program to devnet and make the first real payment with Phantom.
- Public tunnel and live camera for El Tucu; INA219 soldered.
- Mainnet with USD 0.01 blocks for the first test.
- More shells: rover, mobile camera, sensor benches.
- Per-shell reputation (uptime, completed sessions) visible to agents.

## References and competition

- **CrowdBrain** (Colosseum Grand Prize) validates the robotics space with on-chain incentives. Rent a Shell targets the same world from another side: teams and agents that need to test on real hardware and pay per use.
- **Renesas Lab on the Cloud** and academic remote labs (FPGAs) validate demand for real hardware over the web, but each vendor only shows its own boards. Rent a Shell is neutral, multi-Forger and built for agents.
- **paybot** (ETHGlobal): x402 payment to control a robot with a webcam. Rent a Shell adds timed sessions, queue, safe cutoff, MCP and payments for people.
