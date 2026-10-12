# Plan · Rent a Shell para Agents on Open Rails

Fecha de arranque: 2026-10-11. Builder Session en Salta: 17 de octubre. Cierre de la hackathon: 9 de noviembre de 2026 (según `~/repos/robotics/pagos-placa/README.md`, `[a verificar]` en loops.house).

Lo que corre en la Mac lo hace Claude Code. Lo que corre en la Legion, el ESP32 o exige wallets lo hace Franco con los comandos de cada fase; Claude Code prepara, revisa la salida y registra en `evidencia/<fase>/`.

## Estado

| Fase | Qué | Dónde | Estado | Evidencia |
|---|---|---|---|---|
| F0 | Verificaciones en vivo | Mac + Franco | en curso: facilitators Sepolia y mainnet soportan `exact`, USDC con código en las dos, Textile cotiza en vivo (2026-10-11); faltan Ripio por país, buy, Funnel | `evidencia/f0/` |
| F1 | Gateway contra el mock | Mac | hecha: 6 tests (allowlist, cola, corte a HOME, rate limit, x402, MCP), aislamiento ok | `apps/gateway/src/app.test.ts` |
| F2 | Pago de agente por x402 | Mac + wallet | código hecho; probado hasta el facilitator de Sepolia (firma válida, `insufficient_funds` con wallet vacía); falta `X402_API_KEY` y wallet con USDC | `apps/buyer` |
| F3 | Pago de persona: wallet y Ripio | Mac + wallet | código hecho; intents verificados en Sepolia (USDC) y mainnet (wARS y Ripio con cotización Textile); falta un pago real | `packages/rails/celo/src/wallet.ts` |
| F4 | Sitio: landing, checkout, consola | Mac | por hacer | `evidencia/f4/` |
| F5 | Legion + El Tucu real + cámara + túnel | Legion + ESP32 | por hacer | `evidencia/f5/` |
| F6 | MCP, `llms.txt`, buy, ERC-8004 | Mac + Legion | código hecho (MCP, llms.txt, agent card, script de registro, texto de buy); falta registrar y enviar | `apps/gateway/src/{mcp,discovery}.ts`, `docs/buy-listing.md` |
| F7 | Ensayo de demo y respaldos | todo | por hacer | `evidencia/f7/` |

Camino crítico: F0 → F1 → F2 → F5 → F7. F3, F4 y F6 corren en paralelo después de F1.

## F0 · Verificaciones en vivo

Todo lo marcado `[a verificar]` en las specs que bloquea construir.

| # | Qué | Cómo | Bloquea |
|---|---|---|---|
| 1 | Addresses de USDC y USDT en Celo | docs.celo.org + Celoscan | F2, F3 |
| 2 | Facilitator `api.x402.celo.org` acepta `exact` en USDC mainnet | correr `pagar()` de `pagos-placa/spike.mjs` contra un endpoint de prueba con 0,01 USDC | F2 |
| 3 | Paquete servidor x402 compatible con clientes 2.27.0 | `npm view @x402/<paquete>` y su README | F2 |
| 4 | Link de Ripio con `country=AR&token=WARS&chain=42220` y otros países | abrir el link con cada país | F3 |
| 5 | Cómo se lista un servicio en buy | docs de Celo / Telegram de la hackathon | F6 |
| 6 | Requisitos obligatorios (ERC-8004, ERC-8021) | reglas en loops.house | F6 |
| 7 | Tailscale Funnel en Windows con dos rutas | en la Legion | F5 |
| 8 | Ruta exacta de HLS en MediaMTX | `robot-a/SPEC.md` §4.3 ya lo marca pendiente | F4, F5 |
| 9 | Addresses repetidas en la tabla de Twin y si sus tokens soportan EIP-3009 | Twin (Discord) y exploradores | F2b, no bloquea la hackathon |
| 10 | Si belo paga a una address on-chain externa | waitlist de agentic.belo.app | F2b, no bloquea la hackathon |

**Verificación:** `evidencia/f0/hallazgos.md` con cada punto resuelto y su fuente; se actualizan las specs.

## F1 · Gateway contra el mock

Scaffold del monorepo (`apps/gateway`, `packages/shell-spec`, `packages/rails/core`) y la API de `03-gateway-local.md` sin pagos reales: el gateway corre con `RAILS=fake` (el `fakeRail` de `rails/core`, `08-rieles-adaptador.md`).

La interfaz `PaymentRail` se cierra en esta fase, antes de escribir el riel de Celo. Es lo que hace que Twin y belo se puedan cambiar después sin tocar el gateway.

Pasos:
1. `pnpm --filter mock start` en `robot-a` (puerto 8080).
2. Gateway con `ESP32_URL=http://localhost:8080`.
3. Tests: sin token → 401; token vencido → 403; comando fuera de allowlist → 400; dos sesiones → la segunda queda en cola; al vencer el mock termina en HOME.

**Verificación:** `pnpm --filter gateway test` en verde, `curl` de punta a punta guardado en `evidencia/f1/curl.txt`, y el grep de aislamiento (`viem|0x[0-9a-fA-F]{40}|42220|x402` fuera de `packages/rails/`) sin resultados.

## F2b · Rieles Twin y belo (después de la hackathon, o si sobra tiempo)

- `rails/twin`: addresses de Faro (`stables/twin/apps/faro/lib/config/tokens.ts`), watcher por chain. Verificación: `RAILS=twin-wallet`, pagar 1 ARGt en Arbitrum, sesión emitida, sin cambios fuera de `packages/rails/twin`.
- `rails/belo`: stub hasta que belo publique API. Verificación: `RAILS=celo-x402,belo` levanta y el checkout muestra belo como "no disponible".

## F2 · Pago de agente por x402

`packages/rails/celo` con el riel `celo-x402` (facilitator de Celo), y `apps/buyer` pagando con `@x402/fetch`.

Pasos (Franco): fondear la wallet compradora con 2 USDC en Celo `[INPUT]`.

**Verificación:** `apps/buyer` paga 1 bloque, recibe token, mueve el mock y termina en HOME. Tx en Celoscan anotada en `evidencia/f2/tx.md`.

## F3 · Pago de persona

Rieles `celo-wallet` y `ripio` en `packages/rails/celo`: intent, watcher de `Transfer` y `check()`.

**Verificación:**
- Wallet: transferencia de USDC con monto con referencia → intent `paid` en menos de 30 s.
- Ripio: Franco paga ARS 2.100 (mínimo) por el link → wARS llega a `PAY_TO` → intent `paid`. Se anota cuánto tardó y si el monto coincidió con la referencia.
- Evidencia en `evidencia/f3/`.

## F4 · Sitio

`apps/web` con el stack y el taste de `06-sitio.md`, contra el gateway en la Mac y el mock.

Orden: consola de sesión (lo que más importa en la demo) → checkout → landing con motion → `/agents`.

**Verificación:** `pnpm --filter web build` y lint en verde; capturas a 1512×812 y 390 px en `evidencia/f4/`; recorrido completo pagar → controlar → vencer contra el mock; `prefers-reduced-motion` revisado.

## F5 · Legion + El Tucu real

Pasos (Franco, en la Legion):
1. Clonar `rent-a-shell` en `C:\shell\rent-a-shell`, Node 22, pnpm.
2. MediaMTX + ffmpeg `dshow` publicando la webcam (comandos de F0 #8).
3. ESP32 con El Tucu en el router propio; `curl http://<ip>/state`.
4. Gateway con `ESP32_URL=http://<ip>` y procesos en pm2.
5. Tailscale Funnel; `curl https://<url-legion>/api/shells` desde la Mac.
6. Sitio en Vercel con `VITE_API_URL` y `VITE_LIVE_URL`.

**Verificación:** desde un celular con datos móviles (fuera de la red), pagar 1 bloque y mover el brazo viéndolo por la cámara. Video de la pantalla en `evidencia/f5/` (fuera de git).

## F6 · Agentes

`/mcp` en el gateway, `/llms.txt` en el sitio, listado en buy y registro ERC-8004.

**Verificación:** una sesión nueva de Claude Code, sin ayuda, lee `llms.txt`, paga y corre la rutina de prueba del caso de demo (`05-agentes.md`). Transcript en `evidencia/f6/`.

## F7 · Ensayo y respaldos

- Ensayo completo del guion de 90 s tres veces seguidas; anotar cuántas sesiones aguanta el SG90 sin calentar.
- Video de respaldo de la demo completa.
- Wallet compradora fondeada de respaldo y wallet con wARS para mostrar el riel Ripio sin esperar KYC en vivo.
- Pitch: Rent a Shell como entrega, Proyecto A como segunda puerta (`07-proyecto-a.md`), CrowdBrain como validación del espacio.

## Pendientes de Franco

- [INPUT] Precio por bloque y duración del bloque.
- [INPUT] Wallet `PAY_TO` del dueño y wallet compradora de prueba.
- [INPUT] RPC de Celo.
- [INPUT] Dominio (si se usa `cloudflared` con nombre).
- [INPUT] Fuente display del sitio y color del STOP.
- [INPUT] Copy del hero de cada puerta.

## Pasos de Franco para cerrar Celo (2026-10-11)

Todo en `apps/gateway/.env.local` (copiar de `.env.example`).

1. **Wallet del dueño**: poner su address en `CELO_PAY_TO`. Solo recibe, la clave no va al gateway.
2. **API key del facilitator**: entrar a https://x402.celo.org, conectar la wallet, firmar (sin gas) y pegar en `X402_API_KEY`.
3. **Preflight**: `pnpm check-celo` (Sepolia) y `CELO_NETWORK=mainnet pnpm check-celo`.
4. **Wallet compradora de prueba**: `node -e "console.log(require('viem/accounts').generatePrivateKey())"` dentro de `apps/buyer`, fondearla con USDC de Celo Sepolia (faucet de Circle o de Celo) y ponerla en `apps/buyer/.env.local` como `BUYER_PRIVATE_KEY`.
5. **Pago de agente en Sepolia**: `pnpm mock` en una terminal, `pnpm gateway` en otra, `pnpm buyer` en otra. Tiene que imprimir la tx y 6 pasos medidos.
6. **Pago de persona en Sepolia**: `pnpm web`, comprar 1 bloque con "Wallet" desde MetaMask en Celo Sepolia.
7. **Mainnet**: `CELO_NETWORK=mainnet`, repetir 5 con USD 0,01 (`BLOCK_USD=0.01`) y 6 con USDC real. Ripio: elegir "Pesos con Ripio", pagar el mínimo de ARS 2.100.
8. **ERC-8004**: con el gateway en su URL pública, `CELO_OWNER_PK=0x... AGENT_CARD_URL=https://<url>/.well-known/agent.json pnpm --filter @ras/rails-celo register-8004`. Poner el `agentId` que imprime en `CELO_AGENT_ID`.
9. **ERC-8021**: verificar una tx de pago con `verifyTx` de `@celo/attribution-tags` (código por defecto `codeFromRepo("francoperez/rent-a-shell")`, se cambia con `CELO_ATTRIBUTION_CODE` o `CELO_ATTRIBUTION_REPO`). Las transferencias desde el sitio y el registro 8004 ya llevan el sufijo; los pagos x402 los arma el facilitator y no lo llevan.
10. **buy**: enviar el formulario con `docs/buy-listing.md`.
