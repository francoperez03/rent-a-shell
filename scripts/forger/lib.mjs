// Forger helpers (no side effects on import): .env.local parsing, camera arguments, shell.json validation and the health checks.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

/** .env.local parser tolerant of CRLF and trailing comments. */
export function readEnvFile(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .replace(/^\uFEFF/, "") // editor BOM
        .split(/\r?\n/)
        .map((l) => l.replace(/\s+#.*$/, "").trim())
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}

/** Capture arguments: avfoundation on macOS, v4l2 on Linux (Raspberry Pi). */
export function cameraInput(platform, e) {
  const size = e.CAMERA_SIZE ? ["-video_size", e.CAMERA_SIZE] : [];
  // CAMERA=test: ffmpeg test signal, to try everything without a webcam
  if (e.CAMERA === "test") return ["-re", "-f", "lavfi", "-i", `testsrc=size=${e.CAMERA_SIZE || "1280x720"}:rate=${e.CAMERA_FPS || 15}`];
  // macOS cameras deliver nv12/uyvy422, never yuv420p: ask for nv12 on input, libx264 converts on output
  if (platform === "darwin") return ["-f", "avfoundation", "-pixel_format", e.CAMERA_PIXFMT || "nv12", "-framerate", e.CAMERA_FPS || "30", ...size, "-i", e.CAMERA || "0"];
  // mjpeg: raw YUYV over USB2 cannot do 720p at 30 fps; almost every UVC webcam offers MJPG
  return ["-f", "v4l2", "-input_format", e.CAMERA_INPUT_FORMAT || "mjpeg", ...(e.CAMERA_FPS ? ["-framerate", e.CAMERA_FPS] : []), ...size, "-i", e.CAMERA || "/dev/video0"];
}

export function cameraArgs(platform, e) {
  const fps = Number(e.CAMERA_FPS || 30);
  const out = Number(e.CAMERA_OUT_FPS || 15);
  const kbps = Number(e.CAMERA_KBPS || 700); // ponytail: ~0.7 Mbps fits a home upload through the quick tunnel; raise if the link allows
  return [
    "-loglevel", "error",
    ...cameraInput(platform, e),
    // yuv420p: webcams often output yuyv422 and browsers do not play H.264 4:2:2
    // -fps_mode cfr: avfoundation timestamps barely advance, so MediaMTX never closes an HLS segment ("reached maximum segment size")
    // 540 short side, 15 fps out, capped bitrate: the camera leaves through the tunnel and a home upload is the ceiling
    "-vf", "scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)'", "-fps_mode", "cfr", "-r", String(out),
    "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-g", String(out),
    "-b:v", `${kbps}k`, "-maxrate", `${kbps}k`, "-bufsize", `${kbps * 2}k`,
    "-f", "rtsp", "-rtsp_transport", "tcp", `rtsp://localhost:8554/${e.SHELL_ID || "el-tucu"}`,
  ];
}


const JOINTS = ["base", "shoulder", "elbow", "grip"];

/** Validates a shell.json object (same rules as the gateway). Returns a list of problems, empty when the sheet is fine. */
export function validateSheet(sheet) {
  const bad = [];
  const s = sheet ?? {};
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(s.id ?? "")) bad.push("id: lowercase letters, digits and dashes (e.g. el-tucu)");
  for (const k of ["name", "kind", "location"]) if (typeof s[k] !== "string" || !s[k].trim()) bad.push(`${k}: required`);
  for (const j of JOINTS) {
    const r = s.joints?.[j];
    if (!Array.isArray(r) || r.length !== 2 || !r.every(Number.isFinite) || r[0] >= r[1]) bad.push(`joints.${j}: [min, max] in degrees, min below max`);
    const h = s.home?.[j];
    if (!Number.isFinite(h)) bad.push(`home.${j}: a number in degrees`);
    else if (Array.isArray(r) && (h < r[0] || h > r[1])) bad.push(`home.${j}: ${h} is outside ${r[0]} to ${r[1]}`);
  }
  for (const k of ["routines", "sensors"]) if (!Array.isArray(s[k]) || !s[k].length || !s[k].every((x) => typeof x === "string" && x)) bad.push(`${k}: a non-empty list of names`);
  if (!Number.isInteger(s.pricing?.block_minutes) || s.pricing.block_minutes <= 0) bad.push("pricing.block_minutes: a whole number of minutes");
  if (!/^\d+(\.\d{1,2})?$/.test(String(s.pricing?.usd ?? ""))) bad.push('pricing.usd: USD per block as a string with up to two decimals, e.g. "0.05"');
  if (typeof s.forger?.name !== "string" || !s.forger.name.trim()) bad.push("forger.name: required");
  if (typeof s.forger?.customizations !== "boolean") bad.push("forger.customizations: true or false");
  for (const k of ["parts_usd", "lead_days", "build_hours"]) if (!Number.isFinite(s.build?.[k]) || s.build[k] < 0) bad.push(`build.${k}: a number`);
  if (s.image !== undefined && (typeof s.image !== "string" || !/\.(jpe?g|png|webp)$/i.test(s.image))) bad.push("image: a jpg, png or webp file name next to shell.json");
  return bad;
}

const get = async (url, ms = 4000) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() };
  } catch (e) {
    return { status: 0, error: e.message };
  }
};
const has = (cmd) => spawnSync(cmd, ["-version"], { stdio: "ignore" }).status === 0 || spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;

/**
 * End-to-end Forger checks: shell.json, tools, .env.local, ESP32, gateway, camera, public URL, hub.
 * Shared by `forger doctor` (console) and the status page. level: ok | warn | bad (bad = the shell is not served).
 */
export async function checks(env, sheetFile) {
  const out = [];
  const ok = (name) => out.push({ level: "ok", name });
  const ko = (name, fix, critical = true) => out.push({ level: critical ? "bad" : "warn", name, fix });

  try {
    const sheet = JSON.parse(readFileSync(sheetFile, "utf8"));
    const problems = validateSheet(sheet);
    problems.length ? ko(`shell.json has ${problems.length} problem(s)`, "pnpm forger:spec lists them") : ok(`shell.json: ${sheet.name} (${sheet.id})${sheet.image ? " with photo" : ", no photo"}`);
  } catch {
    ko("no apps/gateway/shell.json", "cp apps/gateway/shell.example.json apps/gateway/shell.json and fill it in (the Forger skill guides it)", false);
  }

  const [major] = process.versions.node.split(".").map(Number);
  major >= 22 ? ok(`Node ${process.versions.node}`) : ko(`Node ${process.versions.node}`, "Install Node 22 or newer.");
  for (const t of ["ffmpeg", "mediamtx", "cloudflared"]) has(env[`${t.toUpperCase()}_PATH`] || t) ? ok(`${t} installed`) : ko(`${t} missing`, `Install it (macOS: brew install ${t}; Raspberry Pi: pnpm forger:deploy installs it).`, false);

  const solana = (env.RAILS ?? "").includes("solana");
  for (const k of ["SOLANA_PAY_TO", "SESSION_SECRET", "ESP32_URL", "PUBLIC_URL"]) {
    env[k] ? ok(`${k} set`) : ko(`missing ${k} in apps/gateway/.env.local`, k === "SOLANA_PAY_TO" ? "Set your Solana address to get paid (RAILS=solana-x402,solana-pay)." : "Fill it in (see the configuration step in skills/rent-a-shell-forger/SKILL.md).", k !== "SOLANA_PAY_TO" || solana);
  }
  if ((env.SESSION_SECRET ?? "").length < 32) ko("SESSION_SECRET too short", "Generate it with: openssl rand -hex 32");

  if (env.ESP32_URL) {
    const s = await get(`${env.ESP32_URL}/state`, 2500);
    if (s.status === 200 && s.body?.ok) {
      ok(`ESP32 answers at ${env.ESP32_URL}`);
      s.body.current_ma === undefined ? ko("firmware does not report current_ma", "Flash the latest robot-a firmware to measure current.", false)
        : s.body.current_ma === null ? ko("INA219 not detected", "Check SDA 21 / SCL 22 and address 0x40 (optional).", false)
        : ok(`current ${s.body.current_ma} mA`);
    } else ko(`ESP32 does not answer at ${env.ESP32_URL}`, "Power and WiFi of the robot; pnpm forger:esp32 finds its IP for ESP32_URL.");
  }

  const local = `http://localhost:${env.PORT ?? 8787}`;
  const h = await get(`${local}/api/health`);
  if (h.status === 200) {
    ok(`gateway up at ${local} (rails: ${h.body.rails.join(", ")})`);
    const shells = (await get(`${local}/api/shells`)).body;
    const sh = Array.isArray(shells) ? shells[0] : null;
    if (sh) {
      sh.pricing?.usd === "0.05" ? ko(`price is the default (USD ${sh.pricing.usd} per ${sh.pricing.block_minutes}-minute block)`, "Set pricing in shell.json to the price of your shell.", false) : ok(`price USD ${sh.pricing?.usd} per ${sh.pricing?.block_minutes}-minute block`);
      const f = await get(`${local}/api/shells/${sh.id}/frame`, 8000);
      f.status === 200 ? ok("camera: frame available") : ko("camera: no frame", "Check that MediaMTX runs and ffmpeg publishes (camera row above; CAMERA, pnpm forger:cameras).", false);
      if (sh.camera?.hls) {
        const l = await get(`${local}/live/${sh.id}/index.m3u8`);
        l.status === 200 ? ok("live video (HLS) via /live") : ko("no HLS at /live", "Check HLS_UPSTREAM (MediaMTX on :8888) and that the path name equals SHELL_ID.", false);
      }
    }
  } else ko(`gateway does not answer at ${local}`, "Start it with: pnpm forger (on a Pi: sudo systemctl restart rent-a-shell-forger)");

  if (env.PUBLIC_URL && !env.PUBLIC_URL.includes("localhost")) {
    const p = await get(`${env.PUBLIC_URL}/api/health`, 8000);
    p.status === 200 ? ok(`public URL answers: ${env.PUBLIC_URL}`) : ko(`public URL does not answer: ${env.PUBLIC_URL}`, "Check the tunnel (it prints a new URL on every start).");
  } else ko("PUBLIC_URL is localhost", "pnpm forger opens a tunnel; or set PUBLIC_URL to a fixed one.", false);

  if (env.HUB_URL && !env.HUB_TOKEN) ko("HUB_TOKEN is missing", "Ask the Rent a Shell admin for a Forger token and put it in apps/gateway/.env.local.", false);
  if (env.HUB_URL && env.PUBLIC_URL) {
    const f = await get(`${env.HUB_URL}/api/forgers`);
    const mine = Array.isArray(f.body) && f.body.find((g) => g.url === env.PUBLIC_URL.replace(/\/$/, ""));
    mine ? (mine.online ? ok("registered on the hub and online") : ko("registered on the hub but offline", "The hub cannot reach your PUBLIC_URL: check the tunnel.")) : ko("not on the hub", "pnpm forger registers on its own when HUB_URL and HUB_TOKEN are set; check its hub log line.", false);
  }
  return out;
}
