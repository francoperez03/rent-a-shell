# Handoff · Rent a Shell (2026-10-12, end of session)

Paste this into a new Claude Code session opened at `~/repos/job/stables/rent-a-shell`.

---

Continuá el trabajo en Rent a Shell (repo público: https://github.com/francoperez03/rent-a-shell, rama `main`, todo commiteado y pusheado). Leé primero `README.md`, `PRODUCT.md`, `DESIGN.md`, `docs/plans/PLAN.md` y `docs/forgers.md`. Reglas de Franco: respondé en español rioplatense; nunca la construcción "no es X, es Y"; en español sin guiones largos ni cortos para incisos; commits sin co-author; secretos solo en `.env.local` (nunca en git ni en el chat).

## Qué es

Hardware real alquilado por minutos para equipos chicos que construyen con IA y para sus agentes. Pago en USDC sobre Solana: x402 para agentes, Solana Pay con escrow (programa Anchor `shell_escrow`, 90% al Forger, 10% a la plataforma, reembolso si el robot se cae) para personas. Los Forgers publican robots corriendo un gateway al lado del hardware; un hub arma el catálogo. Precio actual: **un centavo por minuto** (`BLOCK_USD=0.05`, bloques de 5 min). Submission a Colosseum (texto en `docs/colosseum.md`; el formulario en colosseum.com está cargado hasta "Project details", faltan Telegram, "Media and code" y "Team").

## Estado en la Mac de Franco (ahora mismo)

- `pnpm forger` corre y levanta MediaMTX, la cámara, el gateway y el registro en el hub. Config en `apps/gateway/.env.local` (no está en git): `ESP32_URL=http://192.168.1.15` (El Tucu real, responde), `CAMERA=0` (cámara de la MacBook; la del iPhone es `3`), `RAILS=fake`, `TUNNEL=none`, `BLOCK_USD=0.05`.
- El sitio corre en `pnpm web` (localhost:5175) y el gateway en 8787. `pnpm forger:doctor` da todo verde salvo avisos.
- El rediseño "instrumento de laboratorio" está terminado y probado (paper + ink + naranja señal, Archivo + Martian Mono); capturas en `evidence/f4/`.

## Lo que quedó a medias (en orden)

1. **HLS en vivo roto en el sitio.** La foto (`/api/shells/el-tucu/frame`) funciona; el stream continuo no. Causa: esta versión de MediaMTX responde `GET /el-tucu/index.m3u8` con un 302 a `?cookieCheck=1` y, sin la cookie, 500; el proxy del gateway (`apps/gateway/src/app.ts`, ruta `/live/*`) hace `fetch` y termina en 502. Arreglo: en el proxy, hacer el fetch con `redirect: "manual"`, y si viene 302 con `set-cookie`, repetir el pedido a `Location` con esa `Cookie`; o configurar MediaMTX para no exigirla. Verificar con `curl -s localhost:8787/live/el-tucu/index.m3u8` → 200 con `#EXTM3U`, y después en Brave (`/shells/el-tucu`) con Claude in Chrome.
2. **Túnel público.** `TUNNEL=cloudflared` en `.env.local` y reiniciar `pnpm forger`; avisar a Franco antes porque expone la Mac. La URL queda en `apps/gateway/data/public-url.txt`.
3. **Wallets y pagos reales (Franco):** `SOLANA_PAY_TO` (Phantom) y `RAILS=solana-x402,solana-pay`; `pnpm --filter buyer keygen` + USDC devnet (faucet.circle.com) + `pnpm buyer`; deploy del escrow a devnet (`programs/`, ver PLAN.md) + `pnpm --filter @ras/rails-solana init-escrow` + `operator-key` con SOL; escanear el QR con Phantom en devnet.
4. **Corriente en mA:** el ESP32 tiene el firmware viejo. El nuevo (INA219, SDA 21 / SCL 22) está commiteado en `~/repos/job/eventos/bnb-builder-session/agentes/robot-a` (`apps/firmware`); hay que soldar el sensor y flashear.
5. **Colosseum:** completar Telegram, "Media and code" (repo + video) y "Team"; actualizar "Notes for judges" con el precio de un centavo por minuto y el estado real. Cierre: 12/10 23:59 PDT.
6. **Pendientes menores:** pase de `impeccable polish` por control (hover/focus/errores); captura nueva del hero en el README (`evidence/f4/landing.png` ya existe); skills apuntan al hub como `<HUB_URL>` (TBD).

## Comandos útiles

`pnpm test` (todo), `pnpm --filter web build`, `pnpm forger`, `pnpm forger:doctor`, `pnpm forger:cameras`, `pnpm forger:find-esp32`, `pnpm mock` (robot simulado en 8080), `pnpm hub`, e2e del escrow: `solana-test-validator --reset --bpf-program 5459LTpropgaL1a7Ct4nRUN6BULGvJs3STMcreh2gf4X programs/target/deploy/shell_escrow.so` + `pnpm --filter @ras/rails-solana e2e` (PATH con `~/.local/share/solana/install/active_release/bin`).
