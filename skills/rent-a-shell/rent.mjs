#!/usr/bin/env node
// Cliente de Rent a Shell para agentes: alquila hardware real, corre un plan de pasos y devuelve un reporte medido.
// Un solo archivo; dependencias en la misma carpeta:
//   npm i @x402/fetch@2.27.0 @x402/core@2.27.0 @x402/svm@2.27.0 @solana/kit@^6
//
//   node rent.mjs wallet                          crea/lee la wallet del agente y muestra la address
//   node rent.mjs catalog [--hub URL]             lista los shells del catálogo
//   node rent.mjs info --gateway URL              ficha, sensores, precio y cola del shell
//   node rent.mjs run --gateway URL --plan plan.json [--shell ID] [--blocks 1] --max-usd 1 [--out reporte.json] [--frames carpeta]
//
// Plan: JSON con una lista de pasos:
//   {"joint":"base","angle":120}   mueve una articulación y mide hasta que llega (ángulo real y pico de mA)
//   {"dance":"saludo"}             corre una rutina del shell
//   {"wait":500}                   espera en ms
//   {"frame":"nombre"}             guarda una foto de la cámara (con --frames)
//   {"stop":true}                  frena en el lugar
// La wallet vive en ~/.rent-a-shell/wallet.json (o RAS_WALLET). Solo necesita USDC en la red del shell: el fee lo paga el facilitator.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const GW = (opt("gateway") || process.env.RAS_GATEWAY || "").replace(/\/$/, "");

async function getJson(url, init) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, j, headers: r.headers };
}

async function loadSigner(create = false) {
  const kit = await import("@solana/kit");
  if (!existsSync(WALLET)) {
    if (!create) die(`No hay wallet en ${WALLET}. Corré: node rent.mjs wallet`);
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
  console.log(`${created ? "wallet creada" : "wallet"}: ${signer.address}`);
  console.log(`archivo: ${WALLET} (secreto: no compartir)`);
  console.log("Para alquilar, cargale USDC en la red del shell (devnet: faucet.circle.com → Solana Devnet).");
  process.exit(0);
}

if (cmd === "catalog") {
  if (!HUB) die("Falta --hub URL (o RAS_HUB).");
  const { j } = await getJson(`${HUB}/api/catalog`);
  if (!Array.isArray(j) || !j.length) die("El catálogo está vacío.");
  for (const s of j) {
    console.log(`${s.id.padEnd(16)} ${s.status.padEnd(8)} USD ${s.pricing.usd}/${s.pricing.block_minutes} min · ${s.kind} · sensores ${(s.sensors ?? []).join(",")} · Forger ${s.forger?.name ?? "?"}\n${"".padEnd(16)} gateway ${s.gateway}`);
  }
  process.exit(0);
}

async function shellOf(gw, id) {
  const { j } = await getJson(`${gw}/api/shells`);
  if (!Array.isArray(j) || !j.length) die(`El gateway ${gw} no devolvió shells.`);
  const s = id ? j.find((x) => x.id === id) : j[0];
  if (!s) die(`No existe el shell ${id} en ${gw}. Hay: ${j.map((x) => x.id).join(", ")}`);
  return s;
}

if (cmd === "info") {
  if (!GW) die("Falta --gateway URL.");
  const s = await shellOf(GW, opt("shell"));
  const q = (await getJson(`${GW}/api/shells/${s.id}/queue`)).j;
  const st = (await getJson(`${GW}/api/shells/${s.id}/state`)).j;
  console.log(JSON.stringify({ shell: s, queue: q, state: st }, null, 2));
  process.exit(0);
}

if (cmd !== "run") die("Uso: node rent.mjs wallet | catalog --hub URL | info --gateway URL | run --gateway URL --plan plan.json --max-usd N");

// ---------- run ----------
if (!GW) die("Falta --gateway URL.");
const planFile = opt("plan");
if (!planFile) die("Falta --plan plan.json.");
const plan = JSON.parse(readFileSync(planFile, "utf8"));
if (!Array.isArray(plan) || !plan.length) die("El plan tiene que ser una lista de pasos.");
const blocks = Number(opt("blocks", "1"));
const maxUsd = Number(opt("max-usd", "NaN"));
if (!(maxUsd > 0)) die("Falta --max-usd: el tope de gasto que aprobó la persona.");
const framesDir = opt("frames");
const shell = await shellOf(GW, opt("shell"));
const expected = Number(shell.pricing.usd) * blocks;
if (expected > maxUsd) die(`El alquiler cuesta USD ${expected.toFixed(2)} y el tope es USD ${maxUsd}.`);

const payUrl = `${GW}/api/sessions/x402?shell=${shell.id}&blocks=${blocks}`;
let grant;
if (process.env.RAS_FAKE_PAY === "1") {
  // solo para gateways de desarrollo con el riel "fake"
  grant = (await getJson(payUrl, { method: "POST", headers: { "x-fake-pay": "1" } })).j;
} else {
  // 1) leer el 402 y chequear el monto contra el tope ANTES de firmar
  const probe = await fetch(payUrl, { method: "POST", signal: AbortSignal.timeout(15_000) });
  if (probe.status !== 402) die(`Esperaba 402 y vino ${probe.status}: ${await probe.text()}`);
  const req = JSON.parse(Buffer.from(probe.headers.get("payment-required") ?? "", "base64").toString("utf8") || "{}");
  const acc = req.accepts?.find((a) => String(a.network).startsWith("solana:"));
  if (!acc) die(`El shell no acepta pago en Solana: ${JSON.stringify(req.accepts ?? req)}`);
  const usd = Number(acc.amount) / 1e6; // USDC tiene 6 decimales
  if (usd > maxUsd) die(`El 402 pide USD ${usd} y el tope es USD ${maxUsd}. No pago.`);
  // 2) pagar con x402 (firma una transferencia de USDC; el facilitator la envía y paga el fee)
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
    die(`Pago rechazado (${res.status}): ${why}${String(why).includes("simulation") || String(why).includes("insufficient") ? " · ¿la wallet tiene USDC en esta red?" : ""}`);
  }
  grant = await res.json();
}
if (!grant?.token) die(`No recibí la sesión: ${JSON.stringify(grant)}`);
console.error(`pagado · ${grant.payment?.explorerUrl ?? grant.payment?.tx ?? "(sin tx)"}`);
if (grant.starts_at > Date.now()) {
  console.error(`el shell está ocupado: arranco en ${Math.ceil((grant.starts_at - Date.now()) / 1000)} s`);
  await sleep(grant.starts_at - Date.now() + 300);
}

const auth = { authorization: `Bearer ${grant.token}`, "content-type": "application/json" };
const send = (body) => getJson(`${GW}/api/cmd`, { method: "POST", headers: auth, body: JSON.stringify(body) });
const state = async () => (await getJson(`${GW}/api/shells/${shell.id}/state`)).j;
if (framesDir) mkdirSync(framesDir, { recursive: true });

const steps = [];
const t0 = Date.now();
try {
  for (const [i, p] of plan.entries()) {
    if (Date.now() > grant.expires_at - 1500) {
      steps.push({ i, step: p, skipped: "sesión vencida" });
      continue;
    }
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
      steps.push({ i, step: p, status: r.status, accepted: r.j.angle ?? null, clamped: Boolean(r.j.clamped), measured, reached: measured === want, ms: Date.now() - t, peak_ma: peak, error: r.ok ? undefined : r.j.error });
    } else if (p.dance) {
      const r = await send({ cmd: "dance", args: { rutina: p.dance } });
      let peak = null;
      const until = Date.now() + (r.j.duration_ms ?? 0) + 300;
      while (r.ok && Date.now() < until) {
        await sleep(150);
        const st = await state();
        if (typeof st.current_ma === "number") peak = Math.max(peak ?? 0, st.current_ma);
      }
      steps.push({ i, step: p, status: r.status, duration_ms: r.j.duration_ms ?? null, peak_ma: peak, error: r.ok ? undefined : r.j.error });
    } else if (p.wait) {
      await sleep(Math.min(Number(p.wait), 30_000));
      steps.push({ i, step: p });
    } else if (p.stop) {
      const r = await send({ cmd: "stop" });
      steps.push({ i, step: p, status: r.status });
    } else if (p.frame) {
      const r = await fetch(`${GW}/api/shells/${shell.id}/frame`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
      let file = null;
      if (r?.ok && framesDir) {
        file = path.join(framesDir, `${String(i).padStart(2, "0")}-${String(p.frame).replace(/[^\w-]/g, "_")}.jpg`);
        writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      }
      steps.push({ i, step: p, frame: file, camera: r?.ok ? "ok" : "sin cámara" });
    } else steps.push({ i, step: p, error: "paso desconocido" });
    const last = steps.at(-1);
    console.error(`  ${i}. ${JSON.stringify(p)} → ${last.error ?? last.skipped ?? (last.measured !== undefined ? `${last.measured}°${last.peak_ma != null ? ` · pico ${last.peak_ma} mA` : ""}` : "ok")}`);
  }
} finally {
  // siempre cerrar: el shell vuelve a HOME y queda libre
  await getJson(`${GW}/api/sessions/end`, { method: "POST", headers: auth }).catch(() => null);
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
