import type { Shell } from "@ras/shell-spec";

export type Env = Record<string, string | undefined>;

export interface Config {
  port: number;
  esp32: string;
  secret: string;
  publicUrl: string;
  liveUrl: string | null;
  hlsUpstream: string | null;
  rtspUrl: string | null;
  allowedOrigin: string;
  rails: string[];
  restMs: number;
  offlineRefundMs: number;
  maxBlocks: number;
  forgerToken: string | null;
  dataFile: string | null;
  shell: Omit<Shell, "status" | "camera" | "gateway">;
}

export function loadConfig(env: Env): Config {
  const publicUrl = (env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 8787}`).replace(/\/$/, "");
  const secret = env.SESSION_SECRET ?? "";
  if (secret.length < 32 && env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be at least 32 characters");
  return {
    port: Number(env.PORT ?? 8787),
    esp32: (env.ESP32_URL ?? "http://localhost:8080").replace(/\/$/, ""),
    // ponytail: dev secret when missing; production always sets SESSION_SECRET
    secret: secret || "dev-secret-dev-secret-dev-secret-0000",
    publicUrl,
    // with HLS_UPSTREAM (local MediaMTX) the gateway serves video at /live/*, so one tunnel is enough
    liveUrl: env.LIVE_URL || (env.HLS_UPSTREAM ? `${publicUrl}/live/${env.SHELL_ID ?? "el-tucu"}/index.m3u8` : null),
    hlsUpstream: env.HLS_UPSTREAM?.replace(/\/$/, "") || null,
    rtspUrl: env.RTSP_URL || null,
    allowedOrigin: env.ALLOWED_ORIGIN ?? "*",
    rails: (env.RAILS ?? "fake").split(",").map((s) => s.trim()).filter(Boolean),
    restMs: Number(env.REST_SECONDS ?? 60) * 1000,
    offlineRefundMs: Number(env.OFFLINE_REFUND_SECONDS ?? 120) * 1000,
    maxBlocks: Number(env.MAX_BLOCKS ?? 6),
    forgerToken: env.FORGER_TOKEN || null,
    dataFile: env.DATA_FILE === "" ? null : (env.DATA_FILE ?? "data/state.json"),
    // El Tucu spec sheet (docs/specs/02-robot.md; ranges from robot-a/SPEC.md §4.4)
    shell: {
      id: env.SHELL_ID ?? "el-tucu",
      name: env.SHELL_NAME ?? "El Tucu",
      kind: "arm-4dof",
      location: env.SHELL_LOCATION ?? "Tucumán, AR",
      joints: { base: [20, 160], shoulder: [50, 130], elbow: [50, 130], grip: [40, 110] },
      home: { base: 90, shoulder: 90, elbow: 90, grip: 70 },
      routines: ["robot", "lento", "saludo", "recta"],
      sensors: (env.SHELL_SENSORS ?? "angles,current_ma").split(",").map((s) => s.trim()).filter(Boolean),
      pricing: { block_minutes: Number(env.BLOCK_MINUTES ?? 5), usd: env.BLOCK_USD ?? "1.00" },
      forger: { name: env.FORGER_NAME ?? "Franco Pérez", contact: env.FORGER_CONTACT || undefined, customizations: true },
      // ponytail: estimate (docs/costs.md): 4 SG90 + ESP32 + PLA + PSU, imported to AR, printing + assembly + calibration
      build: { parts_usd: 45, lead_days: 14, build_hours: 10 },
    },
  };
}
