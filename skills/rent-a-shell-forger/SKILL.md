---
name: rent-a-shell-forger
description: Turns a Raspberry Pi (over SSH, as a systemd service) or this Mac into a Rent a Shell Forger. Installs and configures the gateway that connects a robot (ESP32) and a webcam, charges in USDC on Solana, opens a public tunnel and publishes the shell in the hub's catalog. Use when the person says "I want to be a Forger", "publish my robot on Rent a Shell", "connect my ESP32 to Rent a Shell", "start the gateway", "set up this Raspberry as a Forger", "dejá esta raspberry como forger", "why doesn't my shell show up in the hub", "quiero ser Forger" or "publicar mi robot en Rent a Shell".
---

# Rent a Shell · Forger

A **Forger** builds a robot, publishes it on Rent a Shell and gets paid for every minute someone (a person or an AI agent) uses it. This skill leaves a computer next to the robot running as a **gateway**: a Node process that bridges the internet and the hardware. The main target is a **Raspberry Pi** on the robot's network, set up from the person's Mac over SSH and kept alive by systemd; a Mac can also run it for development.

```
webcam ─ ffmpeg ─> MediaMTX ─┐
ESP32 (local WiFi) <─────────┼── gateway (node :8787) ── tunnel ──> website (catalog), agents
                             │    charges in USDC (x402 and Solana Pay with escrow),
                             │    sessions, queue, safe cutoff, MCP, llms.txt
        pnpm forger  ────────┘    (one process starts and supervises everything,
                                   status page on :8790)
```

Work in order and **verify each step before moving on**. At the end check the status page (step 6). Talk to the person in their language with short steps; only ask what you can't detect.

## Rules

- **Never ask for or write down the private key of the Forger's main wallet.** To get paid, its public **address** is enough (`SOLANA_PAY_TO`).
- The only key generated here is the **escrow operator**'s: a new wallet that can only release or refund payments. The script writes it straight into `.env.local` and never shows it.
- `.env.local` never goes to git.
- Before opening the public tunnel, confirm with the person: it exposes the gateway to the internet.
- Config lives on the person's machine (`apps/gateway/`) and `deploy` copies it to the Pi; edit it there and deploy again.

## 1. Get the gateway (on the person's machine)

```bash
git clone https://github.com/francoperez03/rent-a-shell.git && cd rent-a-shell
pnpm install
cp apps/gateway/.env.example apps/gateway/.env.local
```
On macOS, for local runs: `brew install node pnpm ffmpeg mediamtx cloudflared`. The Pi gets its own tools from `deploy`.

## 2. Robot, camera and Raspberry Pi

**ESP32.** Powered on and on the same WiFi as the machine.
```bash
pnpm forger:esp32
```
It prints `http://<ip>` for each shell that answers. On macOS 15+ allow "Terminal would like to find devices on your local network" (Privacy & Security → Local Network). If nothing shows up: the IP from the firmware's serial monitor or the router, and no client isolation on the router. Check with `curl http://<ip>/state` (`ok:true` and `angles`).

**Raspberry Pi.** 64-bit Raspberry Pi OS flashed with Raspberry Pi Imager, with SSH enabled, a user and WiFi set in its customization step, and a USB webcam plugged in.
1. Find it: `ping <hostname>.local`, or sweep the network (`for i in $(seq 1 254); do ping -c1 -W300 192.168.1.$i >/dev/null & done; wait; arp -an`) and look for a new host with port 22 open (`nc -z <ip> 22`; its banner says Debian).
2. Key access: `ssh-copy-id -i ~/.ssh/id_ed25519.pub user@ip`, then an alias in `~/.ssh/config` with `IdentitiesOnly yes`. Without it, a machine with several keys offers the wrong ones first and the Pi refuses after a few tries:
   ```
   Host forger-pi
     HostName <ip>
     User <user>
     IdentityFile ~/.ssh/id_ed25519
     IdentitiesOnly yes
   ```
3. Camera: `ssh forger-pi v4l2-ctl --list-devices` (the first `/dev/videoN` of the USB camera; usually `/dev/video0`).

**Camera on a Mac** (development): `pnpm forger:cameras` prints the indexes for `CAMERA`; macOS asks camera permission for the Terminal the first time. `CAMERA=test` is a test signal for both.

## 3. Spec sheet (`apps/gateway/shell.json`)

The spec sheet is what the site shows on the shell's page, what agents read in `llms.txt` and what the gateway enforces (safe ranges). One file, `apps/gateway/shell.json`, plus a photo next to it. Start from the example and fill it in with the person, one group at a time; show each answer back before moving on.

```bash
cp apps/gateway/shell.example.json apps/gateway/shell.json
```

Ask, in this order (the `_help` block in the file explains every field; delete it or leave it, the gateway ignores it):
1. **Identity**: `name` (what customers see), `id` (lowercase slug, unique in the catalog, e.g. `el-tucu`), `kind` (`arm-4dof` for a four-joint arm: base, shoulder, elbow, grip), `location` as "City, CC".
2. **Safe ranges**: for each joint, the `[min, max]` in degrees the servo can reach without hitting anything, and the `home` pose inside those ranges. If the person does not know them, measure: with the robot on, move each joint by hand to its ends and read `curl $ESP32_URL/state`. Commands outside the range are clamped, so a narrow range is safe and a wide one is risky.
3. **Routines**: the names the firmware accepts for the dance command (El Tucu: `robot`, `lento`, `saludo`, `recta`). Only list what the firmware really has.
4. **Sensors**: `angles` always; add `current_ma` only with an INA219 on the servo bus.
5. **Price**: `pricing.usd` per block as a string with two decimals (default `"0.05"`) and `block_minutes` (default 5). The platform keeps 10 % of escrow settles; the Forger sets the price.
6. **Owning one**: `build.parts_usd` (what the parts cost), `lead_days` (days to get them) and `build_hours` (assembly). The site shows "the parts alone buy N hours here" from these.
7. **Forger**: `forger.name`, optional `contact` (a link customers can open) and `customizations` (true if they take requests for extra sensors, effectors or mounts).
8. **Photo**: ask for a picture of the robot. Square, 1200 px, the robot filling the frame, no people. Save it as `apps/gateway/shell.jpg` (`image: "shell.jpg"`). On macOS crop and resize with `sips`: `sips -c <h> <w> --resampleWidth 1200 in.jpg --out apps/gateway/shell.jpg`. Keep it under 2 MB. Without a photo the site shows a dark placeholder.

Then validate and show the result to the person until they say it is right:
```bash
pnpm forger:spec
```
It prints the sheet the way the site shows it and exits 1 with the field to fix when something is wrong (HOME outside a range, a price with three decimals, a missing photo). The gateway refuses to start with an invalid `shell.json`, so this has to pass before step 5.

## 4. Configuration (`apps/gateway/.env.local`)

Ask the person:
- **Solana address** to get paid: `SOLANA_PAY_TO`, the public one (Phantom → copy address).
- **Network:** `SOLANA_NETWORK=devnet` to test or `mainnet` to charge for real.
- **Terms:** the person reads and accepts https://rent-a-shell.vercel.app/terms (safe hardware for remote use, fixed camera framing on the robot with a visible notice at the place, they answer for their equipment and the place). Do not publish the shell until they say yes.

Fill in without asking:
```
SESSION_SECRET=<openssl rand -hex 32>
FORGER_TOKEN=<openssl rand -hex 24>
ESP32_URL=<step 2>
CAMERA=<step 2>   # /dev/video0 on a Pi (deploy sets it)
RAILS=solana-x402,solana-pay
HUB_URL=https://rent-a-shell.vercel.app   # the site is the catalog: pnpm forger registers your gateway there
HUB_TOKEN=<Forger token>                   # ask the Rent a Shell admin for one (see docs/forgers.md); without it the gateway is not listed
```
Don't set `PUBLIC_URL`: the tunnel assigns it on each start.

**Escrow (recommended).** With an operator, payments from people stay in escrow until the session ends, and if the robot goes down they're refunded automatically.
```bash
pnpm --filter @ras/rails-solana -s operator-key
```
It's written into `.env.local` and the command prints only the address. Ask the person to send it ~0.05 SOL for fees (on devnet, from faucet.solana.com).

## 5. Install on the Pi and start (confirm the tunnel first)

```bash
pnpm forger:deploy forger-pi
```
One command, safe to run again (it updates and restarts):
- installs Node 22, pnpm, ffmpeg, MediaMTX and cloudflared;
- clones or updates the repo in `~/rent-a-shell` (`BRANCH=main` by default) and installs only the gateway;
- copies `apps/gateway/.env.local`, `shell.json` and `shell.jpg` from this machine and sets `CAMERA=/dev/video0`;
- installs the systemd service `rent-a-shell-forger` (starts on boot, restarts on crash) and waits for the status page.

sudo asks for the Pi user's password once. An agent without a terminal passes it as `SUDO_PASS=... pnpm forger:deploy forger-pi`; ask the person for it and do not write it anywhere.

The service starts MediaMTX, the camera, the Cloudflare quick tunnel, the gateway with the tunnel's URL and the hub registration. If something crashes it restarts it; if the tunnel changes URL it restarts the gateway and re-registers.

**On a Mac instead:** `pnpm forger` in a terminal (it keeps the Mac awake with `caffeinate`). Without a tunnel, to test on the LAN: `TUNNEL=none`. With a fixed URL: `PUBLIC_URL=https://...` and `TUNNEL=none`.

## 6. Verify everything

Open **`http://<pi-ip>:8790`**: one table with each process (up, restarts, last log line), the public URL, the hub registration and every check (ESP32, camera frame, HLS, gateway, public URL, hub), each with what to fix. It refreshes every 5 s; `/health` is the same as JSON. It is only on the local network: the tunnel exposes the gateway, not this page.

The same checks in a terminal: `ssh forger-pi 'cd rent-a-shell && pnpm forger:doctor'` (or `pnpm forger:doctor` on a Mac). Logs: `ssh forger-pi journalctl -u rent-a-shell-forger -f`.

For a real payment test, follow `docs/plans/PLAN.md` (buyer with devnet USDC).

## Daily operation

- **Customization requests:** `curl http://<pi-ip>:8787/api/forger/requests -H "Authorization: Bearer <FORGER_TOKEN>"`.
- **Payments:** arrive at `SOLANA_PAY_TO`. With x402, directly; with Solana Pay and escrow, 90% when each session ends.
- **Robot down:** if it stays offline for more than 2 minutes during a paid session, the gateway cuts the session and refunds.

## Common problems

| Symptom | Fix |
|---|---|
| `forger:esp32` finds nothing | same WiFi; no AP isolation; on macOS allow Local Network for the Terminal |
| SSH `Permission denied (publickey,password)` right after a reboot | the client offered other keys first: `IdentitiesOnly yes` in the alias |
| camera row down, restarting | `v4l2-ctl --list-devices` for the right `/dev/videoN`; a camera without MJPG needs `CAMERA_INPUT_FORMAT=yuyv422` and a smaller `CAMERA_SIZE` |
| `Selected framerate … is not supported` | `CAMERA_FPS=15` or `CAMERA_SIZE=1280x720` |
| hub row says rejected (409 `shell_id_taken`) | another Forger token owns that `SHELL_ID`: pick another id |
| hub shows offline | status page: tunnel row and public URL; the service re-registers on its own |
| Solana Pay does not open the wallet | `PUBLIC_URL` without https: use the tunnel |
