#!/usr/bin/env node
// Finds a shell's ESP32 on the local network: tries GET /state on every IP of this machine's /24 subnets.
//   node scripts/forger/find-esp32.mjs            → prints http://<ip> for every shell found
// A shell answers {ok:true, angles:{...}} (robot-a/SPEC.md §4.4 API).
import os from "node:os";

const subnets = new Set();
for (const ifs of Object.values(os.networkInterfaces())) {
  for (const i of ifs ?? []) {
    if (i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254.")) subnets.add(i.address.split(".").slice(0, 3).join("."));
  }
}
if (!subnets.size) {
  console.error("No local IPv4 network found. Is this machine on the robot's WiFi?");
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
  console.error(`scanning ${net}.0/24…`);
  // 64 at a time so the WiFi does not choke
  for (let start = 1; start < 255; start += 64) {
    const batch = Array.from({ length: Math.min(64, 255 - start) }, (_, k) => probe(`${net}.${start + k}`));
    for (const hit of await Promise.all(batch)) if (hit) found.push(hit);
  }
}
if (!found.length) {
  console.error("No shell found. Check that the ESP32 is on and on the same network, or set ESP32_URL by hand.");
  process.exit(1);
}
for (const { ip, j } of found) console.log(`http://${ip}  ${JSON.stringify(j.angles)}${"current_ma" in j ? ` · ${j.current_ma ?? "no"} mA` : ""}`);
