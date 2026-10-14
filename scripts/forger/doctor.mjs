#!/usr/bin/env node
// End-to-end check of a Forger: ESP32, camera, gateway, public URL and hub.
//   node scripts/forger/doctor.mjs   (reads apps/gateway/.env.local)
// Exits with code 1 if anything critical fails. Every line says what to fix.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readEnvFile } from "./lib.mjs";

// .env.local (CRLF tolerant) + the URL the launcher saved if the tunnel assigned it on the fly
const envFile = readEnvFile(fileURLToPath(new URL("../../apps/gateway/.env.local", import.meta.url)));
let tunnelUrl = "";
try {
  tunnelUrl = readFileSync(new URL("../../apps/gateway/data/public-url.txt", import.meta.url), "utf8").trim();
} catch {}
const env = { ...envFile, ...(envFile.PUBLIC_URL || !tunnelUrl ? {} : { PUBLIC_URL: tunnelUrl }), ...process.env };

let bad = 0;
let warn = 0;
const ok = (m) => console.log(`✓ ${m}`);
const ko = (m, fix, critical = true) => {
  console.log(`${critical ? "✗" : "!"} ${m}\n    → ${fix}`);
  if (critical) bad++;
  else warn++;
};
const get = async (url, ms = 4000) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() };
  } catch (e) {
    return { status: 0, error: e.message };
  }
};
const has = (cmd) => spawnSync(cmd, ["-version"], { stdio: "ignore" }).status === 0 || spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;

const [major] = process.versions.node.split(".").map(Number);
major >= 22 ? ok(`Node ${process.versions.node}`) : ko(`Node ${process.versions.node}`, "Install Node 22 or newer.");
for (const t of ["ffmpeg", "mediamtx"]) has(t) ? ok(`${t} installed`) : ko(`${t} missing`, `Install it (macOS: brew install ${t}; Windows: winget or the official zip).`, false);

const solana = (env.RAILS ?? "").includes("solana");
for (const k of ["SOLANA_PAY_TO", "SESSION_SECRET", "ESP32_URL", "PUBLIC_URL"]) {
  env[k] ? ok(`${k} set`) : ko(`missing ${k} in apps/gateway/.env.local`, k === "SOLANA_PAY_TO" ? "Set your Solana address to get paid (RAILS=solana-x402,solana-pay)." : "Fill it in (see the configuration step in skills/rent-a-shell-forger/SKILL.md).", k !== "SOLANA_PAY_TO" || solana);
}
if ((env.SESSION_SECRET ?? "").length < 32) ko("SESSION_SECRET too short", "Generate it with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");

if (env.ESP32_URL) {
  const s = await get(`${env.ESP32_URL}/state`, 2500);
  if (s.status === 200 && s.body?.ok) {
    ok(`ESP32 answers at ${env.ESP32_URL}`);
    s.body.current_ma === undefined ? ko("firmware does not report current_ma", "Flash the latest robot-a firmware to measure current.", false)
      : s.body.current_ma === null ? ko("INA219 not detected", "Check SDA 21 / SCL 22 and address 0x40 (optional).", false)
      : ok(`current ${s.body.current_ma} mA`);
  } else ko(`ESP32 does not answer at ${env.ESP32_URL}`, "Run pnpm forger:find-esp32 and update ESP32_URL.");
}

const port = env.PORT ?? 8787;
const local = `http://localhost:${port}`;
const h = await get(`${local}/api/health`);
if (h.status === 200) {
  ok(`gateway up at ${local} (rails: ${h.body.rails.join(", ")})`);
  const shells = (await get(`${local}/api/shells`)).body;
  const sh = Array.isArray(shells) ? shells[0] : null;
  if (sh) {
    sh.pricing?.usd === "0.05" ? ko(`price is the default (USD ${sh.pricing.usd} per ${sh.pricing.block_minutes}-minute block)`, "Set BLOCK_USD (and BLOCK_MINUTES) in apps/gateway/.env.local to the price of your shell.", false) : ok(`price USD ${sh.pricing?.usd} per ${sh.pricing?.block_minutes}-minute block`);
    const f = await get(`${local}/api/shells/${sh.id}/frame`, 8000);
    f.status === 200 ? ok("camera: frame available") : ko("camera: no frame", "Check that MediaMTX is running and ffmpeg publishes to RTSP_URL.", false);
    if (sh.camera?.hls) {
      const l = await get(`${local}/live/${sh.id}/index.m3u8`);
      l.status === 200 ? ok("live video (HLS) via /live") : ko("no HLS at /live", "Check HLS_UPSTREAM (MediaMTX on :8888) and that the path name equals SHELL_ID.", false);
    }
  }
} else ko(`gateway does not answer at ${local}`, "Start it with: pnpm forger (or pnpm gateway if you run the camera and tunnel yourself)");

if (env.PUBLIC_URL && !env.PUBLIC_URL.includes("localhost")) {
  const p = await get(`${env.PUBLIC_URL}/api/health`, 8000);
  p.status === 200 ? ok(`public URL answers: ${env.PUBLIC_URL}`) : ko(`public URL does not answer: ${env.PUBLIC_URL}`, "Check the tunnel and that PUBLIC_URL is the URL it printed.");
} else ko("PUBLIC_URL is localhost", "Open a tunnel (pnpm forger does it) or set PUBLIC_URL to its URL.", false);

if (env.HUB_URL && env.PUBLIC_URL) {
  const f = await get(`${env.HUB_URL}/api/forgers`);
  const mine = Array.isArray(f.body) && f.body.find((g) => g.url === env.PUBLIC_URL.replace(/\/$/, ""));
  mine ? (mine.online ? ok("registered on the hub and online") : ko("registered on the hub but offline", "The hub cannot reach your PUBLIC_URL: check the tunnel.")) : ko("not on the hub", `curl -X POST ${env.HUB_URL}/api/forgers -H 'content-type: application/json' -d '{"gateway":"${env.PUBLIC_URL}"}'`, false);
}

console.log(bad ? `\n${bad} critical problem(s)${warn ? ` and ${warn} warning(s)` : ""}.` : warn ? `\nWorking, with ${warn} warning(s) to review.` : "\nAll set: your shell is published.");
process.exit(bad ? 1 : 0);
