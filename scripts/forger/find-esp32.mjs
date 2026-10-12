#!/usr/bin/env node
// Busca el ESP32 de un shell en la red local: prueba GET /state en cada IP de las subredes /24 de esta compu.
//   node scripts/forger/find-esp32.mjs            → imprime http://<ip> de cada shell encontrado
// Un shell responde {ok:true, angles:{...}} (API de robot-a/SPEC.md §4.4).
import os from "node:os";

const subnets = new Set();
for (const ifs of Object.values(os.networkInterfaces())) {
  for (const i of ifs ?? []) {
    if (i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254.")) subnets.add(i.address.split(".").slice(0, 3).join("."));
  }
}
if (!subnets.size) {
  console.error("No encontré una red IPv4 local. ¿La compu está conectada al WiFi del robot?");
  process.exit(1);
}

async function probe(ip) {
  try {
    const r = await fetch(`http://${ip}/state`, { signal: AbortSignal.timeout(1200) });
    const j = await r.json();
    return j?.ok === true && j.angles && typeof j.angles === "object" ? { ip, j } : null;
  } catch {
    return null;
  }
}

const found = [];
for (const net of subnets) {
  console.error(`buscando en ${net}.0/24…`);
  // de a 64 en paralelo para no saturar el WiFi
  for (let start = 1; start < 255; start += 64) {
    const batch = Array.from({ length: Math.min(64, 255 - start) }, (_, k) => probe(`${net}.${start + k}`));
    for (const hit of await Promise.all(batch)) if (hit) found.push(hit);
  }
}
if (!found.length) {
  console.error("No apareció ningún shell. Revisá que el ESP32 esté prendido y en la misma red, o pasá ESP32_URL a mano.");
  process.exit(1);
}
for (const { ip, j } of found) console.log(`http://${ip}  ${JSON.stringify(j.angles)}${"current_ma" in j ? ` · ${j.current_ma ?? "sin"} mA` : ""}`);
