# Costs · owning versus renting

Numbers for El Tucu (4-axis arm). Date: 2026-10-12. Part prices are **estimates**: servo prices come from [eBay](https://www.ebay.de/itm/296900127841) and [Amazon](https://pricehistory.app/p/tishvi-sg0-micro-servo-motor-plastic-gear-sHlbpxmb) listings. ESP32, PLA and power supply prices are market references `[to verify]` against Mercado Libre AR.

## Owning it

| Item | USD |
|---|---|
| 4 SG90 servos (≈ 3 each) | 12 |
| ESP32 devkit | 8 |
| PLA for the parts (≈ 200 g) | 5 |
| 5 V 3 A power supply + cables + screws | 12 |
| Shipping / import | 8 |
| **Total parts** | **≈ 45** |

Besides the money:
- **Wait:** ≈ 14 days until the parts arrive in Argentina.
- **Build:** ≈ 10 h across printing, assembly, firmware and calibration. Without a printer the parts have to be outsourced, which adds cost and days.
- **Skills:** someone who can print, wire and calibrate servos.

## Renting it

- USD 0.05 per 5-minute block, El Tucu's price today (each Forger sets the price of their shell).
- **Break-even:** the parts are worth about 900 blocks, that is about 75 h of use. A typical iteration (upload a routine, run it, measure) fits in one block.

## Pricing other hardware

Each Forger sets the price per block of their shell (`BLOCK_USD`); the platform keeps 10 % of every escrow settle. El Tucu is the cheap demo; the business is in hardware that costs more and in packages for teams and courses.

| Shell | Price per 5-min block | Hours per day rented | Gross per day | Platform (10 %) | Forger (90 %) |
|---|---|---|---|---|---|
| El Tucu (hobby arm) | USD 0.05 | 6 | USD 3.60 | USD 0.36 | USD 3.24 |
| Sensor test bench | USD 2 | 6 | USD 144 | USD 14.40 | USD 129.60 |
| Industrial arm | USD 10 | 4 | USD 480 | USD 48 | USD 432 |

A monthly package for a course (for example 200 blocks for USD 300 on a bench) is a prepaid wallet with a spending cap, which is what the rent skill already does with `--max-usd`.

## Takeaways

- To validate an idea and run the first few dozen tests, renting is cheaper. It also wins on time: you test on day 1 instead of day 15.
- If the team will use the hardware for many hours, buying is better, and Rent a Shell helped them decide with data before spending.
- The gap grows with expensive hardware (research-grade arms, industrial sensors, LiDAR). That's the catalog Forgers add.

The same numbers are shown in each shell's spec sheet (`build` in the spec, the `/shells/:id` page and `llms.txt`).
