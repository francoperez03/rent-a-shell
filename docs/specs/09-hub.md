# 09 · Marketplace hub

Each Forger runs their own gateway next to their robot: their wallet, their queue, their operator. The hub (`apps/hub`, Hono, port 8790) doesn't touch payments or robots: it discovers gateways, checks their health and publishes a single catalog for the website and for agents.

## Forger registration

- `POST /api/forgers {gateway}`: open registration. The hub fetches `GET {gateway}/api/shells` (timeout `HUB_TIMEOUT_MS`, 3 s) and validates the shape of each spec (`id`, `name`, `pricing.usd`, `joints`). If it doesn't respond or the shape is invalid: 422. If it responds: 201 and it's listed.
- Shell ids are unique in the catalog: if another live gateway already publishes the same id, 409 `shell_id_taken`. If that gateway is down (e.g. a quick tunnel from the same Forger changed URL), the new registration replaces it.
- `DELETE /api/forgers {gateway}`: removal, with `Authorization: Bearer $HUB_ADMIN_TOKEN`.
- `GET /api/forgers`: gateways with `online`, `lastSeen` and the ids of their shells.
- Seed via env: `HUB_GATEWAYS=url1,url2` starts with those gateways registered.
- Persistence in `HUB_DATA_FILE` (`data/hub.json`).

## Catalog and health

- Every `POLL_SECONDS` (30) the hub fetches `/api/shells` from each gateway again. If it doesn't respond, the gateway becomes `online: false` and its shells stay in the catalog with `status: "offline"` (last known spec).
- `GET /api/catalog`: flat list of shells, each with its `gateway` (the public URL the Forger's gateway publishes, or the registered one if it doesn't send it), its Forger, sensors and price.

## For agents

- `GET /llms.txt`: every shell with its Forger, sensors, price, its gateway's `llms.txt` and the x402 endpoint where it's paid. At the end, how to add hardware as a Forger and how to install the Claude Code skills.
- `/mcp` (Streamable HTTP, stateless): `list_shells` (full catalog) and `get_shell {id}` (spec + `how_to_rent` with the gateway's `llms`, `x402` and `mcp`).
- `GET /skills/rent/SKILL.md`, `/skills/rent/rent.mjs` and `/skills/forger/SKILL.md`: the Claude Code skills (allowlist; anything else is 404).
- Payment and control always go to the Forger's gateway, never to the hub.

## Website

- `VITE_HUB_URL`: if set, the catalog (`useShells`) comes from `GET {hub}/api/catalog`. Otherwise, from the gateway (`VITE_API_URL`), as before.
- Each shell is operated on its own gateway. Catalog links carry `?gw=<gateway>`; `App.tsx` reads it during render and sets the current gateway before queries go out. It's stored in `sessionStorage` (`ras:gateway`) so checkout, console and SSE keep talking to that gateway. The spec page (`/shells/:id`) also sets it as soon as the shell loads.
- State and queue for each shell on the landing use that shell's gateway (`baseFor(id)` in `src/lib/api.ts`).

## Verified (2026-10-12)

- `apps/hub/src/hub.test.ts`: two fake gateways and one down. The down one becomes `offline`, registering a nonexistent one returns 422, a duplicated id from a live gateway returns 409 and replaces it once the original is down, `llms.txt` lists each gateway's x402 endpoint, removal without token returns 401, the MCP lists `list_shells` and `get_shell`, and the skills are served.
- Live: mock + two gateways (8787 `el-tucu`, 8788 `tucu-2`) + hub. The catalog lists both with `sensors: ["angles","current_ma"]`; when 8788 is turned off, `GET /api/forgers` marks it `online: false`.
