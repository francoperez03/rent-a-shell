---
name: rent-a-shell
description: Rents real hardware (Rent a Shell robots, called shells) by the minute to test robotics code in the physical world. Pays in USDC on Solana with x402, runs a motion plan, measures real angles and current, takes photos and returns a report. Use when the person says "test this on a real robot", "validate these angles on hardware", "how much current does this move draw", "rent an arm", "Rent a Shell", "probá esto en un robot real", "alquilá un brazo", or wants to compare a simulation against hardware.
---

# Rent a Shell · renting real hardware

Rent a Shell has a catalog of **shells**: real robots (today 4-axis ESP32 arms) published by **Forgers** and rented in 5-minute blocks. This skill gets the code you write with the person tested on real hardware instead of staying in the simulator: you pay for a block, run a plan, measure and come back with data.

What each shell measures today: the real angle of each joint (and whether the request was clamped to the safe range), whether it's still moving, the total servo bus current in mA (if the shell has the `current_ma` sensor) and a camera photo per step.

## Rules

- **Real money.** Before paying, show the person the shell, how many blocks and the total price, and wait for an explicit yes. That amount is `--max-usd`; never raise it without asking. Paying accepts the terms at https://rent-a-shell.vercel.app/terms (use within the spec's limits, no filming or identifying people, refunds only when the shell goes offline with escrow, devnet has no monetary value).
- The agent's wallet lives in `~/.rent-a-shell/wallet.json`. **Never show or copy the secret**: only the address.
- Plan within the spec's safe range. The gateway clamps whatever goes past it, but planning inside the range is better.
- If a step fails or the shell goes offline, don't retry by paying again without asking. When the shell goes down, a Solana Pay payment with escrow is refunded automatically; with x402 the Forger has to be told.

## 1. Install the client (once)

macOS / Linux:
```bash
mkdir -p ~/.rent-a-shell && cd ~/.rent-a-shell
curl -fsSL https://rent-a-shell.vercel.app/skills/rent/rent.mjs -o rent.mjs
echo '{"private":true}' > package.json && npm i @x402/fetch@2.27.0 @x402/core@2.27.0 @x402/svm@2.27.0 @solana/kit@^6
```
Windows (PowerShell, with `curl.exe`):
```powershell
mkdir $HOME\.rent-a-shell -Force; cd $HOME\.rent-a-shell
curl.exe -fsSL https://rent-a-shell.vercel.app/skills/rent/rent.mjs -o rent.mjs
Set-Content package.json '{"private":true}'; npm i @x402/fetch@2.27.0 @x402/core@2.27.0 @x402/svm@2.27.0 @solana/kit@^6
```
Requires Node 22+. The client is also in the repo: `https://github.com/francoperez03/rent-a-shell/blob/main/skills/rent-a-shell/rent.mjs`. Run every following command inside `~/.rent-a-shell`.

## 2. Agent wallet

```bash
node rent.mjs wallet
```
Creates the wallet the first time and prints the address. To pay it only needs **USDC** on the shell's network, no SOL: the x402 facilitator pays the fee. Ask the person to fund it:
- devnet: faucet.circle.com → Solana Devnet → the address;
- mainnet: any wallet or exchange that sends USDC on Solana.

## 3. Pick the shell

```bash
node rent.mjs info --gateway https://rent-a-shell.vercel.app
```
`--gateway` takes the website URL or a gateway URL (the site's `/llms.txt` names the live gateway). `info` returns the spec (joints and safe range, HOME, routines, sensors, price, Forger), the queue and the current state. If it's `busy`, the rental is queued and starts when the shell frees up (the client waits on its own). `node rent.mjs catalog --hub https://rent-a-shell.vercel.app` lists every shell and its gateway (the site is the catalog).

Without the client: the site and each gateway expose `llms.txt` and MCP (add `<gateway>/mcp` as a Streamable HTTP MCP server in your agent) to explore the catalog. Payment still goes through this client.

## 3b. Interactive session (the person steers, one command at a time)

For requests like "rent El Tucu for 5 minutes, open the gripper, then ask me what else": pay once, keep the session, send commands as the person asks.

1. `node rent.mjs info --gateway https://rent-a-shell.vercel.app` → show shell, blocks and total price, wait for the yes.
2. `node rent.mjs rent --gateway https://rent-a-shell.vercel.app --blocks 1 --max-usd 0.05` → pays, saves the session in `~/.rent-a-shell/session.json`, prints the seconds left, HOME and the ranges.
3. For each request: `node rent.mjs cmd --joint grip --angle 175` (or `--joint base --angle 120`, `--dance saludo`, `--stop`). It prints the real angle, whether it was clamped, the peak mA and the seconds left.
4. After every command, report what happened in one or two lines and **ask what to do next**, mentioning the time left. `node rent.mjs frame --out after.jpg` takes a photo if the person wants to see it; `node rent.mjs state` reads the angles.
5. `node rent.mjs end` when the person is done (the shell returns to HOME). If the session expires first, `cmd` says so: ask before renting again.

Gripper on El Tucu: range 130 to 175, HOME 150. "Open" means towards 175, "close" towards 130; take a frame if in doubt. Other joints: see the ranges that `rent` prints and plan inside them.

## 4. Write the plan (batch mode: a whole test in one run)

Translate what the person wants to test into a `plan.json` (list of steps):

```json
[
  {"frame": "start"},
  {"joint": "base", "angle": 130},
  {"joint": "shoulder", "angle": 110},
  {"joint": "elbow", "angle": 70},
  {"wait": 300},
  {"frame": "reach"},
  {"joint": "grip", "angle": 100},
  {"dance": "saludo"},
  {"stop": true}
]
```

| Step | What it does | What it returns |
|---|---|---|
| `{"joint","angle"}` | moves and waits until it arrives (max 4 s) | accepted angle, whether it was clamped, measured angle, whether it arrived, ms, peak mA |
| `{"dance"}` | runs a routine from the spec | duration, peak mA |
| `{"wait"}` | waits (max 30 s) | |
| `{"frame"}` | camera photo (with `--frames`) | JPG path |
| `{"stop"}` | stops in place | |

Work out how many blocks are needed: one block is 5 minutes and a move takes about 1 s. Almost everything fits in 1 block.

## 5. Run (with the person's yes)

```bash
node rent.mjs run --gateway <gateway> --shell <id> --plan plan.json --blocks 1 --max-usd <approved amount> --frames photos --out report.json
```
The client reads the 402 and, if the amount exceeds `--max-usd`, doesn't pay. Otherwise it pays with x402, waits its turn, runs the plan, **closes the session** (the shell returns to HOME) and leaves the report in `report.json`. Progress goes to stderr.

## 6. Read the report and answer

`report.json` has:
- `payment` with the tx on the explorer;
- `summary` (moves, how many arrived, how many were clamped and the peak mA);
- `steps`, step by step.

Tell the person concretely:
- what arrived and what didn't (requested versus measured angle, clamping to the range);
- the consumption (peak mA per move: useful to size the power supply or spot a strained servo);
- the photos (show them if the person wants to see them);
- the cost and the tx.

If the result contradicts the simulation, propose the code fix and, if the person wants, another run.

## Common problems

| Message | What's happening | What to do |
|---|---|---|
| `invalid_exact_svm_transaction_simulation_failed` or `insufficient` | the wallet has no USDC on that network | fund it (step 2) and check devnet versus mainnet |
| the 402 asks for more than the cap | it costs more than approved | ask the person |
| `session expired` in steps | the plan lasts longer than the blocks | more blocks or a shorter plan |
| `robot_offline` / 503 | the shell went down | tell the person; with escrow the refund is automatic |
| `rate_limited` | more than 10 commands per second | add `wait` between steps |
