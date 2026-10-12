# 03 · Gateway local (Legion)

Un solo proceso Node 22 con Hono en `localhost:8787`, más MediaMTX y ffmpeg para la cámara. Corre en la Lenovo Legion (Windows nativo), igual que el agente de El Tucu.

## Responsabilidades

1. Publicar el catálogo y el estado de cada shell.
2. Cobrar a través de la interfaz `PaymentRail` (`08-rieles-adaptador.md`) y emitir un token de sesión. El gateway no importa nada de Celo ni de ninguna chain.
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
| POST | `/api/sessions/intent` | | `{shell, blocks, rail, asset?}`: el riel devuelve un `Intent` con sus instrucciones (transfer, redirect, approval) |
| GET | `/api/sessions/intent/:id` | | llama `check()` del riel; estado `pending`, `paid` o `expired`; con `paid` trae el token |
| POST | `/api/cmd` | Bearer token | `{cmd, args}` de la allowlist, proxy al ESP32 |
| POST | `/api/sessions/end` | Bearer token | cierra antes de tiempo (sin reembolso parcial en v1) |
| GET | `/api/events` | | SSE con `state`, `session_started`, `session_ended`, `payment_seen` para el HUD |
| POST | `/mcp` | | servidor MCP (Streamable HTTP) |

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
| ESP32 | pill `offline`, consola deshabilitada | pausa el reloj de la sesión activa y reintenta `/state` cada 5 s; si no vuelve en 2 min, marca la sesión para reembolso (`04-pagos.md`) |
| Cámara | "Sin video" sobre el último frame | sigue aceptando comandos; el HUD muestra ángulos desde `/state` |
| Túnel | el sitio muestra "El Tucu está desconectado" y reintenta cada 10 s (patrón `Camera.tsx` de El Tucu) | nada que hacer del lado del gateway |
| Gateway | lo mismo que el túnel | pm2 lo reinicia; las sesiones en memoria se pierden `[a verificar]` |

## Código que se reutiliza

- Proxy y manejo de 409: `robot-a/apps/agent/app/agent/src/tucu.ts` (`dance`, consulta a `/state`).
- Watcher de pagos y x402: `~/repos/robotics/pagos-placa/spike.mjs`, dentro de `packages/rails/celo`.
- Middleware 402 de referencia (sin su esquema propio): `paybot/packages/x402/src/middleware.ts`. El 402 lo arma el gateway con el `requirement` que devuelve el riel.
