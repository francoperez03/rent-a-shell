# Plan · Rent a Shell en Solana para Colosseum

Arranque: 2026-10-11. Paso a solo Solana: 2026-10-12 (la versión Celo quedó en `stables/rent-a-shell-celo`, commit `5f83196`). Texto de submission en [`../colosseum.md`](../colosseum.md).

Lo que corre en la Mac lo hace Claude Code. Lo que corre en la Legion, el ESP32 o exige wallets lo hace Franco con los comandos de cada fase; Claude Code prepara, revisa la salida y registra en `evidencia/<fase>/`.

## Estado

| Fase | Qué | Dónde | Estado | Evidencia |
|---|---|---|---|---|
| F0 | Verificaciones en vivo | Mac + Franco | en curso: facilitator x402.org soporta `exact` en devnet, mint USDC devnet existe, PayAI soporta mainnet (2026-10-12); faltan key de PayAI y Funnel | `docs/specs/04-pagos.md` |
| F1 | Gateway contra el mock | Mac | hecha: 6 tests (allowlist, cola, corte a HOME, rate limit, x402, MCP), aislamiento ok | `apps/gateway/src/app.test.ts` |
| F2 | Pago de agente por x402 | Mac + wallet | código hecho; 402 real en devnet y buyer probado hasta la simulación del facilitator (`invalid_exact_svm_transaction_simulation_failed` con wallet vacía); falta wallet con USDC devnet | `apps/buyer` |
| F3 | Pago de persona por Solana Pay | Mac + Phantom | código hecho; intent con link `solana:` y QR verificados; falta un pago real escaneando | `packages/rails/solana/src/pay.ts` |
| F4 | Sitio: landing, checkout, consola | Mac | hecha: checkout con QR, `/agents` con ejemplo SVM, build en verde | `evidencia/f4/` |
| F5 | Legion + El Tucu real + cámara + túnel | Legion + ESP32 | por hacer | `evidencia/f5/` |
| F6 | MCP, `llms.txt`, agent card | Mac + Legion | código hecho; falta probarlo con una sesión nueva de Claude Code contra devnet | `apps/gateway/src/{mcp,discovery}.ts` |
| F7 | Ensayo de demo, video y submission | todo | por hacer | `evidencia/f7/` |

Camino crítico: F2 (pago real devnet) → F5 → F7.

## Pendientes de verificar

| # | Qué | Cómo | Bloquea |
|---|---|---|---|
| 1 | Si PayAI pide key o créditos para `settle` en mainnet | un pago de USD 0,01 en mainnet | mainnet |
| 2 | Tailscale Funnel en Windows con dos rutas | en la Legion | F5 |
| 3 | Ruta exacta de HLS en MediaMTX | `robot-a/SPEC.md` §4.3 | F5 |
| 4 | Que Phantom y Solflare en devnet resuelvan el transfer request con `spl-token` | escanear el QR del checkout | F3 |

## F2 · Pago de agente por x402

`packages/rails/solana` con `solana-x402` y `apps/buyer` pagando con `@x402/fetch` + `@x402/svm`.

**Verificación:** `apps/buyer` paga 1 bloque en devnet, recibe token, mueve el mock y termina en HOME. Tx en Solscan anotada en `evidencia/f2/tx.md`.

## F3 · Pago de persona

`solana-pay` en `packages/rails/solana`: intent con `reference`, `check()` por `getSignaturesForAddress`.

**Verificación:** escanear el QR con Phantom en devnet, pagar 1 USDC, intent `paid` en menos de 30 s y la consola se abre sola. Evidencia en `evidencia/f3/`.

## F5 · Legion + El Tucu real

Pasos (Franco, en la Legion):
1. Clonar `rent-a-shell` en `C:\shell\rent-a-shell`, Node 22, pnpm.
2. MediaMTX + ffmpeg `dshow` publicando la webcam.
3. ESP32 con El Tucu en el router propio; `curl http://<ip>/state`.
4. Gateway con `ESP32_URL=http://<ip>` y procesos en pm2.
5. Tailscale Funnel; `curl https://<url-legion>/api/shells` desde la Mac.
6. Sitio en Vercel con `VITE_API_URL` y `VITE_LIVE_URL`.

**Verificación:** desde un celular con datos móviles (fuera de la red), pagar 1 bloque con el QR y mover el brazo viéndolo por la cámara. Video de la pantalla en `evidencia/f5/` (fuera de git).

## F6 · Agentes

`/mcp` en el gateway, `/llms.txt`, agent card en `/.well-known/agent.json`.

**Verificación:** una sesión nueva de Claude Code, sin ayuda, lee `llms.txt`, paga por x402 en devnet y corre la rutina de prueba del caso de demo (`05-agentes.md`). Transcript en `evidencia/f6/`.

## F7 · Ensayo, video y submission

- Ensayo completo del guion de 90 s tres veces seguidas; anotar cuántas sesiones aguanta el SG90 sin calentar.
- Video de la demo: agente paga por x402, mueve El Tucu, reporte con la tx en Solscan; persona paga con el QR.
- Submission en Colosseum con `docs/colosseum.md`.

## Pendientes de Franco

- [INPUT] Precio por bloque y duración del bloque.
- [INPUT] Wallet `SOLANA_PAY_TO` del dueño.
- [INPUT] Dominio (si se usa `cloudflared` con nombre).
- [INPUT] Copy del hero de cada puerta.

## Pasos de Franco para cerrar Solana (2026-10-12)

Todo en `apps/gateway/.env.local` (copiar de `.env.example`).

1. **Wallet del dueño**: crear o usar una cuenta de Phantom y poner su address en `SOLANA_PAY_TO`. Solo recibe, la clave no va al gateway.
2. **Preflight**: `pnpm check-solana` (devnet) y `SOLANA_NETWORK=mainnet pnpm check-solana`.
3. **Wallet del agente**: `pnpm --filter buyer keygen`. Fondear la address con USDC devnet en https://faucet.circle.com (red Solana Devnet) y, por si hace falta, SOL devnet en https://faucet.solana.com. Pegar `BUYER_SOLANA_KEY=...` en `apps/buyer/.env.local`.
4. **Pago de agente en devnet**: `pnpm mock` en una terminal, `pnpm gateway` en otra, `pnpm buyer` en otra. Tiene que imprimir la tx y 6 pasos medidos.
5. **Pago de persona en devnet**: `pnpm web`, comprar 1 bloque con "Solana Pay", poner Phantom en devnet y escanear el QR.
6. **Mainnet**: `SOLANA_NETWORK=mainnet BLOCK_USD=0.01` y repetir 4 y 5 con USDC real. Si el facilitator de PayAI rechaza el settle por falta de key, sacarla en PayAI y ponerla en `X402_API_KEY`.
