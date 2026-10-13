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
  return [
    "-loglevel", "error",
    ...cameraInput(platform, e),
    // yuv420p: webcams often output yuyv422 and browsers do not play H.264 4:2:2
    // -fps_mode cfr: avfoundation timestamps barely advance, so MediaMTX never closes an HLS segment ("reached maximum segment size")
    // 720p tall side: enough for the bench and light enough for the tunnel
    "-vf", "scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)'", "-fps_mode", "cfr", "-r", String(fps),
    "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-g", String(fps),
    "-f", "rtsp", "-rtsp_transport", "tcp", `rtsp://localhost:8554/${e.SHELL_ID || "el-tucu"}`,
  ];
}

