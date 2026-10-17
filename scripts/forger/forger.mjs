#!/usr/bin/env node
// Forger: a single process that starts and supervises everything running next to the robot, plus its tools.
// Linux (Raspberry Pi, as a systemd service via deploy.sh) and macOS (development).
//   node scripts/forger/forger.mjs           → MediaMTX + camera + tunnel + gateway + hub registration + status page
//   node scripts/forger/forger.mjs doctor    → end-to-end check, exits 1 when something critical fails
//   node scripts/forger/forger.mjs spec      → validates shell.json and prints the sheet the way the site shows it
//   node scripts/forger/forger.mjs esp32     → finds the robot's ESP32 on the local network
//   node scripts/forger/forger.mjs cameras   → cameras to use as CAMERA
// Reads apps/gateway/.env.local. Its own variables (all optional):
//   CAMERA        macOS: index (avfoundation, default 0) · Linux: /dev/videoN (default /dev/video0) · "test"
//   CAMERA_SIZE   e.g. 1280x720 · CAMERA_FPS e.g. 30 · CAMERA_OUT_FPS 15 · CAMERA_KBPS 700 (stream out) · CAMERA_INPUT_FORMAT mjpeg (Linux)
//   TUNNEL        cloudflared (default when PUBLIC_URL is missing or localhost) | none (PUBLIC_URL is fixed, or LAN only)
//   HUB_URL       if set, registers there (and re-registers when the tunnel URL changes)
//   HUB_TOKEN     Forger token issued by the Rent a Shell admin; required by the hub to register
//   FORGER_STATUS_PORT  status page on the LAN (default 8790; the tunnel only exposes the gateway)
//   MEDIAMTX_PATH, FFMPEG_PATH, CLOUDFLARED_PATH  paths if they are not on the PATH
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cameraArgs, checks, readEnvFile, validateSheet } from "./lib.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const GW_DIR = path.join(ROOT, "apps", "gateway");
const ENV_FILE = path.join(GW_DIR, ".env.local");
const URL_FILE = path.join(GW_DIR, "data", "public-url.txt");
const SHEET_FILE = process.env.SHELL_FILE || path.join(GW_DIR, "shell.json");

const env = { ...readEnvFile(ENV_FILE), ...process.env };
const MAC = process.platform === "darwin";
const bin = { mediamtx: env.MEDIAMTX_PATH || "mediamtx", ffmpeg: env.FFMPEG_PATH || "ffmpeg", cloudflared: env.CLOUDFLARED_PATH || "cloudflared" };
const SHELL_ID = env.SHELL_ID || "el-tucu";
const PORT = Number(env.PORT || 8787);
const log = (who, msg) => console.log(`${new Date().toLocaleTimeString()} [${who}] ${msg}`);

const tools = { doctor, spec, esp32, cameras };
const cmd = process.argv[2];
if (cmd && !tools[cmd]) {
  console.log(`unknown command ${cmd}; use one of: ${Object.keys(tools).join(", ")} (or none to run the Forger)`);
  process.exit(1);
}
if (cmd) await tools[cmd]();
else run();

// ---------- tools ----------

/** .env.local plus the URL the launcher saved, when the tunnel assigned it on the fly. */
function liveEnv() {
  const file = readEnvFile(ENV_FILE);
  let tunnelUrl = "";
  try {
    tunnelUrl = readFileSync(URL_FILE, "utf8").trim();
  } catch {}
  return { ...file, ...(file.PUBLIC_URL || !tunnelUrl ? {} : { PUBLIC_URL: tunnelUrl }), ...process.env };
}

async function doctor() {
  const list = await checks(liveEnv(), SHEET_FILE);
  for (const c of list) console.log(`${{ ok: "✓", warn: "!", bad: "✗" }[c.level]} ${c.name}${c.fix ? `\n    → ${c.fix}` : ""}`);
  const bad = list.filter((c) => c.level === "bad").length;
  const warn = list.filter((c) => c.level === "warn").length;
  console.log(bad ? `\n${bad} critical problem(s)${warn ? ` and ${warn} warning(s)` : ""}.` : warn ? `\nWorking, with ${warn} warning(s) to review.` : "\nAll set: your shell is published.");
  process.exit(bad ? 1 : 0);
}

function spec() {
  let sheet;
  try {
    sheet = JSON.parse(readFileSync(SHEET_FILE, "utf8"));
  } catch (e) {
    console.log(`✗ ${SHEET_FILE}: ${e.message}\n    → cp apps/gateway/shell.example.json apps/gateway/shell.json and fill it in`);
    process.exit(1);
  }
  const problems = validateSheet(sheet);
  if (sheet.image) {
    try {
      const size = statSync(path.resolve(path.dirname(SHEET_FILE), sheet.image)).size;
      if (size > 2 * 1024 * 1024) problems.push(`image: ${sheet.image} is ${(size / 1024 / 1024).toFixed(1)} MB; keep it under 2 MB (1200 px square is plenty)`);
    } catch {
      problems.push(`image: ${sheet.image} not found next to shell.json`);
    }
  }
  if (problems.length) {
    for (const p of problems) console.log(`✗ ${p}`);
    process.exit(1);
  }
  const j = sheet.joints;
  const hours = ((sheet.build.parts_usd / Number(sheet.pricing.usd)) * sheet.pricing.block_minutes) / 60;
  console.log(`✓ shell.json is valid\n`);
  console.log(`${sheet.name} (${sheet.id}) · ${sheet.kind} · ${sheet.location} · Forger ${sheet.forger.name}${sheet.forger.customizations ? " (takes customization requests)" : ""}`);
  console.log(`USD ${sheet.pricing.usd} per ${sheet.pricing.block_minutes} min · owning one: USD ${sheet.build.parts_usd} in parts, ${sheet.build.lead_days} days, ${sheet.build.build_hours} h of assembly (the parts buy ${Math.round(hours)} hours here)`);
  console.log(`Routines: ${sheet.routines.join(", ")} · Sensors: ${sheet.sensors.join(", ")} · Photo: ${sheet.image ?? "none"}\n`);
  console.log("Joint      Min   Max  HOME");
  for (const k of ["base", "shoulder", "elbow", "grip"]) console.log(`${k.padEnd(9)} ${String(j[k][0]).padStart(4)}° ${String(j[k][1]).padStart(4)}° ${String(sheet.home[k]).padStart(4)}°`);
}

/** GET /state on every IP of this machine's /24 subnets; a shell answers {ok:true, angles:{...}} (robot-a/SPEC.md §4.4). */
async function esp32() {
  const subnets = new Set();
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs ?? []) if (i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254.")) subnets.add(i.address.split(".").slice(0, 3).join("."));
  }
  if (!subnets.size) {
    console.error("No local IPv4 network found. Is this machine on the robot's WiFi?");
    process.exit(1);
  }
  const probe = async (ip) => {
    try {
      const j = await (await fetch(`http://${ip}/state`, { signal: AbortSignal.timeout(1200) })).json();
      return j?.ok === true && j.angles && typeof j.angles === "object" ? { ip, j } : null;
    } catch {
      return null;
    }
  };
  const found = [];
  for (const net of subnets) {
    console.error(`scanning ${net}.0/24…`);
    // 64 at a time so the WiFi does not choke
    for (let start = 1; start < 255; start += 64) {
      for (const hit of await Promise.all(Array.from({ length: Math.min(64, 255 - start) }, (_, k) => probe(`${net}.${start + k}`)))) if (hit) found.push(hit);
    }
  }
  if (!found.length) {
    console.error("No shell found. Check that the ESP32 is on and on the same network, or set ESP32_URL by hand.");
    process.exit(1);
  }
  for (const { ip, j } of found) console.log(`http://${ip}  ${JSON.stringify(j.angles)}${"current_ma" in j ? ` · ${j.current_ma ?? "no"} mA` : ""}`);
}

function cameras() {
  if (!MAC) {
    const r = spawnSync("v4l2-ctl", ["--list-devices"], { encoding: "utf8" });
    console.log(r.status === 0 ? `Cameras (the first /dev/videoN of each USB camera is the value for CAMERA):\n${r.stdout}` : "v4l2-ctl missing (sudo apt install v4l-utils); cameras are /dev/video*");
    return;
  }
  const out = spawnSync(bin.ffmpeg, ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], { encoding: "utf8" }).stderr ?? "";
  const cams = out.split(/AVFoundation audio devices/)[0].split("\n").map((l) => l.match(/\[(\d+)\] (.+)$/)).filter(Boolean).map((m) => `${m[1]}  (${m[2]})`);
  console.log(cams.length ? `Cameras (value for CAMERA):\n${cams.map((c) => `  ${c}`).join("\n")}` : `No cameras found. ffmpeg output:\n${out}`);
}

// ---------- the Forger ----------

function run() {
  const procs = new Map(); // name → { p, restarts, since, last }
  let stopping = false;

  /** Runs a process and restarts it if it dies (unless shutting down). */
  function keep(name, cmd, args, opts = {}, onLine) {
    const start = () => {
      if (stopping) return;
      const p = spawn(cmd, args, { cwd: opts.cwd ?? ROOT, env: { ...process.env, ...opts.env } });
      const st = procs.get(name) ?? { restarts: -1 };
      Object.assign(st, { p, up: true, restarts: st.restarts + 1, since: Date.now() });
      procs.set(name, st);
      const feed = (d) => {
        for (const l of d.toString().split(/\r?\n/).filter(Boolean)) {
          st.last = l.slice(0, 300);
          if (opts.verbose) log(name, l);
          onLine?.(l);
        }
      };
      p.stdout.on("data", feed);
      p.stderr.on("data", feed);
      p.on("error", (e) => {
        st.up = false;
        st.last = `failed to start: ${e.message}`;
        log(name, `${st.last}${e.code === "ENOENT" ? " (is it installed and on the PATH, or set via *_PATH?)" : ""}`);
      });
      p.on("exit", (code) => {
        if (stopping || st.p !== p) return;
        st.up = false;
        st.since = Date.now();
        log(name, `exited (${code}); restarting in 3 s`);
        setTimeout(start, 3000);
      });
    };
    start();
    return { restart: () => procs.get(name)?.p.kill() };
  }

  const stopAll = () => {
    stopping = true;
    for (const { p } of procs.values()) p.kill();
    setTimeout(() => process.exit(0), 500);
  };
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
  let hub = "not registered";

  // 3. gateway: node + tsx directly (no pnpm or shell in between)
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
    if (!env.HUB_TOKEN) return log("hub", (hub = "HUB_TOKEN is missing: ask for a Forger token and put it in .env.local to be listed"));
    const url = publicUrl;
    // ponytail: never give up; a quick tunnel can take minutes to be reachable from the hub's region
    for (let i = 0; url === publicUrl; i++) {
      await new Promise((r) => setTimeout(r, Math.min(3000 * (i + 1), 30_000)));
      try {
        const r = await fetch(`${env.HUB_URL.replace(/\/$/, "")}/api/forgers`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${env.HUB_TOKEN}` },
          body: JSON.stringify({ gateway: url }),
          signal: AbortSignal.timeout(15_000),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) return log("hub", (hub = `registered ${url} · shells ${(j.shells ?? []).join(", ")}`));
        if (r.status === 401 || r.status === 409 || r.status === 429) return log("hub", (hub = `rejected (${r.status} ${j.error ?? ""}): ${j.message ?? "check HUB_TOKEN"}`));
        log("hub", (hub = `not yet (${r.status} ${j.error ?? ""}: ${j.message ?? ""}); retrying`));
      } catch (e) {
        log("hub", (hub = `no answer (${e.message}); retrying`));
      }
    }
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
  } else {
    startGateway();
    void register();
  }

  // 4. status page on the LAN: processes, public URL, hub and the doctor's checks
  let cached = { at: 0, list: [] };
  const status = async () => {
    if (Date.now() - cached.at > 15_000) cached = { at: Date.now(), list: await checks({ ...env, PUBLIC_URL: publicUrl }, SHEET_FILE) };
    const now = Date.now();
    return {
      shell: SHELL_ID,
      host: os.hostname(),
      publicUrl,
      hub,
      uptime_s: Math.round(process.uptime()),
      processes: Object.fromEntries([...procs].map(([n, s]) => [n, { up: s.up, restarts: s.restarts, for_s: Math.round((now - s.since) / 1000), last: s.last ?? "" }])),
      checks: cached.list,
    };
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const page = (s) => {
    const mark = { ok: "✓", warn: "!", bad: "✗" };
    const rows = [
      ...Object.entries(s.processes).map(([n, p]) => [p.up ? "ok" : "bad", `process ${n}`, `${p.up ? "up" : "down"} ${p.for_s} s · ${p.restarts} restart(s)`, p.last]),
      ["ok", "public URL", s.publicUrl, ""],
      [/^registered/.test(s.hub) ? "ok" : "warn", "hub", s.hub, ""],
      ...s.checks.map((c) => [c.level, c.name, "", c.fix ?? ""]),
    ];
    const bad = rows.filter((r) => r[0] === "bad").length;
    return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5"><title>Forger ${esc(s.shell)}</title>
<style>body{font:14px/1.4 ui-monospace,Menlo,monospace;margin:16px;background:#14110d;color:#f7f2eb}h1{font-size:18px}td{padding:4px 8px;vertical-align:top;border-bottom:1px solid #333}.ok{color:#5c5}.warn{color:#fb3}.bad{color:#f55}small{color:#999}</style>
<h1 class="${bad ? "bad" : "ok"}">${esc(s.shell)} on ${esc(s.host)} · ${bad ? `${bad} problem(s)` : "all good"}</h1><small>up ${s.uptime_s} s · refreshes every 5 s · JSON at /health</small>
<table>${rows.map(([l, n, d, f]) => `<tr><td class="${l}">${mark[l]}</td><td>${esc(n)}</td><td>${esc(d)}</td><td><small>${esc(f)}</small></td></tr>`).join("")}</table>`;
  };
  const statusPort = Number(env.FORGER_STATUS_PORT || 8790);
  createServer(async (req, res) => {
    const s = await status();
    if (req.url?.startsWith("/health")) res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(s, null, 2));
    else res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page(s));
  })
    .on("error", (e) => log("status", `page not served: ${e.message}`))
    .listen(statusPort, () => log("status", `http://${os.hostname().replace(/\.local$/, "")}.local:${statusPort}`));

  // macOS: keep the Mac awake while the Forger runs (caffeinate exits on its own when this process ends)
  if (MAC) spawn("caffeinate", ["-i", "-s", "-w", String(process.pid)], { stdio: "ignore" }).on("error", () => {}).unref();

  log("forger", `shell ${SHELL_ID} · ${MAC ? "macOS" : "Linux"} · terms: ${env.SITE_URL || "https://rent-a-shell.vercel.app"}/terms · Ctrl+C to stop`);
}
