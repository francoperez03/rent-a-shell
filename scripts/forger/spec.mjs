#!/usr/bin/env node
// Validates apps/gateway/shell.json (and its photo) and prints the spec sheet the way the site shows it.
//   pnpm forger:spec            exits 1 when something is wrong, and says what
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSheet } from "./lib.mjs";

const file = process.env.SHELL_FILE || fileURLToPath(new URL("../../apps/gateway/shell.json", import.meta.url));
let sheet;
try {
  sheet = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.log(`✗ ${file}: ${e.message}\n    → cp apps/gateway/shell.example.json apps/gateway/shell.json and fill it in`);
  process.exit(1);
}
const problems = validateSheet(sheet);
if (sheet.image) {
  const img = path.resolve(path.dirname(file), sheet.image);
  try {
    const size = statSync(img).size;
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
