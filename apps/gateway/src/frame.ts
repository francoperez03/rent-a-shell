// Último JPEG de la cámara para agentes sin HLS. Lee un frame del RTSP de MediaMTX con ffmpeg.
// ponytail: un ffmpeg por pedido con cache de 1 s; si hace falta más fps, dejar un ffmpeg vivo con -update 1.
import { spawn } from "node:child_process";

export class Frames {
  private cache: { at: number; jpg: Buffer } | null = null;
  private inflight: Promise<Buffer | null> | null = null;
  constructor(private rtsp: string | null, private ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg") {}

  async latest(): Promise<Buffer | null> {
    if (!this.rtsp) return null;
    if (this.cache && Date.now() - this.cache.at < 1000) return this.cache.jpg;
    this.inflight ??= this.grab().finally(() => (this.inflight = null));
    const jpg = await this.inflight;
    if (jpg) this.cache = { at: Date.now(), jpg };
    return jpg ?? this.cache?.jpg ?? null;
  }

  private grab(): Promise<Buffer | null> {
    return new Promise((resolve) => {
      const p = spawn(this.ffmpeg, ["-loglevel", "error", "-rtsp_transport", "tcp", "-i", this.rtsp!, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-"]);
      const chunks: Buffer[] = [];
      const t = setTimeout(() => p.kill("SIGKILL"), 4000);
      p.stdout.on("data", (d) => chunks.push(d));
      p.on("error", () => resolve(null));
      p.on("close", (code) => {
        clearTimeout(t);
        resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : null);
      });
    });
  }
}
