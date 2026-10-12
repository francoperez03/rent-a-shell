# 07 · Project A on the same core

Project A (`proyecto-a-hardware-rental/README.md`, sibling repo) targets people who want to practice Physical AI without building hardware. It uses the same pieces as Rent a Shell.

## What it shares

| Piece | Same in both |
|---|---|
| Robot | El Tucu, same spec |
| Gateway | same sessions, same lock, same cutoff |
| Camera | same HLS |
| Payments | same Solana rails |

## What changes

| | Rent a Shell | Project A |
|---|---|---|
| Who rents | agent | person learning |
| Default rail | x402 in USDC | Solana Pay in USDC |
| Main interface | MCP and `llms.txt` | web console |
| Hero copy | "A body for your agent" `[INPUT]` | "A Physical AI lab that charges in your currency" (suggested by the evaluation) |

## How it's presented

A single delivery with two doors on the website: "for people" (Solana Pay QR) and "for agents" (x402). Paying in local currency through a fiat on-ramp stays as a future idea: it would come in as another rail behind `PaymentRail`.

## Out of scope for now

- Uploading arbitrary firmware or code to the robot: replaced by high-level commands (`joint`, `dance`). It was the biggest risk of breaking the demo.
