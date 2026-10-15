#!/usr/bin/env node
// Forger launcher: a single process that starts and supervises everything running next to the robot.
// Works the same on macOS, Windows and Linux (no shell, no pm2).
//   node scripts/forger/run.mjs                 → MediaMTX + camera + tunnel + gateway + hub registration
//   node scripts/forger/run.mjs --list-cameras  → camera names for CAMERA
// Reads apps/gateway/.env.local. Its own variables (all optional):
//   CAMERA        macOS: index (avfoundation, default 0) · Windows: exact name (dshow) · Linux: /dev/videoN · "test"
//   CAMERA_SIZE   e.g. 1280x720 · CAMERA_FPS e.g. 30 (on Windows they are skipped unless set: native mode) · CAMERA_OUT_FPS 15 · CAMERA_KBPS 700 (stream out)
//   TUNNEL        cloudflared (default when PUBLIC_URL is missing or localhost) | ngrok (fixed domain: set PUBLIC_URL to it) | none
//   HUB_URL       if set, registers there (and re-registers when the tunnel URL changes)
//   MEDIAMTX_PATH, FFMPEG_PATH, CLOUDFLARED_PATH, NGROK_PATH  paths if they are not on the PATH
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { cameraArgs, readEnvFile } from "./lib.mjs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const GW_DIR = path.join(ROOT, "apps", "gateway");
const ENV_FILE = path.join(GW_DIR, ".env.local");
const URL_FILE = path.join(GW_DIR, "data", "public-url.txt");

const env = { ...readEnvFile(ENV_FILE), ...process.env };
const WIN = process.platform === "win32";
const MAC = process.platform === "darwin";
const bin = { mediamtx: env.MEDIAMTX_PATH || "mediamtx", ffmpeg: env.FFMPEG_PATH || "ffmpeg", cloudflared: env.CLOUDFLARED_PATH || "cloudflared", ngrok: env.NGROK_PATH || "ngrok" };
const SHELL_ID = env.SHELL_ID || "el-tucu";
const PORT = Number(env.PORT || 8787);
const log = (who, msg) => console.log(`${new Date().toLocaleTimeString()} [${who}] ${msg}`);

if (process.argv.includes("--list-cameras")) {
  const args = WIN ? ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"] : MAC ? ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""] : null;
  if (!args) {
    console.log("On Linux cameras are /dev/video*: ls /dev/video*");
    process.exit(0);
  }
  const out = spawnSync(bin.ffmpeg, args, { encoding: "utf8" }).stderr ?? "";
  const cams = WIN
    ? [...out.matchAll(/"([^"]+)"\s+\(video\)/g)].map((m) => m[1])
    : out.split(/AVFoundation audio devices/)[0].split("\n").map((l) => l.match(/\[(\d+)\] (.+)$/)).filter(Boolean).map((m) => `${m[1]}  (${m[2]})`);
  console.log(cams.length ? `Cameras (value for CAMERA):\n${cams.map((c) => `  ${c}`).join("\n")}` : `No cameras found. ffmpeg output:\n${out}`);
  process.exit(0);
}

// ---------- supervisor ----------

const procs = new Map();
let stopping = false;

/** Runs a process and restarts it if it dies (unless shutting down). */
function keep(name, cmd, args, opts = {}, onLine) {
  const start = () => {
    if (stopping) return;
    const p = spawn(cmd, args, { cwd: opts.cwd ?? ROOT, env: { ...process.env, ...opts.env }, windowsHide: true });
    procs.set(name, p);
    const feed = (d) => {
      for (const l of d.toString().split(/\r?\n/).filter(Boolean)) {
        if (opts.verbose) log(name, l);
        onLine?.(l);
      }
    };
    p.stdout.on("data", feed);
    p.stderr.on("data", feed);
    p.on("error", (e) => log(name, `failed to start: ${e.message}${e.code === "ENOENT" ? " (is it installed and on the PATH, or set via *_PATH?)" : ""}`));
    p.on("exit", (code) => {
      if (stopping || procs.get(name) !== p) return;
      log(name, `exited (${code}); restarting in 3 s`);
      setTimeout(start, 3000);
    });
  };
  start();
  return { restart: () => procs.get(name)?.kill() };
}

function stopAll() {
  stopping = true;
  for (const p of procs.values()) p.kill();
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

// 1. camera
keep("mediamtx", bin.mediamtx, [path.join(ROOT, "scripts", "forger", "mediamtx.yml")]);
let camArgs = null;
try {
  camArgs = cameraArgs(process.platform, { ...env, SHELL_ID });
} catch (e) {
  log("camera", `${e.message} Continuing without a camera.`);
}
if (camArgs) setTimeout(() => keep("camera", bin.ffmpeg, camArgs, { verbose: true }), 1500);

// 2. tunnel (optional) → public URL
const fixedUrl = env.PUBLIC_URL && !env.PUBLIC_URL.includes("localhost") ? env.PUBLIC_URL.replace(/\/$/, "") : null;
const tunnel = env.TUNNEL ?? (fixedUrl ? "none" : "cloudflared");

let publicUrl = fixedUrl ?? `http://localhost:${PORT}`;
let gateway = null;

// 3. gateway: node + tsx directly (no pnpm.cmd or shell, so it behaves the same on Windows)
const tsxCli = createRequire(path.join(GW_DIR, "package.json")).resolve("tsx/cli");
const genv = {
  PUBLIC_URL: publicUrl,
  RTSP_URL: env.RTSP_URL || `rtsp://localhost:8554/${SHELL_ID}`,
  HLS_UPSTREAM: env.HLS_UPSTREAM || "http://localhost:8888",
};
function startGateway() {
  genv.PUBLIC_URL = publicUrl; // keep() rereads genv on every start
  if (gateway) return gateway.restart();
  gateway = keep("gateway", process.execPath, [tsxCli, "--env-file-if-exists=.env.local", "src/index.ts"], { cwd: GW_DIR, env: genv, verbose: true });
}

async function register() {
  mkdirSync(path.dirname(URL_FILE), { recursive: true });
  writeFileSync(URL_FILE, publicUrl);
  if (!env.HUB_URL || publicUrl.includes("localhost")) return;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const r = await fetch(`${env.HUB_URL.replace(/\/$/, "")}/api/forgers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gateway: publicUrl }),
        signal: AbortSignal.timeout(15_000),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return log("hub", `registered ${publicUrl} · shells ${(j.shells ?? []).join(", ")}`);
      log("hub", `not yet (${r.status} ${j.error ?? ""}); retrying`);
    } catch (e) {
      log("hub", `no answer (${e.message}); retrying`);
    }
  }
  log("hub", "could not register: check HUB_URL and the tunnel");
}

if (tunnel === "cloudflared") {
  keep("tunnel", bin.cloudflared, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], {}, (line) => {
    const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && m[0] !== publicUrl) {
      publicUrl = m[0];
      log("tunnel", `public URL ${publicUrl}`);
      startGateway();
      void register();
    }
  });
  // if the tunnel is slow, the gateway still starts locally
  setTimeout(() => !gateway && startGateway(), 20_000);
} else if (tunnel === "ngrok") {
  // fixed domain (free ngrok account): PUBLIC_URL is known upfront, the gateway does not wait for the tunnel
  if (!fixedUrl) {
    log("tunnel", "TUNNEL=ngrok needs PUBLIC_URL=https://<your-domain>.ngrok-free.dev");
    process.exit(1);
  }
  keep("tunnel", bin.ngrok, ["http", "--url", new URL(fixedUrl).host, "--log", "stdout", "--log-format", "term", String(PORT)], {}, (line) => {
    if (/ERR|error/i.test(line)) log("tunnel", line);
  });
  startGateway();
  void register();
} else {
  startGateway();
  void register();
}

// macOS: keep the Mac awake while the Forger runs (caffeinate exits on its own when this process ends)
if (MAC) spawn("caffeinate", ["-i", "-s", "-w", String(process.pid)], { stdio: "ignore" }).on("error", () => {}).unref();

log("forger", `shell ${SHELL_ID} · ${WIN ? "Windows" : MAC ? "macOS" : "Linux"} · terms: ${env.SITE_URL || "https://rent-a-shell.vercel.app"}/terms · Ctrl+C to stop`);
