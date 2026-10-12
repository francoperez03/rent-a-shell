#!/usr/bin/env node
// Lanzador del Forger: un solo proceso que levanta y vigila todo lo que corre al lado del robot.
// Funciona igual en Windows, macOS y Linux (sin shell, sin pm2).
//   node scripts/forger/run.mjs                 → MediaMTX + cámara + túnel + gateway + registro en el hub
//   node scripts/forger/run.mjs --list-cameras  → nombres de cámara para CAMERA
// Lee apps/gateway/.env.local. Variables propias (todas opcionales):
//   CAMERA        Windows: nombre exacto (dshow) · macOS: índice (avfoundation, default 0) · Linux: /dev/videoN
//   CAMERA_SIZE   ej. 1280x720 · CAMERA_FPS ej. 30 (en Windows se omiten si no se ponen: usa el modo nativo)
//   TUNNEL        cloudflared (default si PUBLIC_URL falta o es localhost) | none
//   HUB_URL       si está, se registra (y se re-registra cuando cambia la URL del túnel)
//   MEDIAMTX_PATH, FFMPEG_PATH, CLOUDFLARED_PATH  rutas si no están en el PATH
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
const bin = { mediamtx: env.MEDIAMTX_PATH || "mediamtx", ffmpeg: env.FFMPEG_PATH || "ffmpeg", cloudflared: env.CLOUDFLARED_PATH || "cloudflared" };
const SHELL_ID = env.SHELL_ID || "el-tucu";
const PORT = Number(env.PORT || 8787);
const log = (who, msg) => console.log(`${new Date().toLocaleTimeString()} [${who}] ${msg}`);

if (process.argv.includes("--list-cameras")) {
  const args = WIN ? ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"] : MAC ? ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""] : null;
  if (!args) {
    console.log("En Linux las cámaras son /dev/video*: ls /dev/video*");
    process.exit(0);
  }
  const out = spawnSync(bin.ffmpeg, args, { encoding: "utf8" }).stderr ?? "";
  const cams = WIN
    ? [...out.matchAll(/"([^"]+)"\s+\(video\)/g)].map((m) => m[1])
    : out.split(/AVFoundation audio devices/)[0].split("\n").map((l) => l.match(/\[(\d+)\] (.+)$/)).filter(Boolean).map((m) => `${m[1]}  (${m[2]})`);
  console.log(cams.length ? `Cámaras (valor para CAMERA):\n${cams.map((c) => `  ${c}`).join("\n")}` : `No encontré cámaras. Salida de ffmpeg:\n${out}`);
  process.exit(0);
}

// ---------- supervisor ----------

const procs = new Map();
let stopping = false;

/** Corre un proceso y lo reinicia si se cae (salvo al apagar). */
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
    p.on("error", (e) => log(name, `no arrancó: ${e.message}${e.code === "ENOENT" ? ` (¿está instalado o falta ${name.toUpperCase()}_PATH?)` : ""}`));
    p.on("exit", (code) => {
      if (stopping || procs.get(name) !== p) return;
      log(name, `se cerró (${code}); reinicio en 3 s`);
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

// 1. cámara
keep("mediamtx", bin.mediamtx, [path.join(ROOT, "scripts", "forger", "mediamtx.yml")]);
let camArgs = null;
try {
  camArgs = cameraArgs(process.platform, { ...env, SHELL_ID });
} catch (e) {
  log("camara", `${e.message} Sigo sin cámara.`);
}
if (camArgs) setTimeout(() => keep("camara", bin.ffmpeg, camArgs, { verbose: true }), 1500);

// 2. túnel (opcional) → URL pública
const fixedUrl = env.PUBLIC_URL && !env.PUBLIC_URL.includes("localhost") ? env.PUBLIC_URL.replace(/\/$/, "") : null;
const useTunnel = (env.TUNNEL ?? (fixedUrl ? "none" : "cloudflared")) === "cloudflared";

let publicUrl = fixedUrl ?? `http://localhost:${PORT}`;
let gateway = null;

// 3. gateway: node + tsx directo (sin pnpm.cmd ni shell, así funciona igual en Windows)
const tsxCli = createRequire(path.join(GW_DIR, "package.json")).resolve("tsx/cli");
const genv = {
  PUBLIC_URL: publicUrl,
  RTSP_URL: env.RTSP_URL || `rtsp://localhost:8554/${SHELL_ID}`,
  HLS_UPSTREAM: env.HLS_UPSTREAM || "http://localhost:8888",
};
function startGateway() {
  genv.PUBLIC_URL = publicUrl; // keep() relee genv en cada arranque
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
      if (r.ok) return log("hub", `registrado ${publicUrl} · shells ${(j.shells ?? []).join(", ")}`);
      log("hub", `todavía no (${r.status} ${j.error ?? ""}); reintento`);
    } catch (e) {
      log("hub", `sin respuesta (${e.message}); reintento`);
    }
  }
  log("hub", "no pude registrarme: revisá HUB_URL y el túnel");
}

if (useTunnel) {
  keep("tunel", bin.cloudflared, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], {}, (line) => {
    const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && m[0] !== publicUrl) {
      publicUrl = m[0];
      log("tunel", `URL pública ${publicUrl}`);
      startGateway();
      void register();
    }
  });
  // si el túnel tarda, el gateway igual arranca local
  setTimeout(() => !gateway && startGateway(), 20_000);
} else {
  startGateway();
  void register();
}

// macOS: que la Mac no se duerma mientras el Forger corre (caffeinate se corta solo cuando termina este proceso)
if (MAC) spawn("caffeinate", ["-i", "-s", "-w", String(process.pid)], { stdio: "ignore" }).on("error", () => {}).unref();

log("forger", `shell ${SHELL_ID} · ${WIN ? "Windows" : MAC ? "macOS" : "Linux"} · Ctrl+C para cortar`);
