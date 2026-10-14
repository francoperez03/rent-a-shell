---
name: rent-a-shell-forger
description: Turns this computer (macOS first; also Windows and Linux) into a Rent a Shell Forger. Installs and configures the gateway that connects a robot (ESP32) and a webcam, charges in USDC on Solana, opens a public tunnel and publishes the shell in the hub's catalog. Use when the person says "I want to be a Forger", "publish my robot on Rent a Shell", "connect my ESP32 to Rent a Shell", "start the gateway", "why doesn't my shell show up in the hub", "quiero ser Forger" or "publicar mi robot en Rent a Shell".
---

# Rent a Shell · Forger

A **Forger** builds a robot, publishes it on Rent a Shell and gets paid for every minute someone (a person or an AI agent) uses it. This skill leaves the Forger's computer running as a **gateway**: a Node process that lives next to the robot and bridges the internet and the hardware.

```
webcam ─ ffmpeg ─> MediaMTX ─┐
ESP32 (local WiFi) <─────────┼── gateway (node :8787) ── tunnel ──> website (catalog), agents
                             │    charges in USDC (x402 and Solana Pay with escrow),
                             │    sessions, queue, safe cutoff, MCP, llms.txt
        pnpm forger  ────────┘    (a single process starts and supervises everything)
```

Work in order and **verify each step before moving on**. At the end run the doctor. Talk to the person in their language with short steps; only ask what you can't detect.

## Rules

- **Never ask for or write down the private key of the Forger's main wallet.** To get paid, its public **address** is enough (`SOLANA_PAY_TO`).
- The only key generated here is the **escrow operator**'s. It's a new wallet that can only release or refund payments. The script writes it straight into `.env.local` and never shows it.
- `.env.local` never goes to git.
- Before opening the public tunnel, confirm with the person: it exposes the gateway to the internet.
- **macOS is the main platform.** At the end there's a section with the differences for Windows and Linux.

## 1. Requirements (macOS)

With Homebrew (if missing: brew.sh):
```bash
brew install node pnpm ffmpeg mediamtx cloudflared git
```
Check with `node -v` (22+), `ffmpeg -version`, `mediamtx --version` and `cloudflared --version`.

## 2. Get the gateway

```bash
git clone https://github.com/francoperez03/rent-a-shell.git
cd rent-a-shell
pnpm install
cp apps/gateway/.env.example apps/gateway/.env.local
```

## 3. Robot and camera

**ESP32.** The robot must be powered on and on the same WiFi network as the Mac.
```bash
pnpm forger:find-esp32
```
It prints `http://<ip>` for each shell that responds. On macOS 15+ the first time you'll see "Terminal would like to find devices on your local network": it must be **allowed**, or nothing is found. If it was denied, enable it in System Settings → Privacy & Security → Local Network → Terminal.

If no shell shows up:
- Ask the person for the IP (the firmware's serial monitor or the router shows it).
- Check that the router doesn't have client isolation turned on.

Verify with `curl http://<ip>/state`, which should return `ok:true` and `angles`.

**Camera.**
```bash
pnpm forger:cameras
```
It prints the cameras with their index. Use the index as `CAMERA` (the built-in one is usually `0`; a USB camera or the iPhone via Continuity show up separately).
- The first time ffmpeg opens the camera, macOS asks for permission for the **Terminal** (or whichever terminal app is used) and the person has to accept it. If it was denied: System Settings → Privacy & Security → Camera → enable the terminal.
- With no webcam at hand everything can be tested with `CAMERA=test` (test signal).

## 4. Configuration (`apps/gateway/.env.local`)

Ask the person:
- **Solana address** to get paid: `SOLANA_PAY_TO`, the public one (Phantom → copy address).
- **Shell name** (`SHELL_NAME`), **id** with no spaces and unique in the catalog (`SHELL_ID`) and **location** (`SHELL_LOCATION`).
- **Forger name** (`FORGER_NAME`) and an optional **contact** for requests (`FORGER_CONTACT`).
- **Network:** `SOLANA_NETWORK=devnet` to test or `mainnet` to charge for real.
- **Price per block** (`BLOCK_USD`, default `0.05`) and block length (`BLOCK_MINUTES`, default `5`). The platform keeps 10 % of escrow settles; the Forger decides the price of their own shell.
- **Terms:** the person reads and accepts https://rent-a-shell.vercel.app/terms (safe hardware for remote use, fixed camera framing on the robot with a visible notice at the place, they answer for their equipment and the place). Do not publish the shell until they say yes.

Fill in without asking:
```
SESSION_SECRET=<openssl rand -hex 32>
FORGER_TOKEN=<openssl rand -hex 24>
ESP32_URL=<step 3>
CAMERA=<step 3>
RAILS=solana-x402,solana-pay
HUB_URL=https://rent-a-shell.vercel.app   # the site is the catalog: pnpm forger registers your gateway there
```
Don't set `PUBLIC_URL`: the tunnel assigns it on each start.

**Escrow (recommended).** With an operator, payments from people stay in escrow until the session ends, and if the robot goes down they're refunded automatically.
```bash
pnpm --filter @ras/rails-solana -s operator-key
```
It's written into `.env.local` and the command prints only the address. Ask the person to send it ~0.05 SOL for fees (on devnet, from faucet.solana.com).

## 5. Start (confirm the tunnel first)

```bash
pnpm forger
```
A single process starts MediaMTX, the camera, the Cloudflare tunnel, the gateway with the tunnel's public URL and the hub registration. Also:
- If something crashes, it restarts it.
- If the tunnel changes URL, it restarts the gateway and re-registers.
- On macOS it keeps the Mac awake while it runs (with `caffeinate`).
- The public URL is saved in `apps/gateway/data/public-url.txt`.

Without a tunnel (to test on the local network): `TUNNEL=none`. With a fixed URL (named tunnel or Tailscale Funnel): set `PUBLIC_URL=https://...` and `TUNNEL=none`.

## 6. Verify everything

In another terminal tab:
```bash
pnpm forger:doctor
```
It should end with everything green and no ✗ lines. Each ✗ (critical) or ! (warning) line says what to fix. For a real payment test, follow `docs/plans/PLAN.md` (buyer with devnet USDC).

## 7. Start automatically (macOS)

macOS camera permission belongs to the **Terminal**. That's why the most reliable autostart opens the Terminal:
1. Create `~/RentAShellForger.command`:
   ```bash
   cat > ~/RentAShellForger.command <<EOF
   #!/bin/zsh
   cd "$(pwd)" && pnpm forger
   EOF
   chmod +x ~/RentAShellForger.command
   ```
2. System Settings → General → Login Items → **+** → choose `RentAShellForger.command`.

So the Mac keeps serving:
- System Settings → Battery/Energy: "Prevent automatic sleeping when the display is off" (with the charger plugged in).
- With the lid closed, a MacBook sleeps unless it has an external display: better leave it open with minimum brightness.
- If the Mac asks for a password at boot, enable automatic login or leave the session open.

Avoid pm2 or `launchd` for this case: they run outside the Terminal and macOS usually denies them the camera without showing the prompt.

## Daily operation

- **Customization requests:** `curl http://localhost:8787/api/forger/requests -H "Authorization: Bearer <FORGER_TOKEN>"`.
- **Payments:** arrive at `SOLANA_PAY_TO`. With x402, directly; with Solana Pay and escrow, 90% when each session ends.
- **Robot down:** if it stays offline for more than 2 minutes during a paid session, the gateway cuts the session and refunds.

## Common problems

| Symptom | Likely cause | Fix |
|---|---|---|
| `find-esp32` finds nothing | local network permission denied, other network or AP isolation | Privacy & Security → Local Network → Terminal; same WiFi |
| `[camera]` restarts in a loop | camera permission denied, wrong index or camera in use | Privacy & Security → Camera; `pnpm forger:cameras`; close FaceTime/Zoom |
| `Selected framerate … is not supported` | the camera doesn't do 30 fps at that size | `CAMERA_FPS=15` or `CAMERA_SIZE=1280x720` |
| `mediamtx` with `400 Bad Request` | Homebrew default config | `scripts/forger/mediamtx.yml` is already used; don't start another mediamtx separately |
| hub shows offline | the tunnel dropped or changed | check the `pnpm forger` log: it re-registers on its own |
| `shell_id_taken` (409) when registering | another Forger uses that `SHELL_ID` | pick another id |
| Solana Pay doesn't open the wallet | `PUBLIC_URL` without https | use the tunnel (transaction requests require https) |

## Windows and Linux

The code is the same and `pnpm forger` works the same. This changes:
- **Windows (PowerShell):**
  - install with `winget install OpenJS.NodeJS.LTS Git.Git Gyan.FFmpeg Cloudflare.cloudflared`; MediaMTX comes from the releases zip (`MEDIAMTX_PATH` if it isn't on the PATH);
  - `curl.exe` instead of `curl` and `Copy-Item` instead of `cp`;
  - secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;
  - `CAMERA` is the **exact name** that `pnpm forger:cameras` prints (dshow);
  - edit `.env.local` with an editor and not with PowerShell redirections (they write UTF-16);
  - autostart goes as a scheduled task (`Register-ScheduledTask` with `node scripts\forger\run.mjs` at logon);
  - the firewall prompt can be denied.
- **Linux:** `CAMERA=/dev/videoN` and start with systemd or pm2.
