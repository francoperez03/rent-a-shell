# 05 · Agents

How an agent discovers a shell, pays for it and controls it with no human help.

## Discovery

| Channel | What it is | Where |
|---|---|---|
| `llms.txt` | plain-text instructions: what Rent a Shell is, each shell's spec, how to pay with x402, how to send commands, examples with `curl` and `@x402/fetch` | gateway `/llms.txt`, generated from the shell spec; the hub's `/llms.txt` lists the whole catalog |
| MCP | MCP server in the gateway (and a catalog MCP in the site) | `https://<gateway-url>/mcp`, `https://rent-a-shell.vercel.app/mcp` |
| Agent card | JSON with services (web, MCP, x402, `llms.txt`) and active payment methods | `https://<gateway-url>/.well-known/agent.json` |
| Claude Code skill | `skills/rent-a-shell`: rents, runs a plan, measures and reports, with a spending cap | `https://rent-a-shell.vercel.app/skills/rent/SKILL.md` |

## MCP tools

| Tool | Input | Output |
|---|---|---|
| `list_shells` | | specs with status and price |
| `rent_shell` | `{shell, blocks}` | creates the x402 intent (the escrow for that session, `14-x402-escrow.md`) and returns the bound URL to pay (MCP clients don't sign payments); the agent pays over HTTP (R1) and passes the token |
| `send_command` | `{token, cmd, args}` | ESP32 response (angles, `clamped`) |
| `get_frame` | `{shell}` | current JPEG image |
| `get_state` | `{shell}` | angles, whether it's moving and `current_ma` |
| `end_session` | `{token}` | `{ok}` and robot at HOME |

## Paying with x402 in two steps

When the gateway has an operator key, agent payments go through the escrow (`14-x402-escrow.md`): `POST /api/sessions/intent {shell, blocks, rail: "solana-x402"}` opens the session's escrow and returns `instructions.url` (`/api/sessions/x402?shell&blocks&intent=<id>`); the agent pays that URL with `@x402/fetch` as before. A payment to the bare URL answers 402 `{error: "intent_required"}`. Without an operator key the bare URL still works and pays the Forger directly. `rent.mjs`, `apps/buyer` and the MCP `rent_shell` tool do the two steps on their own.

## Example buyer agent (`apps/buyer`)

Node script for the demo and for end-to-end testing:

1. Reads `/llms.txt` or calls `list_shells`.
2. Pays 1 block with x402 using `@x402/fetch` + `@x402/svm` (Solana wallet with USDC, no SOL; key in `.env.local`, never in git).
3. Runs a test routine: `joint` through a sequence of angles, recording the peak current while it moves.
4. Returns a report: steps, requested versus measured angles (`/state`), peak mA, payment tx.

## Demo case

The one with the most support in the Colosseum evaluation: **an agent tests its robotics code on real hardware**.

90-second script:
1. In Claude Code: "test this motion sequence on a real arm and tell me if it reaches the position".
2. The agent reads `llms.txt`, pays USD 0.05 in USDC with x402 (the tx shows on Solscan).
3. The arm moves on the website camera; the HUD shows "SESSION · AGENT · 04:59".
4. The agent returns the report with frames.
5. Close: at expiry, the arm returns to HOME on its own.

Alternative cases: remote inspection with evidence (frame + tx) and a simple task requested by another agent.

## Security

- The agent only reaches the gateway's allowlist. There's no way to upload firmware or code to the ESP32.
- The token expires on its own. A stolen token works at most until `exp`.
- `llms.txt` and MCP responses are public data: they carry no secrets or local IPs.
