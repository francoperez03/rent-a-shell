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

- USD 1 per 5-minute block, available today.
- **Break-even:** the parts are worth ≈ 45 blocks, that is ≈ 3.75 h of use. A typical iteration (upload a routine, run it, measure) fits in one block.

## Takeaways

- To validate an idea and run the first few dozen tests, renting is cheaper. It also wins on time: you test on day 1 instead of day 15.
- If the team will use the hardware for many hours, buying is better, and Rent a Shell helped them decide with data before spending.
- The gap grows with expensive hardware (research-grade arms, industrial sensors, LiDAR). That's the catalog Forgers add.

The same numbers are shown in each shell's spec sheet (`build` in the spec, the `/shells/:id` page and `llms.txt`).
