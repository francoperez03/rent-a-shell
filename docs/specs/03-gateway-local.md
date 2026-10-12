# 03 · Gateway local (Legion)

Un solo proceso Node 22 con Hono en `localhost:8787`, más MediaMTX y ffmpeg para la cámara. Corre en la Lenovo Legion (Windows nativo), igual que el agente de El Tucu.

## Responsabilidades

1. Publicar el catálogo y el estado de cada shell.
2. Cobrar a través de la interfaz `PaymentRail` (`08-rieles-adaptador.md`) y emitir un token de sesión. El gateway no importa nada de Solana ni de ninguna red.
3. Hacer de candado: solo el token vigente puede mover el robot.
4. Pasar comandos al ESP32 por una allowlist.
5. Cortar la sesión al vencer y dejar el robot en HOME.
6. Servir el MCP para agentes (`05-agentes.md`).

## API

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| GET | `/api/shells` | | lista de fichas (`02-robot.md`) con `status` en vivo |
| GET | `/api/shells/:id/state` | | proxy a `GET /state`, cache de 500 ms |
| GET | `/api/shells/:id/frame` | | último frame JPEG de la cámara (para agentes sin HLS) |
| GET | `/api/shells/:id/queue` | | sesión activa (vence a las…) y cola |
| GET | `/api/rails` | | manifiestos de los rieles activos (`08-rieles-adaptador.md`) |
| POST | `/api/sessions/x402` | x402 | agente paga y recibe token en la misma respuesta; usa el primer riel con `settle()` o `?rail=` |
| POST | `/api/sessions/intent` | | `{shell, blocks, rail, asset?}`: el riel devuelve un `Intent` con sus instrucciones (solana-pay, approval) |
| GET | `/api/sessions/intent/:id` | | llama `check()` del riel; estado `pending`, `paid` o `expired`; con `paid` trae el token |
| POST | `/api/cmd` | Bearer token | `{cmd, args}` de la allowlist, proxy al ESP32 |
| POST | `/api/sessions/end` | Bearer token | cierra antes de tiempo (sin reembolso parcial en v1) |
| GET | `/api/events` | | SSE con `state`, `session_started`, `session_ended`, `payment_seen` para el HUD |
| POST | `/mcp` | | servidor MCP (Streamable HTTP) |
| POST | `/api/shells/:id/requests` | | pedido de personalización al Forger `{contact, message}`: 1 a 200 y 10 a 2000 caracteres, cuerpo de 4 KB como máximo (413), 5 por IP cada 10 min (429). Se guarda en `DATA_FILE` |
| GET | `/api/forger/requests` | Bearer `FORGER_TOKEN` | lista de pedidos para el Forger; sin token 401 |
| * | `/api/rails/:id/*` | | rutas propias de cada riel (`fetch` en `08-rieles-adaptador.md`); hoy el transaction request de Solana Pay |

## Token de sesión

- JWT HS256 firmado con `SESSION_SECRET`: `{sid, shell, payer, rail, tx, exp}`.
- `exp` = inicio + minutos pagados. El inicio es cuando el shell queda libre (si hay cola, el token se emite igual con `nbf` futuro).
- Una sola sesión activa por shell. La cola es FIFO en memoria. `[a verificar]` si hace falta persistir en un JSON para sobrevivir a un reinicio.
- El token se guarda en el navegador (sessionStorage) o lo guarda el agente.

## Reglas de `/api/cmd`

- Rechaza con `401` sin token, `403` si el token es de otro shell o venció, `409` si el ESP32 responde 409.
- Rate limit: 10 comandos por segundo por sesión; los `joint` seguidos se coalescen (gana el último).
- `stop` nunca se rate-limita.
- Timeout de 2 s hacia el ESP32. Tres fallas seguidas pasan el shell a `offline`.

## Corte al vencer

Un timer por sesión. Al vencer: `POST /stop`, `joint` a HOME en cada articulación, evento `session_ended`, se arranca la siguiente de la cola tras 60 s de descanso.

## Cierre del pago (`finalizeEnded`)

En cada tick, para cada sesión terminada con pago y sin `finalized`:
- terminó por vencimiento o por `POST /api/sessions/end`: `finalize(payment, "completed")`;
- terminó por robot caído (`ended: "offline"`): `finalize(payment, "refund")`.

Los rieles sin `finalize` (x402, fake) quedan marcados al instante. Si `finalize` falla, se reintenta 30 s después (`finalize_retry_at`); mientras tanto los fondos siguen en escrow y el pagador puede reclamarlos solo pasado el plazo (`04-pagos.md`). La sesión guarda `finalized` y `finalize_tx`.

## Corte por robot caído

Si el robot queda offline (3 fallos seguidos) con una sesión activa, el gateway anota `offline_since`. Si no vuelve en `OFFLINE_REFUND_SECONDS` (120 por defecto), corta la sesión con `ended: "offline"` y el cierre del pago la reembolsa. Si vuelve antes, se borra la marca y la sesión sigue.

## Cámara

Mismo esquema que El Tucu (`robot-a/SPEC.md` §4.3):

| Pieza | Valor |
|---|---|
| Servidor | MediaMTX para Windows, único proceso que abre la webcam |
| Captura | ffmpeg con entrada `dshow` publicando a MediaMTX en la ruta `tucu` `[a verificar]` comando exacto |
| Salida | HLS en `localhost:8888`, expuesta como `/live`, CORS para el dominio del sitio |
| Atraso | unos segundos con HLS. WebRTC queda fuera: usa UDP y no pasa por el túnel |
| Frame para agentes | el gateway lee un JPEG por ffmpeg desde el RTSP de MediaMTX cada 1 s y lo cachea |

## Procesos (pm2 en la Legion)

| Nombre | Comando |
|---|---|
| `shell-gateway` | `node apps/gateway/dist/index.js` |
| `shell-camera` | `mediamtx` |
| `shell-capture` | ffmpeg `dshow` → MediaMTX `[a verificar]` |
| `shell-tunnel` | `tailscale funnel` (o `cloudflared`) |

## Fallas

| Qué se cae | Qué ve el usuario | Qué hace el gateway |
|---|---|---|
| ESP32 | pill `offline`, consola deshabilitada | reintenta `/state` en cada tick; si no vuelve en `OFFLINE_REFUND_SECONDS`, corta la sesión y la reembolsa por el riel (`04-pagos.md`) |
| Cámara | "Sin video" sobre el último frame | sigue aceptando comandos; el HUD muestra ángulos desde `/state` |
| Túnel | el sitio muestra "El Tucu está desconectado" y reintenta cada 10 s (patrón `Camera.tsx` de El Tucu) | nada que hacer del lado del gateway |
| Gateway | lo mismo que el túnel | pm2 lo reinicia; las sesiones en memoria se pierden `[a verificar]` |

## Código que se reutiliza

- Proxy y manejo de 409: `robot-a/apps/agent/app/agent/src/tucu.ts` (`dance`, consulta a `/state`).
- Pagos x402 y Solana Pay: `packages/rails/solana` (`x402.ts`, `pay.ts`).
- Middleware 402 de referencia (sin su esquema propio): `paybot/packages/x402/src/middleware.ts`. El 402 lo arma el gateway con el `requirement` que devuelve el riel.
