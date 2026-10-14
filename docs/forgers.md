# Forgers · how to publish your hardware

## With Claude Code (recommended)

The `rent-a-shell-forger` skill walks Claude Code through the whole setup: requirements, ESP32, camera (MediaMTX + ffmpeg), configuration, escrow, tunnel and hub registration, and finishes with `pnpm forger:doctor`.

```bash
npx skills add francoperez03/rent-a-shell --skill rent-a-shell-forger
```

Then, in Claude Code: "I want to publish my robot on Rent a Shell". The skill is also in the repo, at `skills/rent-a-shell-forger/`.

The Forger's computer will most likely be a **Mac**: the skill is written for macOS first (Homebrew, Terminal camera and local network permissions, `caffeinate`, start via Login Items) and includes a section with the differences for Windows and Linux.

**One command to run everything:** `pnpm forger` (`scripts/forger/run.mjs`) starts MediaMTX, the camera (dshow on Windows, avfoundation on macOS, v4l2 on Linux), the Cloudflare tunnel, the gateway with the tunnel URL and the hub registration. It also restarts whatever crashes and re-registers if the tunnel URL changes. `pnpm forger:cameras` lists cameras and `CAMERA=test` uses a test signal.

Support tools: `pnpm forger:find-esp32` (finds the ESP32 on the local network), `pnpm forger:doctor` (end-to-end check), `pnpm --filter @ras/rails-solana operator-key` (operator wallet without showing the key) and `scripts/forger/mediamtx.yml` (camera config).

A Forger builds a shell, keeps it online, sets its price per 5-minute block (`BLOCK_USD`) and gets paid per block: with x402, upfront; with Solana Pay, from the escrow when the session ends (90 %). They run their own gateway next to their robot and register it in the hub.

## 1. Gateway

```bash
git clone https://github.com/francoperez03/rent-a-shell.git && cd rent-a-shell && pnpm install
cp apps/gateway/.env.example apps/gateway/.env.local
```

In `apps/gateway/.env.local`:

| Variable | What to set |
|---|---|
| `ESP32_URL` | robot IP on your local network |
| `PUBLIC_URL` | public HTTPS URL of the gateway (tunnel). Used by the hub, the website and wallets (transaction request) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `SHELL_ID`, `SHELL_NAME` | unique id in the catalog and display name |
| `SHELL_SENSORS` | `angles,current_ma` if you have an INA219; otherwise `angles` |
| `BLOCK_MINUTES`, `BLOCK_USD` | block length and price |
| `FORGER_NAME`, `FORGER_CONTACT` | how customers see you |
| `FORGER_TOKEN` | `openssl rand -hex 24`, to read requests |
| `RAILS` | `solana-x402,solana-pay` |
| `SOLANA_NETWORK` | `devnet` or `mainnet` |
| `SOLANA_PAY_TO` | your wallet address (Phantom). It only receives: the key never goes to the gateway |
| `SOLANA_OPERATOR_KEY` | base58 secret of a separate wallet with a little SOL for fees. It can only settle or refund escrows, never send funds anywhere else. Without it, Solana Pay charges directly with no escrow |

```bash
pnpm gateway
curl $PUBLIC_URL/api/shells     # your spec sheet
```

## 2. Register in the hub

```bash
curl -X POST https://<hub>/api/forgers \
  -H 'content-type: application/json' \
  -d '{"gateway":"https://<your-gateway>"}'
```

The hub fetches your `/api/shells`. If it responds, you're in the catalog (201); if not, 422. Every 30 s it checks that you're still online.

## 3. Getting paid

- People (Solana Pay with escrow): when the session ends you get 90 % and the platform keeps 10 %. If your robot is down for longer than `OFFLINE_REFUND_SECONDS`, the session is cut and the payment goes back to the customer.
- Agents (x402): you get 100 % straight to `SOLANA_PAY_TO`.

## 4. Customization requests

Customers leave requests from the shell's spec page (an extra sensor, a different end effector, a different mount):

```bash
curl -H "authorization: Bearer $FORGER_TOKEN" $PUBLIC_URL/api/forger/requests
```
