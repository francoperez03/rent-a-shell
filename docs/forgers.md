# Forgers · how to publish your hardware

## With an agent (recommended)

The `rent-a-shell-forger` skill walks your agent through the whole setup: ESP32, camera, Raspberry Pi over SSH, spec sheet, configuration, escrow, tunnel and hub registration, and finishes on the status page.

```bash
npx skills add francoperez03/rent-a-shell --skill rent-a-shell-forger
```

Then tell your agent: "I want to publish my robot on Rent a Shell". The skill is also in the repo, at `skills/rent-a-shell-forger/`.

The main setup is a **Raspberry Pi** next to the robot: `pnpm forger:deploy user@pi` installs everything over SSH and leaves it as the systemd service `rent-a-shell-forger`, with a status page at `http://<pi>:8790`. A Mac can run the same thing with `pnpm forger` for development.

**One process runs everything:** `scripts/forger/forger.mjs` starts MediaMTX, the camera (v4l2 on Linux, avfoundation on macOS), the Cloudflare tunnel, the gateway with the tunnel URL and the hub registration; it restarts whatever crashes, re-registers when the tunnel URL changes and serves the status page. Its tools: `pnpm forger:esp32` (finds the ESP32 on the LAN), `forger:cameras`, `forger:spec` (validates `shell.json`), `forger:doctor` (the status page's checks in a terminal). `CAMERA=test` uses a test signal.

A Forger builds a shell, keeps it online, sets its price per 5-minute block (`BLOCK_USD`) and gets paid per block: with x402, upfront; with Solana Pay, from the escrow when the session ends (90 %). They run their own gateway next to their robot and register it in the hub.

## 1. Gateway

```bash
git clone https://github.com/francoperez03/rent-a-shell.git && cd rent-a-shell && pnpm install
cp apps/gateway/.env.example apps/gateway/.env.local
```

**Spec sheet.** Everything customers and agents see about the shell lives in one file, `apps/gateway/shell.json`, plus its photo: id, name, kind, location, safe range and HOME per joint, routines, sensors, price per block, what owning one costs, your name and contact, and `image` (a square 1200 px jpg next to the json, e.g. `shell.jpg`). Copy `apps/gateway/shell.example.json`, fill it in and run `pnpm forger:spec`: it validates the file (HOME inside the ranges, price format, photo under 2 MB) and prints the sheet the way the site shows it. The gateway serves the photo at `/api/shells/<id>/image`. Env vars `SHELL_ID`, `SHELL_NAME`, `SHELL_LOCATION`, `SHELL_SENSORS`, `BLOCK_*` and `FORGER_*` still override single fields if you need that.

In `apps/gateway/.env.local`:

| Variable | What to set |
|---|---|
| `ESP32_URL` | robot IP on your local network |
| `PUBLIC_URL` | public HTTPS URL of the gateway (tunnel). Used by the hub, the website and wallets (transaction request) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `FORGER_TOKEN` | `openssl rand -hex 24`, to read requests |
| `RAILS` | `solana-x402,solana-pay` |
| `SOLANA_NETWORK` | `devnet` or `mainnet` |
| `SOLANA_PAY_TO` | your wallet address (Phantom). It only receives: the key never goes to the gateway |
| `SOLANA_OPERATOR_KEY` | base58 secret of a separate wallet with a little SOL for fees. It can only settle or refund escrows, never send funds anywhere else. Without it, Solana Pay charges directly with no escrow |

```bash
pnpm forger:deploy user@pi      # or pnpm forger on this machine
curl $PUBLIC_URL/api/shells     # your spec sheet
```

## 2. Register in the catalog

Registration needs a **Forger token**. Ask for one (contact in the site's footer or open an issue on the repo); you get a `rsf_…` string, one per Forger, good for up to three gateways. Put it in `apps/gateway/.env.local` as `HUB_TOKEN` and `pnpm forger` registers for you. By hand:

```bash
curl -X POST https://rent-a-shell.vercel.app/api/forgers \
  -H "authorization: Bearer $HUB_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"gateway":"https://<your-gateway>"}'
```

The site fetches your `/api/shells`. If it responds, you're in the catalog (201); if not, 422. Without a token, 401; with a shell id another Forger already publishes, 409 (ids belong to the token that registered them, so nobody can take yours over while your tunnel changes URL); the gateway URL must be public https. It re-checks every gateway whenever the catalog is requested (30 s cache); an unreachable gateway shows its shells as offline.

## 3. Getting paid

- People (Solana Pay with escrow): when the session ends you get 90 % and the platform keeps 10 %. If your robot is down for longer than `OFFLINE_REFUND_SECONDS`, the session is cut and the payment goes back to the customer.
- Agents (x402): you get 100 % straight to `SOLANA_PAY_TO`.

## 4. Customization requests

Customers leave requests from the shell's spec page (an extra sensor, a different end effector, a different mount):

```bash
curl -H "authorization: Bearer $FORGER_TOKEN" $PUBLIC_URL/api/forger/requests
```
