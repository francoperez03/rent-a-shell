# 01 · Arquitectura

## Mapa

```
 Persona (navegador)                     Agente de IA
   │  sitio, checkout, consola             │  llms.txt, MCP, x402
   ▼                                       ▼
┌──────────────────────── Vercel ─────────────────────────┐
│ sitio estático (Vite + React)                           │
│ /llms.txt  /agents  (páginas para agentes)              │
└───────────────┬─────────────────────────────────────────┘
                │ fetch a la URL pública de la Legion
                ▼
┌──────── URL fija de la Legion (Tailscale Funnel) ───────┐
│ /api/*   ──► gateway Hono  localhost:8787               │
│ /live/*  ──► MediaMTX HLS  localhost:8888               │
│ /mcp     ──► servidor MCP (dentro del gateway)          │
└───────────────┬─────────────────────────────────────────┘
                │ red local (router propio)
                ▼
          ESP32 El Tucu  http://<ip-fija>
          GET /state  POST /dance /joint /stop

 Gateway ──► interfaz PaymentRail (packages/rails/core)
               ├─ celo:  Celo 42220, facilitator x402, Ripio on-ramp
               ├─ twin:  ARGt y demás en Arbitrum, Base, Polygon, Ethereum
               └─ belo:  banca para agentes (stub hasta que haya API)
```

Toda la conexión con chains, tokens y proveedores de pago vive detrás del adaptador de `08-rieles-adaptador.md`. El resto del sistema no sabe que existe Celo.

## Quién habla con quién

| Origen | Destino | Qué | Público |
|---|---|---|---|
| Navegador | Vercel | sitio | sí |
| Navegador | gateway `/api` | catálogo, crear sesión, comandos | sí, con CORS solo para el dominio del sitio |
| Navegador | MediaMTX `/live` | video HLS | sí, solo lectura |
| Agente | gateway `/api` y `/mcp` | x402, sesión, comandos, frame | sí |
| Gateway | ESP32 | `/state`, `/dance`, `/joint`, `/stop` | **no**, solo red local |
| Rieles (dentro del gateway) | RPCs, facilitators, APIs de pago | leer pagos, `verify`/`settle` | saliente |
| ffmpeg | MediaMTX | publica la webcam | local |

## Decisión: ESP32 detrás de la Legion

El ESP32 queda solo en la red local y todo pasa por un gateway en la Lenovo Legion. Motivos:

1. El firmware de El Tucu no tiene auth ni TLS. Expuesto a internet, cualquiera mueve el brazo sin pagar.
2. La cámara ya necesita una compu (MediaMTX + ffmpeg con la webcam).
3. El candado de sesión (solo quien pagó mueve, y hasta que vence) vive en el gateway, así el firmware queda como está.
4. El ESP32 con WiFi directo sirve igual: es la conexión entre ESP32 y Legion dentro del router propio.

Alternativa descartada para la hackathon: ESP32 hablando solo con un servidor en la nube por WebSocket saliente. Evita el túnel pero obliga a reescribir firmware y sigue haciendo falta una compu para la cámara.

## Túnel

Igual que El Tucu (`robot-a/SPEC.md` §4.5):

- Sin dominio: **Tailscale Funnel** en la Legion, URL fija gratis. `[a verificar]` en Windows y que soporte las dos rutas (`/api`, `/live`).
- Con dominio: `cloudflared` como servicio de Windows con túnel con nombre (`api.<dominio>`, `live.<dominio>`). `[INPUT]` dominio.
- Respaldo: ngrok (tiene pantalla de aviso en el navegador y tope de tráfico, por eso queda último).

## Variables de entorno

| Variable | Dónde | Valor |
|---|---|---|
| `VITE_API_URL` | sitio (Vercel) | `https://<url-legion>/api` |
| `VITE_LIVE_URL` | sitio (Vercel) | `https://<url-legion>/live/tucu/index.m3u8` `[a verificar]` ruta de MediaMTX |
| `ESP32_URL` | gateway | `http://<ip-esp32>` o `http://localhost:8080` (mock) |
| `SESSION_SECRET` | gateway | secreto para firmar tokens de sesión, solo en la Legion |
| `RAILS` | gateway | rieles activos, ej. `celo-x402,celo-wallet,ripio` |
| `CELO_PAY_TO`, `CELO_RPC_URL`, `CELO_X402_FACILITATOR_URL` | riel `celo` | wallet del dueño `[INPUT]`, RPC `[INPUT]`, `https://api.x402.celo.org` |
| `TWIN_PAY_TO`, `TWIN_RPC_*` | riel `twin` | solo si se activa |
| `ALLOWED_ORIGIN` | gateway | dominio del sitio en Vercel |
| `PUBLIC_URL` | gateway | URL del túnel (para `llms.txt` y respuestas 402) |

## Qué es secreto

`SESSION_SECRET` y cualquier clave de wallet viven solo en la Legion. El gateway **no necesita clave privada** para cobrar: recibe pagos en `PAY_TO` y el facilitator paga el gas del x402. Nada de esto va a git, Vercel ni chats.

## Monorepo propuesto

```
rent-a-shell/
  apps/
    web/        sitio (Vite + React 18), deploy en Vercel
    gateway/    Hono en Node 22: sesiones, pagos, proxy, MCP
    buyer/      agente comprador de ejemplo para la demo (@x402/fetch)
  packages/
    shell-spec/ tipos compartidos: ficha del shell, comandos, sesión
    rails/      core (interfaz), celo, twin, belo (08-rieles-adaptador.md)
  docs/
```

El sitio no lleva chain IDs ni addresses: arma el checkout y wagmi con `GET /api/rails`.

El mock y el firmware **no se copian**: se usan desde `robot-a/apps/mock` y `robot-a/apps/firmware`.
