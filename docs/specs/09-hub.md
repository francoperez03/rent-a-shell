# 09 · Marketplace hub

Each Forger runs their own gateway next to their robot: their wallet, their queue, their operator. The hub doesn't touch payments or robots: it discovers gateways, checks their health and publishes a single catalog for the website and for agents. Since 2026-10-14 the hub is the website itself: `apps/web/src/server/hub.ts` (framework-free) behind thin Next.js route handlers in `apps/web/src/app/`. There is no separate process to run.

## Forger registry

- Registered gateways live in Upstash Redis (Vercel Marketplace), one hash `ras:forgers` keyed by normalized URL: `{url, addedAt, online, lastSeen, shells}` (`src/server/store.ts`). Without `UPSTASH_REDIS_REST_*` / `KV_REST_API_*` the store is in memory (local dev and tests).
- `HUB_GATEWAYS=url1,url2` seeds the catalog; a seed is persisted once it answers.
- `POST /api/forgers {gateway}`: open registration. The site fetches `GET {gateway}/api/shells` (timeout `HUB_TIMEOUT_MS`, 3 s) and validates the shape of each spec (`id`, `name`, `pricing.usd`, `joints`). If it doesn't respond or the shape is invalid: 422. If it responds: 201 and it's listed.
- Shell ids are unique in the catalog: if another live gateway already publishes the same id, 409 `shell_id_taken`. If that gateway is down (e.g. a quick tunnel from the same Forger changed URL), the new registration replaces it.
- `DELETE /api/forgers {gateway}`: removal, with `Authorization: Bearer $HUB_ADMIN_TOKEN`.
- `GET /api/forgers`: gateways with `online`, `lastSeen` and the ids of their shells.

## Catalog and health

- No poll loop. The catalog is computed on request: every registered gateway is fetched in parallel (3 s timeout) and the result is cached per instance for 30 s (stale copy served while a refresh runs in the background). An unreachable gateway becomes `online: false` and its shells stay in the catalog with `status: "offline"` (last known spec). The store is written only when a gateway's status or spec sheet changed.
- `GET /api/catalog`: flat list of shells, each with its `gateway` (the public URL the Forger's gateway publishes, or the registered one if it doesn't send it), its Forger, sensors and price.
- `GET /api/health`: `{ok, gateways, online}`.
- Cold cache with a dead gateway can take up to 3 s on the first request; the root layout fetches the catalog server-side, so pages render with the shells already in place.

## For agents

- `GET /llms.txt`: site intro, a `Gateway: <url>` line with the first online shell's gateway (`rent.mjs` resolves the site URL through it), `MCP:` and `Terms:` lines, the quick start for agents, then every shell with its Forger, sensors, price, reputation, its gateway's `llms.txt` and the x402 endpoint where it's paid, and the other entry points (catalog, MCP, registration, skills).
- `GET /.well-known/agent.json`: site-level agent card (services: web, catalog, MCP, llms.txt) with every shell and its gateway's `llms`, `x402` and `mcp`.
- `/mcp` (Streamable HTTP, stateless): `list_shells` (full catalog) and `get_shell {id}` (spec + `how_to_rent`).
- `GET /skills/rent/SKILL.md`, `/skills/rent/rent.mjs` and `/skills/forger/SKILL.md`: the Claude Code skills, read from the repo's `skills/` folder (allowlist; anything else is 404; shipped to Vercel through `outputFileTracingIncludes`).
- Payment and control always go to the Forger's gateway, never to the site.

## Website

- The catalog is same-origin (`useShells` → `/api/catalog`). Each shell is operated on its own gateway: catalog links carry `?gw=<gateway>`, the shell page calls `setGateway` before its first query, and the value is stored in `sessionStorage` (`ras:gateway`) so checkout, console and SSE keep talking to that gateway. `baseFor(id)` in `src/lib/api.ts` picks the shell's gateway for state and queue.
- The root layout fetches the catalog on the server and seeds the react-query cache, so there is no skeleton and the status dot in the nav is right on first paint.

## Env

`HUB_GATEWAYS` (optional seed), `HUB_ADMIN_TOKEN`, `HUB_TIMEOUT_MS` (3000), `NEXT_PUBLIC_SITE_URL` (optional; otherwise derived from the request host), Upstash variables injected by the Marketplace integration.

## Verified (2026-10-14)

- `apps/web/src/server/hub.test.ts` (`pnpm --filter web test`): two fake gateways and one down. The down one becomes `offline`, registering a nonexistent one returns 422, a bad URL 400, a duplicated id from a live gateway returns 409 and replaces it once the original is down, `llms.txt` carries the `Gateway:` line and each gateway's x402 endpoint, the agent card lists the shells, removal without token returns 401 and with it 200, the MCP lists `list_shells` and `get_shell`, and the skills are served with path traversal and non-allowlisted files rejected.
- Live: `next start` with `HUB_GATEWAYS=http://localhost:8787` against the real gateway: health, catalog, `llms.txt`, agent card, skills, MCP `tools/list`, 422 on a dead gateway, every page 200 and `/nope` 404; `node rent.mjs catalog --hub` and `info --gateway <site>` resolve.
