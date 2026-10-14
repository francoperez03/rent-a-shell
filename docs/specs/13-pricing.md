# 13 · Pricing per shell

At USD 0.05 per block and a 10 % fee the platform earns USD 0.001 per minute. El Tucu is the cheap demo. The business is in hardware that costs more and in packages for teams and courses. The price already lives on each shell's spec sheet (`pricing.usd`, from the Forger's `BLOCK_USD`); this spec makes it a deliberate Forger decision and shows the fee everywhere.

## Rules

- Each Forger sets `BLOCK_USD` and `BLOCK_MINUTES` for their gateway; the spec publishes them as `pricing`. The hub, `llms.txt`, MCP, the checkout and the rent client read the spec, never a global constant. `pnpm forger:doctor` warns when the price is the default.
- Take rate: 10 % (`fee_bps = 1000` in the program config) on every escrow settle. With `14-x402-escrow.md`, agent payments settle through the escrow too, so the fee applies to both rails. Until then x402 pays the Forger 100 %, and `llms.txt` says so.
- The site stops quoting a fixed "one cent per minute"; the landing reads the first shell's price from the catalog.

## Example with numbers (also in `docs/costs.md`)

| Shell | Price per 5-min block | Hours per day rented | Gross per day | Platform (10 %) | Forger (90 %) |
|---|---|---|---|---|---|
| El Tucu (hobby arm) | USD 0.05 | 6 | USD 3.60 | USD 0.36 | USD 3.24 |
| Sensor test bench | USD 2 | 6 | USD 144 | USD 14.40 | USD 129.60 |
| Industrial arm | USD 10 | 4 | USD 480 | USD 48 | USD 432 |

A monthly package for a course (for example 200 blocks for USD 300 on a bench) is a prepaid wallet with a spending cap, which is what the rent skill already does with `--max-usd`. `[INPUT]` Franco: first paying segment and the first price list.

## Verification

Gateway tests set `BLOCK_USD` explicitly and pass; `llms.txt` prints price and fee; the landing shows the catalog price; `docs/costs.md` has the table above.
