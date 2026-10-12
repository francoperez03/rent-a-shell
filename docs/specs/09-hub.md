# 09 · Hub del marketplace

Cada Forger corre su propio gateway al lado de su robot: su wallet, su cola, su operator. El hub (`apps/hub`, Hono, puerto 8790) no toca pagos ni robots: descubre gateways, chequea su salud y publica un catálogo único para el sitio y para los agentes.

## Registro de Forgers

- `POST /api/forgers {gateway}`: alta abierta. El hub pide `GET {gateway}/api/shells` (timeout `HUB_TIMEOUT_MS`, 3 s) y valida la forma de cada ficha (`id`, `name`, `pricing.usd`, `joints`). Si no responde o la forma no es válida: 422. Si responde: 201 y queda listado.
- `DELETE /api/forgers {gateway}`: baja, con `Authorization: Bearer $HUB_ADMIN_TOKEN`.
- `GET /api/forgers`: gateways con `online`, `lastSeen` y los ids de sus shells.
- Seed por env: `HUB_GATEWAYS=url1,url2` arranca con esos gateways registrados.
- Persistencia en `HUB_DATA_FILE` (`data/hub.json`).

## Catálogo y salud

- Cada `POLL_SECONDS` (30) el hub vuelve a pedir `/api/shells` a cada gateway. Si no responde, el gateway queda `online: false` y sus shells siguen en el catálogo con `status: "offline"` (última ficha conocida).
- `GET /api/catalog`: lista plana de shells, cada uno con su `gateway` (la URL pública que publica el gateway del Forger, o la registrada si no la manda), su Forger, sensores y precio.

## Para agentes

- `GET /llms.txt`: todos los shells con su Forger, sensores, precio, el `llms.txt` de su gateway y el endpoint x402 donde se paga. Al final, cómo sumar hardware como Forger.
- `/mcp` (Streamable HTTP, sin estado): `list_shells` (catálogo completo) y `get_shell {id}` (ficha + `how_to_rent` con `llms`, `x402` y `mcp` del gateway).
- El pago y el control siempre van contra el gateway del Forger, nunca contra el hub.

## Sitio

- `VITE_HUB_URL`: si está, el catálogo (`useShells`) sale de `GET {hub}/api/catalog`. Si no, del gateway (`VITE_API_URL`), como antes.
- Cada shell se opera en su gateway. Los links del catálogo llevan `?gw=<gateway>`; `App.tsx` lo lee en el render y fija el gateway actual antes de que salgan las consultas. Queda en `sessionStorage` (`ras:gateway`) para que checkout, consola y SSE sigan hablando con ese gateway. La ficha (`/shells/:id`) también lo fija apenas carga el shell.
- Estado y cola de cada shell en la landing usan el gateway de ese shell (`baseFor(id)` en `src/lib/api.ts`).

## Verificado (2026-10-12)

- `apps/hub/src/hub.test.ts`: dos gateways falsos y uno caído. El caído queda `offline`, el alta de uno inexistente da 422, `llms.txt` lista el endpoint x402 de cada gateway, la baja sin token da 401 y el MCP lista `list_shells` y `get_shell`.
- En vivo: mock + dos gateways (8787 `el-tucu`, 8788 `tucu-2`) + hub. El catálogo lista los dos con `sensors: ["angles","current_ma"]`; al apagar el 8788, `GET /api/forgers` lo marca `online: false`.
