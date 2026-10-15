import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Shell, ShellSheet } from "@ras/shell-spec";

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
  /** Payments go through the shell_escrow program (operator key present): the 10 % fee applies to every rail. */
  escrow: boolean;
  shell: Omit<Shell, "status" | "camera" | "gateway">;
  /** Absolute path of the shell photo (shell.json `image`), served at /api/shells/:id/image. */
  imageFile: string | null;
}

const range = z.tuple([z.number(), z.number()]).refine(([a, b]) => a < b, "min must be below max");
const joints = z.object({ base: range, shoulder: range, elbow: range, grip: range });
const angles = z.object({ base: z.number(), shoulder: z.number(), elbow: z.number(), grip: z.number() });
const sheetSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/, "lowercase letters, digits and dashes"),
    name: z.string().min(1),
    kind: z.string().min(1),
    location: z.string().min(1),
    joints,
    home: angles,
    routines: z.array(z.string().min(1)).min(1),
    sensors: z.array(z.string().min(1)).min(1),
    pricing: z.object({ block_minutes: z.number().int().positive(), usd: z.string().regex(/^\d+(\.\d{1,2})?$/, "USD with up to two decimals") }),
    forger: z.object({ name: z.string().min(1), contact: z.string().optional(), customizations: z.boolean() }),
    build: z.object({ parts_usd: z.number().nonnegative(), lead_days: z.number().int().nonnegative(), build_hours: z.number().nonnegative() }),
    image: z.string().optional(),
  })
  .refine((s) => (Object.keys(s.home) as (keyof typeof s.home)[]).every((j) => s.home[j] >= s.joints[j][0] && s.home[j] <= s.joints[j][1]), "HOME must be inside each joint's range");

/** Reads and validates shell.json. Throws with the field that is wrong. */
export function loadSheet(file: string): ShellSheet {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file}: ${(e as Error).message}`);
  }
  if (raw && typeof raw === "object") delete (raw as Record<string, unknown>)._help;
  const r = sheetSchema.safeParse(raw);
  if (!r.success) throw new Error(`${file}: ${r.error.issues.map((i) => `${i.path.join(".") || "sheet"}: ${i.message}`).join("; ")}`);
  return { ...r.data, forger: { ...r.data.forger, contact: r.data.forger.contact || undefined } };
}

export function loadConfig(env: Env): Config {
  const publicUrl = (env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 8787}`).replace(/\/$/, "");
  // shell.json next to .env.local is the spec sheet; SHELL_* / BLOCK_* / FORGER_* env vars override single fields
  const sheetFile = env.SHELL_FILE === "" ? null : path.resolve(env.SHELL_FILE ?? "shell.json");
  const sheet = sheetFile && existsSync(sheetFile) ? loadSheet(sheetFile) : null;
  const imageFile = sheet?.image && sheetFile ? path.resolve(path.dirname(sheetFile), sheet.image) : null;
  if (imageFile && !existsSync(imageFile)) throw new Error(`${sheetFile}: image ${sheet!.image} not found`);
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
    escrow: Boolean(env.SOLANA_OPERATOR_KEY),
    imageFile,
    // Defaults are El Tucu's sheet (same limits and home as the flashed firmware: robot-a sdkconfig TUCU_MIN/MAX_*, DANCE_HOME;
    // build is the docs/costs.md estimate). A Forger's shell.json replaces them.
    shell: {
      id: env.SHELL_ID ?? sheet?.id ?? "el-tucu",
      name: env.SHELL_NAME ?? sheet?.name ?? "El Tucu",
      kind: sheet?.kind ?? "arm-4dof",
      location: env.SHELL_LOCATION ?? sheet?.location ?? "Tucumán, AR",
      joints: sheet?.joints ?? { base: [20, 160], shoulder: [80, 170], elbow: [80, 130], grip: [130, 175] },
      home: sheet?.home ?? { base: 105, shoulder: 115, elbow: 90, grip: 150 },
      routines: sheet?.routines ?? ["robot", "lento", "saludo", "recta"],
      sensors: env.SHELL_SENSORS ? env.SHELL_SENSORS.split(",").map((s) => s.trim()).filter(Boolean) : (sheet?.sensors ?? ["angles"]),
      pricing: { block_minutes: Number(env.BLOCK_MINUTES ?? sheet?.pricing.block_minutes ?? 5), usd: env.BLOCK_USD ?? sheet?.pricing.usd ?? "0.05" },
      forger: { name: env.FORGER_NAME ?? sheet?.forger.name ?? "Franco Pérez", contact: env.FORGER_CONTACT || sheet?.forger.contact || undefined, customizations: sheet?.forger.customizations ?? true },
      build: sheet?.build ?? { parts_usd: 45, lead_days: 14, build_hours: 10 },
    },
  };
}
