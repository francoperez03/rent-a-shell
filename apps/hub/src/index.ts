import { serve } from "@hono/node-server";
import { createHub } from "./hub.ts";

const env = process.env;
const port = Number(env.PORT ?? 8790);
const { app, poll, gateways } = createHub(env);

await poll();
setInterval(() => void poll().catch((e) => console.error("[poll]", e)), Number(env.POLL_SECONDS ?? 30) * 1000);
serve({ fetch: app.fetch, port });
console.log(`hub on http://localhost:${port} · ${gateways.size} gateways`);
