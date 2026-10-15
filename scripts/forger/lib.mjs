// Pure Forger helpers (no side effects on import): .env.local parsing and per-OS camera arguments.
import { readFileSync } from "node:fs";

/** .env.local parser tolerant of CRLF (Windows) and trailing comments. */
export function readEnvFile(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .replace(/^\uFEFF/, "") // Notepad BOM
        .split(/\r?\n/)
        .map((l) => l.replace(/\s+#.*$/, "").trim())
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}

/** Capture arguments per OS. */
export function cameraInput(platform, e) {
  const size = e.CAMERA_SIZE ? ["-video_size", e.CAMERA_SIZE] : [];
  // CAMERA=test: ffmpeg test signal, to try everything without a webcam
  if (e.CAMERA === "test") return ["-re", "-f", "lavfi", "-i", `testsrc=size=${e.CAMERA_SIZE || "1280x720"}:rate=${e.CAMERA_FPS || 15}`];
  if (platform === "win32") {
    if (!e.CAMERA) throw new Error("Missing CAMERA: run with --list-cameras and copy the exact name.");
    return ["-f", "dshow", "-rtbufsize", "100M", ...size, ...(e.CAMERA_FPS ? ["-framerate", e.CAMERA_FPS] : []), "-i", `video=${e.CAMERA}`];
  }
  // macOS cameras deliver nv12/uyvy422, never yuv420p: ask for nv12 on input, libx264 converts on output
  if (platform === "darwin") return ["-f", "avfoundation", "-pixel_format", e.CAMERA_PIXFMT || "nv12", "-framerate", e.CAMERA_FPS || "30", ...size, "-i", e.CAMERA || "0"];
  return ["-f", "v4l2", ...(e.CAMERA_FPS ? ["-framerate", e.CAMERA_FPS] : []), ...size, "-i", e.CAMERA || "/dev/video0"];
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
