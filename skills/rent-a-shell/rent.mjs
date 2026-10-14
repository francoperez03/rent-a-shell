#!/usr/bin/env node
// Rent a Shell client for agents: rents real hardware, runs a plan of steps and returns a measured report.
// Single file; dependencies in the same folder:
//   npm i @x402/fetch@2.27.0 @x402/core@2.27.0 @x402/svm@2.27.0 @solana/kit@^6
//
//   node rent.mjs wallet                          creates/reads the agent wallet and shows the address
//   node rent.mjs catalog [--hub URL]             lists the shells in the catalog
//   node rent.mjs info --gateway URL              shell spec, sensors, price and queue
//   node rent.mjs run --gateway URL --plan plan.json [--shell ID] [--blocks 1] --max-usd 0.25 [--out report.json] [--frames folder]
//
// Interactive session (pay once, then one command at a time; the session lives in ~/.rent-a-shell/session.json):
//   node rent.mjs rent --gateway URL [--shell ID] [--blocks 1] --max-usd 0.05
//   node rent.mjs cmd --joint grip --angle 175 | --dance saludo | --stop
//   node rent.mjs state · node rent.mjs frame [--out photo.jpg] · node rent.mjs end
// --gateway also accepts the website URL (https://rent-a-shell.vercel.app): the gateway is read from its llms.txt.
//
// Plan: JSON with a list of steps:
//   {"joint":"base","angle":120}   moves a joint and measures until it arrives (real angle and peak mA)
//   {"dance":"saludo"}             runs a shell routine
//   {"wait":500}                   waits in ms
//   {"frame":"name"}               saves a camera photo (with --frames)
//   {"stop":true}                  stops in place
// The wallet lives in ~/.rent-a-shell/wallet.json (or RAS_WALLET). It only needs USDC on the shell's network: the facilitator pays the fee.
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const die = (m) => {
  console.error(m);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WALLET = process.env.RAS_WALLET || path.join(homedir(), ".rent-a-shell", "wallet.json");
const HUB = (opt("hub") || process.env.RAS_HUB || "").replace(/\/$/, "");
const SESSION = process.env.RAS_SESSION || path.join(homedir(), ".rent-a-shell", "session.json");
const GW = await resolveGateway((opt("gateway") || process.env.RAS_GATEWAY || "").replace(/\/$/, ""));

/** A gateway URL, or the website URL: the site is a SPA, its llms.txt carries a "Gateway: <url>" line. */
async function resolveGateway(url) {
  if (!url) return "";
  const probe = await fetch(`${url}/api/shells`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (probe?.ok && (probe.headers.get("content-type") ?? "").includes("json")) return url;
  const txt = await fetch(`${url}/llms.txt`, { signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  const m = txt.match(/^Gateway:\s*(https?:\/\/\S+)/mi);
  if (!m) die(`${url} is neither a gateway nor a site with a Gateway line in /llms.txt.`);
  return m[1].replace(/\/$/, "");
}

async function getJson(url, init) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, j, headers: r.headers };
}

async function loadSigner(create = false) {
  const kit = await import("@solana/kit");
  if (!existsSync(WALLET)) {
    if (!create) die(`No wallet at ${WALLET}. Run: node rent.mjs wallet`);
    const seed = crypto.getRandomValues(new Uint8Array(32));
    const s = await kit.createKeyPairSignerFromPrivateKeyBytes(seed);
    const secret = new Uint8Array([...seed, ...kit.getAddressEncoder().encode(s.address)]);
    mkdirSync(path.dirname(WALLET), { recursive: true });
    writeFileSync(WALLET, JSON.stringify({ address: s.address, secret: kit.getBase58Decoder().decode(secret) }), { mode: 0o600 });
    try {
      chmodSync(WALLET, 0o600);
    } catch {}
    return { signer: s, created: true };
  }
  const w = JSON.parse(readFileSync(WALLET, "utf8"));
  return { signer: await kit.createKeyPairSignerFromBytes(kit.getBase58Encoder().encode(w.secret)), created: false };
}

if (cmd === "wallet") {
  const { signer, created } = await loadSigner(true);
  console.log(`${created ? "wallet created" : "wallet"}: ${signer.address}`);
  console.log(`file: ${WALLET} (secret: do not share)`);
  console.log("To rent, fund it with USDC on the shell's network (devnet: faucet.circle.com → Solana Devnet).");
  process.exit(0);
}

if (cmd === "catalog") {
  if (!HUB) die("Missing --hub URL (or RAS_HUB).");
  const { j } = await getJson(`${HUB}/api/catalog`);
  if (!Array.isArray(j) || !j.length) die("The catalog is empty.");
  for (const s of j) {
    console.log(`${s.id.padEnd(16)} ${s.status.padEnd(8)} USD ${s.pricing.usd}/${s.pricing.block_minutes} min · ${s.kind} · sensors ${(s.sensors ?? []).join(",")} · Forger ${s.forger?.name ?? "?"}\n${"".padEnd(16)} gateway ${s.gateway}`);
  }
  process.exit(0);
}

async function shellOf(gw, id) {
  const { j } = await getJson(`${gw}/api/shells`);
  if (!Array.isArray(j) || !j.length) die(`The gateway ${gw} returned no shells.`);
  const s = id ? j.find((x) => x.id === id) : j[0];
  if (!s) die(`Shell ${id} doesn't exist on ${gw}. Available: ${j.map((x) => x.id).join(", ")}`);
  return s;
}

if (cmd === "info") {
  if (!GW) die("Missing --gateway URL.");
  const s = await shellOf(GW, opt("shell"));
  const q = (await getJson(`${GW}/api/shells/${s.id}/queue`)).j;
  const st = (await getJson(`${GW}/api/shells/${s.id}/state`)).j;
  console.log(JSON.stringify({ shell: s, queue: q, state: st }, null, 2));
  process.exit(0);
}

const USAGE = "Usage: node rent.mjs wallet | catalog --hub URL | info --gateway URL | run --gateway URL --plan plan.json --max-usd N | rent --gateway URL --max-usd N | cmd (--joint J --angle A | --dance R | --stop) | state | frame [--out f.jpg] | end";

// ---------- shared: pay (x402), measure a step, end ----------

/** Pays `blocks` on `gw` for `shell` and returns the grant { token, sid, starts_at, expires_at, payment }. Checks the 402 amount against the cap before signing. */
async function pay(gw, shell, blocks, maxUsd) {
  const expected = Number(shell.pricing.usd) * blocks;
  if (expected > maxUsd) die(`The rental costs USD ${expected.toFixed(2)} and the cap is USD ${maxUsd}.`);
  let payUrl = `${gw}/api/sessions/x402?shell=${shell.id}&blocks=${blocks}`;
  let grant;
  if (process.env.RAS_FAKE_PAY === "1") {
    // only for development gateways with the "fake" rail
    grant = (await getJson(payUrl, { method: "POST", headers: { "x-fake-pay": "1" } })).j;
  } else {
    // 0) gateways with escrow bind the payment to an intent: its URL is the x402 endpoint for this session.
    //    Gateways without escrow answer 400 (unknown_rail) and the direct URL stays.
    const it = await getJson(`${gw}/api/sessions/intent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shell: shell.id, blocks, rail: "solana-x402" }) }).catch(() => null);
    if (it?.j?.intent?.instructions?.url) {
      payUrl = it.j.intent.instructions.url;
      console.error(`intent ${it.j.intent.id} · escrow holds the payment until the session ends`);
    }
    // 1) read the 402 and check the amount against the cap BEFORE signing
    const probe = await fetch(payUrl, { method: "POST", signal: AbortSignal.timeout(15_000) });
    if (probe.status !== 402) die(`Expected 402 and got ${probe.status}: ${await probe.text()}`);
    const req = JSON.parse(Buffer.from(probe.headers.get("payment-required") ?? "", "base64").toString("utf8") || "{}");
    const acc = req.accepts?.find((a) => String(a.network).startsWith("solana:"));
    if (!acc) die(`The shell doesn't accept payment on Solana: ${JSON.stringify(req.accepts ?? req)}`);
    const usd = Number(acc.amount) / 1e6; // USDC has 6 decimals
    if (usd > maxUsd) die(`The 402 asks for USD ${usd} and the cap is USD ${maxUsd}. Not paying.`);
    // 2) pay with x402 (signs a USDC transfer; the facilitator submits it and pays the fee)
    const { x402Client, wrapFetchWithPayment } = await import("@x402/fetch");
    const { ExactSvmScheme } = await import("@x402/svm/exact/client");
    const { toClientSvmSigner } = await import("@x402/svm");
    const { signer } = await loadSigner();
    const client = new x402Client();
    client.register("solana:*", new ExactSvmScheme(toClientSvmSigner(signer)));
    const res = await wrapFetchWithPayment(fetch, client)(payUrl, { method: "POST" });
    if (!res.ok) {
      const pr = res.headers.get("payment-required");
      const why = pr ? JSON.parse(Buffer.from(pr, "base64").toString("utf8")).error : await res.text();
      die(`Payment rejected (${res.status}): ${why}${String(why).includes("simulation") || String(why).includes("insufficient") ? " · does the wallet have USDC on this network?" : ""}`);
    }
    grant = await res.json();
  }
  if (!grant?.token) die(`Didn't receive the session: ${JSON.stringify(grant)}`);
  console.error(`paid · ${grant.payment?.explorerUrl ?? grant.payment?.tx ?? "(no tx)"}`);
  if (grant.starts_at > Date.now()) {
    console.error(`the shell is busy: starting in ${Math.ceil((grant.starts_at - Date.now()) / 1000)} s`);
    await sleep(grant.starts_at - Date.now() + 300);
  }
  return { grant, usd: expected };
}

const authFor = (token) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

/** Executes one plan step and returns its measured record (same shape as the run report). */
async function runStep(gw, shell, token, p, i, framesDir) {
  const auth = authFor(token);
  const send = (body) => getJson(`${gw}/api/cmd`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  const state = async () => (await getJson(`${gw}/api/shells/${shell.id}/state`)).j;
  if (p.joint) {
    const r = await send({ cmd: "joint", args: { joint: p.joint, angle: p.angle } });
    const want = r.j.angle ?? p.angle;
    let st, peak = null;
    const t = Date.now();
    for (let k = 0; k < 40; k++) {
      await sleep(100);
      st = await state();
      if (typeof st.current_ma === "number") peak = Math.max(peak ?? 0, st.current_ma);
      if (!st.moving && st.angles?.[p.joint] === want) break;
    }
    const measured = st?.angles?.[p.joint];
    return { i, step: p, status: r.status, accepted: r.j.angle ?? null, clamped: Boolean(r.j.clamped), measured, reached: measured === want, ms: Date.now() - t, peak_ma: peak, error: r.ok ? undefined : r.j.error };
  }
  if (p.dance) {
    const r = await send({ cmd: "dance", args: { rutina: p.dance } });
    let peak = null;
    const until = Date.now() + (r.j.duration_ms ?? 0) + 300;
    while (r.ok && Date.now() < until) {
      await sleep(150);
      const st = await state();
      if (typeof st.current_ma === "number") peak = Math.max(peak ?? 0, st.current_ma);
    }
    return { i, step: p, status: r.status, duration_ms: r.j.duration_ms ?? null, peak_ma: peak, error: r.ok ? undefined : r.j.error };
  }
  if (p.wait) {
    await sleep(Math.min(Number(p.wait), 30_000));
    return { i, step: p };
  }
  if (p.stop) {
    const r = await send({ cmd: "stop" });
    return { i, step: p, status: r.status };
  }
  if (p.frame) {
    const r = await fetch(`${gw}/api/shells/${shell.id}/frame`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    let file = null;
    if (r?.ok && framesDir) {
      file = path.join(framesDir, `${String(i).padStart(2, "0")}-${String(p.frame).replace(/[^\w-]/g, "_")}.jpg`);
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }
    return { i, step: p, frame: file, camera: r?.ok ? "ok" : "no camera" };
  }
  return { i, step: p, error: "unknown step" };
}

const stepLine = (last) => last.error ?? last.skipped ?? (last.measured !== undefined ? `${last.measured}°${last.clamped ? " (clamped)" : ""}${last.peak_ma != null ? ` · peak ${last.peak_ma} mA` : ""}` : "ok");
const endSession = (gw, token) => getJson(`${gw}/api/sessions/end`, { method: "POST", headers: authFor(token) }).catch(() => null);
const secondsLeft = (expires) => Math.max(0, Math.ceil((expires - Date.now()) / 1000));

// ---------- interactive session: rent · cmd · state · frame · end ----------

function loadSession() {
  if (!existsSync(SESSION)) die("No session. Run: node rent.mjs rent --gateway URL --max-usd N");
  const ss = JSON.parse(readFileSync(SESSION, "utf8"));
  if (Date.now() > ss.expires_at) {
    rmSync(SESSION, { force: true });
    die("The session expired (the shell went back to HOME on its own). Rent again if you want more time.");
  }
  return ss;
}

if (cmd === "rent") {
  if (!GW) die("Missing --gateway URL.");
  const maxUsd = Number(opt("max-usd", "NaN"));
  if (!(maxUsd > 0)) die("Missing --max-usd: the spending cap the person approved.");
  if (existsSync(SESSION) && Date.now() < JSON.parse(readFileSync(SESSION, "utf8")).expires_at) die(`A session is still running (${SESSION}). Use it, or end it with: node rent.mjs end`);
  const blocks = Number(opt("blocks", "1"));
  const shell = await shellOf(GW, opt("shell"));
  const { grant, usd } = await pay(GW, shell, blocks, maxUsd);
  const ss = { gateway: GW, shell: shell.id, token: grant.token, sid: grant.sid, starts_at: grant.starts_at, expires_at: grant.expires_at, payment: grant.payment ?? null, usd };
  mkdirSync(path.dirname(SESSION), { recursive: true });
  writeFileSync(SESSION, JSON.stringify(ss, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ shell: shell.id, name: shell.name, minutes: blocks * shell.pricing.block_minutes, usd, seconds_left: secondsLeft(ss.expires_at), expires_at: new Date(ss.expires_at).toISOString(), payment: ss.payment, home: shell.home, joints: shell.joints, routines: shell.routines }, null, 2));
  process.exit(0);
}

if (cmd === "cmd") {
  const ss = loadSession();
  const shell = await shellOf(ss.gateway, ss.shell);
  const step = opt("joint") ? { joint: opt("joint"), angle: Number(opt("angle", "NaN")) } : opt("dance") ? { dance: opt("dance") } : argv.includes("--stop") ? { stop: true } : null;
  if (!step) die("Give one of: --joint J --angle A | --dance R | --stop");
  if (step.joint && !(step.angle >= 0)) die("Missing --angle (degrees).");
  const r = await runStep(ss.gateway, shell, ss.token, step, 0);
  console.log(JSON.stringify({ ...r, seconds_left: secondsLeft(ss.expires_at) }, null, 2));
  console.error(`${JSON.stringify(step)} → ${stepLine(r)} · ${secondsLeft(ss.expires_at)} s left`);
  process.exit(r.error ? 1 : 0);
}

if (cmd === "state") {
  const ss = loadSession();
  const st = (await getJson(`${ss.gateway}/api/shells/${ss.shell}/state`)).j;
  console.log(JSON.stringify({ ...st, seconds_left: secondsLeft(ss.expires_at) }, null, 2));
  process.exit(0);
}

if (cmd === "frame") {
  const ss = loadSession();
  const out = opt("out", "frame.jpg");
  const r = await fetch(`${ss.gateway}/api/shells/${ss.shell}/frame`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!r?.ok) die("No camera frame right now.");
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  console.log(`saved ${out} · ${secondsLeft(ss.expires_at)} s left`);
  process.exit(0);
}

if (cmd === "end") {
  if (!existsSync(SESSION)) die("No session to end.");
  const ss = JSON.parse(readFileSync(SESSION, "utf8"));
  await endSession(ss.gateway, ss.token);
  rmSync(SESSION, { force: true });
  console.log("session ended: the shell returns to HOME.");
  process.exit(0);
}

if (cmd !== "run") die(USAGE);

// ---------- run ----------
if (!GW) die("Missing --gateway URL.");
const planFile = opt("plan");
if (!planFile) die("Missing --plan plan.json.");
const plan = JSON.parse(readFileSync(planFile, "utf8"));
if (!Array.isArray(plan) || !plan.length) die("The plan must be a list of steps.");
const blocks = Number(opt("blocks", "1"));
const maxUsd = Number(opt("max-usd", "NaN"));
if (!(maxUsd > 0)) die("Missing --max-usd: the spending cap the person approved.");
const framesDir = opt("frames");
const shell = await shellOf(GW, opt("shell"));
const { grant, usd: expected } = await pay(GW, shell, blocks, maxUsd);
if (framesDir) mkdirSync(framesDir, { recursive: true });

const steps = [];
const t0 = Date.now();
try {
  for (const [i, p] of plan.entries()) {
    if (Date.now() > grant.expires_at - 1500) {
      steps.push({ i, step: p, skipped: "session expired" });
      continue;
    }
    steps.push(await runStep(GW, shell, grant.token, p, i, framesDir));
    console.error(`  ${i}. ${JSON.stringify(p)} → ${stepLine(steps.at(-1))}`);
  }
} finally {
  // always close: the shell returns to HOME and is freed
  await endSession(GW, grant.token);
}

const moves = steps.filter((s) => s.step.joint);
const report = {
  shell: { id: shell.id, name: shell.name, gateway: GW, forger: shell.forger?.name },
  payment: grant.payment ?? null,
  usd: expected,
  duration_ms: Date.now() - t0,
  summary: {
    moves: moves.length,
    reached: moves.filter((s) => s.reached).length,
    clamped: moves.filter((s) => s.clamped).length,
    peak_ma: steps.reduce((m, s) => (typeof s.peak_ma === "number" ? Math.max(m ?? 0, s.peak_ma) : m), null),
  },
  steps,
};
const out = opt("out");
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
