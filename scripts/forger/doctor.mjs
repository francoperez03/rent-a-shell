#!/usr/bin/env node
// Chequeo de punta a punta de un Forger: ESP32, cámara, gateway, URL pública y hub.
//   node scripts/forger/doctor.mjs   (lee apps/gateway/.env.local)
// Sale con código 1 si algo crítico falla. Cada línea dice qué arreglar.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const env = { ...Object.fromEntries((() => {
  try {
    return readFileSync(new URL("../../apps/gateway/.env.local", import.meta.url), "utf8")
      .split("\n").map((l) => l.replace(/\s+#.*$/, "").trim()).filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]);
  } catch {
    return [];
  }
})()), ...process.env };

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
major >= 22 ? ok(`Node ${process.versions.node}`) : ko(`Node ${process.versions.node}`, "Instalá Node 22 o más nuevo.");
for (const t of ["ffmpeg", "mediamtx"]) has(t) ? ok(`${t} instalado`) : ko(`${t} no está`, `Instalalo (Mac: brew install ${t}; Windows: winget/choco o el zip oficial).`, false);

for (const k of ["SOLANA_PAY_TO", "SESSION_SECRET", "ESP32_URL", "PUBLIC_URL"]) {
  env[k] ? ok(`${k} configurado`) : ko(`falta ${k} en apps/gateway/.env.local`, "Completalo (ver skills/rent-a-shell-forger/SKILL.md, paso 4).");
}
if ((env.SESSION_SECRET ?? "").length < 32) ko("SESSION_SECRET corto", "Generalo con: openssl rand -hex 32");

if (env.ESP32_URL) {
  const s = await get(`${env.ESP32_URL}/state`, 2500);
  if (s.status === 200 && s.body?.ok) {
    ok(`ESP32 responde en ${env.ESP32_URL}`);
    s.body.current_ma === undefined ? ko("el firmware no manda current_ma", "Flasheá el firmware nuevo de robot-a para medir corriente.", false)
      : s.body.current_ma === null ? ko("INA219 no detectado", "Revisá SDA 21 / SCL 22 y la dirección 0x40 (opcional).", false)
      : ok(`corriente ${s.body.current_ma} mA`);
  } else ko(`ESP32 no responde en ${env.ESP32_URL}`, "Corré node scripts/forger/find-esp32.mjs y actualizá ESP32_URL.");
}

const port = env.PORT ?? 8787;
const local = `http://localhost:${port}`;
const h = await get(`${local}/api/health`);
if (h.status === 200) {
  ok(`gateway arriba en ${local} (rieles: ${h.body.rails.join(", ")})`);
  const shells = (await get(`${local}/api/shells`)).body;
  const sh = Array.isArray(shells) ? shells[0] : null;
  if (sh) {
    const f = await get(`${local}/api/shells/${sh.id}/frame`, 8000);
    f.status === 200 ? ok("cámara: hay frame") : ko("cámara: sin frame", "Revisá que MediaMTX esté corriendo y ffmpeg publicando en RTSP_URL (paso 3).", false);
    if (sh.camera?.hls) {
      const l = await get(`${local}/live/${sh.id}/index.m3u8`);
      l.status === 200 ? ok("video en vivo (HLS) por /live") : ko("sin HLS en /live", "Revisá HLS_UPSTREAM (MediaMTX en :8888) y el nombre del path = SHELL_ID.", false);
    }
  }
} else ko(`gateway no responde en ${local}`, "Arrancalo con: pnpm gateway");

if (env.PUBLIC_URL && !env.PUBLIC_URL.includes("localhost")) {
  const p = await get(`${env.PUBLIC_URL}/api/health`, 8000);
  p.status === 200 ? ok(`URL pública responde: ${env.PUBLIC_URL}`) : ko(`URL pública no responde: ${env.PUBLIC_URL}`, "Revisá el túnel (paso 6) y que PUBLIC_URL sea la URL que imprimió.");
} else ko("PUBLIC_URL es localhost", "Abrí un túnel (paso 6) y poné su URL en PUBLIC_URL.", false);

if (env.HUB_URL && env.PUBLIC_URL) {
  const f = await get(`${env.HUB_URL}/api/forgers`);
  const mine = Array.isArray(f.body) && f.body.find((g) => g.url === env.PUBLIC_URL.replace(/\/$/, ""));
  mine ? (mine.online ? ok("registrado en el hub y online") : ko("registrado en el hub pero offline", "El hub no llega a tu PUBLIC_URL: revisá el túnel.")) : ko("no estás en el hub", `curl -X POST ${env.HUB_URL}/api/forgers -H 'content-type: application/json' -d '{"gateway":"${env.PUBLIC_URL}"}'`, false);
}

console.log(bad ? `\n${bad} problema(s) crítico(s)${warn ? ` y ${warn} aviso(s)` : ""}.` : warn ? `\nFunciona, con ${warn} aviso(s) para revisar.` : "\nTodo listo: tu shell está publicado.");
process.exit(bad ? 1 : 0);
