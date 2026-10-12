# 05 · Agentes

Cómo un agente descubre un shell, lo paga y lo controla sin ayuda humana.

## Descubrimiento

| Canal | Qué es | Dónde |
|---|---|---|
| `llms.txt` | instrucciones en texto plano: qué es Rent a Shell, ficha de cada shell, cómo pagar por x402, cómo mandar comandos, ejemplo con `curl` y con `@x402/fetch` | sitio `/llms.txt`, generado desde `GET /api/shells`. Patrón: `robot-a/apps/web/src/app/llms.txt/route.ts` |
| MCP | servidor MCP en el gateway | `https://<url-legion>/mcp` |
| Agent card | JSON con servicios (web, MCP, x402, `llms.txt`) y medios de pago activos | `https://<url-legion>/.well-known/agent.json` |

## Tools del MCP

| Tool | Entrada | Salida |
|---|---|---|
| `list_shells` | | fichas con estado y precio |
| `rent_shell` | `{shell, blocks}` | devuelve el requerimiento x402; con el cliente MCP que soporte pago, paga y devuelve `{token, expires_at}` `[a verificar]` soporte de x402 en clientes MCP; si no, el agente paga por HTTP (R1) y pasa el token |
| `send_command` | `{token, cmd, args}` | respuesta del ESP32 (ángulos, `clamped`) |
| `get_frame` | `{shell}` | imagen JPEG del momento |
| `get_state` | `{shell}` | ángulos y si se mueve |
| `end_session` | `{token}` | `{ok}` y robot en HOME |

## Agente comprador de ejemplo (`apps/buyer`)

Script Node para la demo y para probar de punta a punta:

1. Lee `/llms.txt` o llama `list_shells`.
2. Paga 1 bloque por x402 con `@x402/fetch` + `@x402/svm` (wallet de Solana con USDC, sin SOL; clave en `.env.local`, nunca en git).
3. Corre una rutina de prueba: `joint` a una secuencia de ángulos, `get_frame` después de cada paso.
4. Devuelve un reporte: pasos, ángulos pedidos contra ángulos medidos (`/state`), frames, tx del pago.

## Caso de demo

El que más respaldo tuvo en la evaluación contra Colosseum: **un agente prueba su código de robótica en hardware real**.

Guion de 90 segundos:
1. En Claude Code: "probá esta secuencia de movimientos en un brazo real y decime si llega a la posición".
2. El agente lee `llms.txt`, paga 1 USD en USDC por x402 (se ve la tx en Solscan).
3. El brazo se mueve en la cámara del sitio, el HUD muestra "SESIÓN · AGENTE · 04:59".
4. El agente devuelve el reporte con frames.
5. Corte: al vencer, el brazo vuelve a HOME solo.

Casos alternativos: inspección remota con evidencia (frame + tx) y tarea simple pedida por otro agente.

## Seguridad

- El agente solo accede a la allowlist del gateway. No hay forma de subir firmware ni código al ESP32.
- El token vence solo. Un token robado sirve como mucho hasta `exp`.
- `llms.txt` y las respuestas del MCP son datos públicos: no llevan secretos ni IPs locales.
