import type { Shell } from "@ras/shell-spec";

export type Env = Record<string, string | undefined>;

export interface Config {
  port: number;
  esp32: string;
  secret: string;
  publicUrl: string;
  liveUrl: string | null;
  rtspUrl: string | null;
  allowedOrigin: string;
  rails: string[];
  restMs: number;
  maxBlocks: number;
  dataFile: string | null;
  shell: Omit<Shell, "status" | "camera">;
}

export function loadConfig(env: Env): Config {
  const publicUrl = (env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 8787}`).replace(/\/$/, "");
  const secret = env.SESSION_SECRET ?? "";
  if (secret.length < 32 && env.NODE_ENV === "production") throw new Error("SESSION_SECRET de al menos 32 caracteres");
  return {
    port: Number(env.PORT ?? 8787),
    esp32: (env.ESP32_URL ?? "http://localhost:8080").replace(/\/$/, ""),
    // ponytail: secreto de dev si falta; en la Legion siempre va SESSION_SECRET
    secret: secret || "dev-secret-dev-secret-dev-secret-0000",
    publicUrl,
    liveUrl: env.LIVE_URL || null,
    rtspUrl: env.RTSP_URL || null,
    allowedOrigin: env.ALLOWED_ORIGIN ?? "*",
    rails: (env.RAILS ?? "fake").split(",").map((s) => s.trim()).filter(Boolean),
    restMs: Number(env.REST_SECONDS ?? 60) * 1000,
    maxBlocks: Number(env.MAX_BLOCKS ?? 6),
    dataFile: env.DATA_FILE === "" ? null : (env.DATA_FILE ?? "data/state.json"),
    // Ficha de El Tucu (docs/specs/02-robot.md; rangos de robot-a/SPEC.md §4.4)
    shell: {
      id: "el-tucu",
      name: "El Tucu",
      kind: "arm-4dof",
      location: env.SHELL_LOCATION ?? "Salta, AR",
      joints: { base: [20, 160], shoulder: [50, 130], elbow: [50, 130], grip: [40, 110] },
      home: { base: 90, shoulder: 90, elbow: 90, grip: 70 },
      routines: ["robot", "lento", "saludo", "recta"],
      pricing: { block_minutes: Number(env.BLOCK_MINUTES ?? 5), usd: env.BLOCK_USD ?? "1.00" },
      forger: { name: env.FORGER_NAME ?? "Franco Pérez", contact: env.FORGER_CONTACT || undefined, customizations: true },
      // ponytail: estimado (docs/costos.md): 4 SG90 + ESP32 + PLA + fuente, importado a AR, impresión + armado + calibración
      build: { parts_usd: 45, lead_days: 14, build_hours: 10 },
    },
  };
}
