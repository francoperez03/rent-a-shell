#!/usr/bin/env bash
# Turns a Raspberry Pi (Raspberry Pi OS / Debian, arm64) into a Forger, from this machine, over SSH.
#   pnpm forger:deploy user@host
# Installs Node 22, pnpm, ffmpeg, MediaMTX and cloudflared; clones or updates the repo in ~/rent-a-shell;
# copies apps/gateway/.env.local, shell.json and shell.jpg from here when they exist (CAMERA becomes /dev/video0);
# installs the systemd service rent-a-shell-forger and waits for the status page on :8790.
# Run it again to update: it is idempotent. Needs SSH key access (ssh-copy-id) and a sudo user on the Pi.
#   BRANCH=develop   branch to deploy (default main)
#   SUDO_PASS=...    the Pi user's sudo password, for agents without a terminal (otherwise sudo asks once)
set -euo pipefail
HOST="${1:?usage: pnpm forger:deploy user@host}"
BRANCH="${BRANCH:-main}"
GW="$(cd "$(dirname "$0")/../../apps/gateway" && pwd)"
REMOTE=/tmp/rent-a-shell-forger-setup.sh

cat > "${TMPDIR:-/tmp}/forger-setup.sh" <<'SETUP'
set -euo pipefail
BRANCH="$1"
if [ -n "${SUDO_PASS:-}" ]; then echo "$SUDO_PASS" | sudo -S -v 2>/dev/null; else sudo -v; fi
ARCH="$(dpkg --print-architecture)" # arm64 on a Pi 5 / Pi 4 with 64-bit OS

echo "== packages"
sudo apt-get update -qq 2>/dev/null
sudo apt-get install -y -qq ffmpeg git curl v4l-utils ca-certificates >/dev/null
if ! node -v 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  sudo apt-get install -y -qq nodejs >/dev/null
fi
sudo corepack enable
if ! command -v mediamtx >/dev/null; then
  TAG="$(basename "$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/bluenviron/mediamtx/releases/latest)")"
  curl -fsSL "https://github.com/bluenviron/mediamtx/releases/download/$TAG/mediamtx_${TAG}_linux_${ARCH}.tar.gz" | sudo tar -xz -C /usr/local/bin mediamtx
fi
if ! command -v cloudflared >/dev/null; then
  curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
  sudo dpkg -i /tmp/cloudflared.deb >/dev/null
fi
sudo usermod -aG video "$USER"
echo "node $(node -v) · $(mediamtx --version 2>&1 | head -1) · $(cloudflared --version | head -1)"

echo "== code ($BRANCH)"
if [ -d ~/rent-a-shell/.git ]; then
  git -C ~/rent-a-shell fetch -q origin "$BRANCH" && git -C ~/rent-a-shell checkout -q "$BRANCH" && git -C ~/rent-a-shell reset -q --hard "origin/$BRANCH"
else
  git clone -q -b "$BRANCH" https://github.com/francoperez03/rent-a-shell.git ~/rent-a-shell
fi
cd ~/rent-a-shell
# only the gateway and its packages: the site (Next, sharp) stays out of the Pi
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --filter "gateway..." --frozen-lockfile --reporter=silent
# config copied from the deploying machine; the Pi's camera is v4l2
if [ -d /tmp/forger-config ]; then
  cp /tmp/forger-config/* apps/gateway/ && rm -rf /tmp/forger-config
  ENV=apps/gateway/.env.local
  if [ -f $ENV ]; then grep -q '^CAMERA=' $ENV && sed -i 's|^CAMERA=.*|CAMERA=/dev/video0|' $ENV || echo CAMERA=/dev/video0 >> $ENV; fi
fi

echo "== service"
sudo tee /etc/systemd/system/rent-a-shell-forger.service >/dev/null <<UNIT
[Unit]
Description=Rent a Shell Forger (gateway, camera, tunnel, status page on :8790)
Wants=network-online.target
After=network-online.target

[Service]
User=$USER
WorkingDirectory=$HOME/rent-a-shell
ExecStart=$(command -v node) scripts/forger/forger.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable -q rent-a-shell-forger
sudo systemctl restart rent-a-shell-forger
SETUP

echo "== $HOST"
ssh "$HOST" "rm -rf /tmp/forger-config && mkdir -p /tmp/forger-config"
for f in .env.local shell.json shell.jpg; do
  [ -f "$GW/$f" ] && scp -q "$GW/$f" "$HOST:/tmp/forger-config/$f" && echo "copying $f"
done
scp -q "${TMPDIR:-/tmp}/forger-setup.sh" "$HOST:$REMOTE"
ssh -tt "$HOST" "SUDO_PASS='${SUDO_PASS:-}' bash $REMOTE $BRANCH; s=\$?; rm -f $REMOTE; exit \$s"

IP="$(ssh -G "$HOST" | awk '/^hostname /{print $2}')" # resolves ~/.ssh/config aliases
echo "== waiting for http://$IP:8790"
for _ in $(seq 1 30); do
  if curl -fsS -m 3 "http://$IP:8790/health" >/dev/null 2>&1; then
    echo "Forger up: http://$IP:8790 (logs: ssh $HOST journalctl -u rent-a-shell-forger -f)"
    exit 0
  fi
  sleep 3
done
echo "The status page did not answer. Logs: ssh $HOST journalctl -u rent-a-shell-forger -n 50"
exit 1
