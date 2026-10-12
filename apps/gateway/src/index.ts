import { serve } from "@hono/node-server";
import { loadConfig } from "./config.ts";
import { createApp } from "./app.ts";

const env = process.env;
const cfg = loadConfig(env);
const { app, tick, rails } = createApp(cfg, env);

setInterval(() => void tick().catch((e) => console.error("[tick]", e)), 1000);
serve({ fetch: app.fetch, port: cfg.port });
console.log(`gateway on http://localhost:${cfg.port} · robot ${cfg.esp32} · rails ${rails.map((r) => `${r.id}${r.manifest().available ? "" : " (unavailable)"}`).join(", ")}`);
