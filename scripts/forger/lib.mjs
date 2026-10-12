// Funciones puras del Forger (sin efectos al importar): lectura de .env.local y argumentos de cámara por sistema.
import { readFileSync } from "node:fs";

/** .env.local tolerante a CRLF (Windows) y a comentarios al final de la línea. */
export function readEnvFile(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .replace(/^\uFEFF/, "") // BOM del Bloc de notas
        .split(/\r?\n/)
        .map((l) => l.replace(/\s+#.*$/, "").trim())
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}

/** Argumentos de captura según el sistema. */
export function cameraInput(platform, e) {
  const size = e.CAMERA_SIZE ? ["-video_size", e.CAMERA_SIZE] : [];
  // CAMERA=test: señal de prueba de ffmpeg, para probar todo sin webcam
  if (e.CAMERA === "test") return ["-re", "-f", "lavfi", "-i", `testsrc=size=${e.CAMERA_SIZE || "1280x720"}:rate=${e.CAMERA_FPS || 15}`];
  if (platform === "win32") {
    if (!e.CAMERA) throw new Error("Falta CAMERA: corré con --list-cameras y copiá el nombre exacto.");
    return ["-f", "dshow", "-rtbufsize", "100M", ...size, ...(e.CAMERA_FPS ? ["-framerate", e.CAMERA_FPS] : []), "-i", `video=${e.CAMERA}`];
  }
  if (platform === "darwin") return ["-f", "avfoundation", "-framerate", e.CAMERA_FPS || "30", ...size, "-i", e.CAMERA || "0"];
  return ["-f", "v4l2", ...(e.CAMERA_FPS ? ["-framerate", e.CAMERA_FPS] : []), ...size, "-i", e.CAMERA || "/dev/video0"];
}

export function cameraArgs(platform, e) {
  const fps = Number(e.CAMERA_FPS || 30);
  return [
    "-loglevel", "error",
    ...cameraInput(platform, e),
    // yuv420p: las webcams suelen dar yuyv422 y los navegadores no reproducen H.264 4:2:2
    "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-g", String(fps),
    "-f", "rtsp", "-rtsp_transport", "tcp", `rtsp://localhost:8554/${e.SHELL_ID || "el-tucu"}`,
  ];
}

