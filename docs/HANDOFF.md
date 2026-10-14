# Handoff · Rent a Shell (2026-10-14, fin de sesión)

Pegá esto en una sesión nueva de Claude Code abierta en `~/repos/job/stables/rent-a-shell`.

---

Continuá el trabajo en Rent a Shell (repo público: https://github.com/francoperez03/rent-a-shell). Leé primero `README.md`, `docs/plans/PLAN.md` (sección "After the review") y los specs `docs/specs/10` a `15`. Reglas de Franco: respondé en español rioplatense; nunca la construcción "no es X, es Y"; en español sin guiones largos ni cortos para incisos; commits sin co-author; secretos solo en `.env.local`.

## Dónde estamos

- **Entrega a Colosseum**: tag `colosseum-submission` (`e8a5989`), pusheado.
- **`main`**: solo un commit después del tag, `2898f7d`, que arregla el 404 de `/llms.txt`, `/.well-known/agent.json` y `/skills/rent/SKILL.md` en el sitio (había un `vite.config.js` viejo commiteado que tapaba al `.ts`). Está pusheado y desplegado: los tres responden 200 en https://rent-a-shell.vercel.app.
- **`post-submission`**: 11 commits locales sobre `main`, **sin pushear** (Franco pidió no pushear hasta que termine el juzgamiento). Es la respuesta a la devolución de Superteam Argentina del 13/10 (56/100, objetivo 80; el PDF está en `~/repos/job/Crisol/v1-2026-10-13.pdf`).

## Qué hay en `post-submission`

| Fase | Spec | Qué | Commits |
|---|---|---|---|
| F13 | `10-escrow-guard.md` | `check()` exige operador, forger y ventana de `expires_at`; `init_config` solo por `ADMIN` (la wallet local `GUBSs…PN3JP`); `[programs.devnet]` | `38b12ca` |
| F14 | `11-claims.md` | README con "What is real today vs roadmap", program id, firmas de deposit y settle, diagrama de dos ramas, link al firmware; frases corregidas en Colosseum, PRODUCT, sitio y skills | `d5aa154` |
| F15 | `12-terms.md` | `docs/terms.md`, página `/terms`, links en footer, checkout y ficha del shell; `pnpm forger` loguea la URL | `3137c59` |
| F16 | `13-pricing.md` | landing lee el precio del catálogo, tabla por hardware en `costs.md`, fee 10 % en `llms.txt` de gateway y hub, sensores default `angles` | `e8eac06`, `62fc2de` |
| F17 | `14-x402-escrow.md` | `open` y `set_payer` en el programa, paywall por intent (`payTo` = vault, memo = intent), `finalize` compartido, clientes crean el intent primero | `f1270f8` |
| F18 | `15-shell-registry.md` | `ShellRecord` PDA con contadores, el gateway registra al arrancar, reputación en `llms.txt`, agent card, MCP y hub | `9ebb6f5` |
| · | plan y cierre | filas del PLAN, párrafos "Verified", isolation check verde, dos pasos de x402 en `05-agents.md` | `ea599fa`, `77a321b`, `f668937` |

Tests al cierre: `anchor test` 12/12, rails 8/8, gateway 10/10, hub 3/3, e2e del escrow en validador local (settle 90/10, refund, depósito ajeno ignorado, x402 vía escrow, registro), root `pnpm test` verde, build del sitio verde.

## Lo que sigue, en orden

1. **Pushear `post-submission`** cuando Franco lo diga, y mergear a `main` después del juzgamiento.
2. **Redeploy del programa a devnet** antes de cualquier prueba en vivo: la cuenta `Escrow` ganó `rent_to` y `shell` y el estado `Opened`; hay instrucciones nuevas (`open`, `set_payer`, `register_shell`). Los escrows viejos de devnet no deserializan con el IDL nuevo. Pasos: `cd programs && npm run build`, `anchor deploy --provider.cluster devnet`, copiar el IDL a `packages/rails/solana/src/idl/`, `pnpm --filter @ras/rails-solana register-shell`.
3. **Pago x402 real** con el facilitator (`pnpm buyer` con USDC de devnet) y el refund en Solscan.
4. **Hueco conocido**: un escrow `Opened` que nunca se paga retiene ~0.0035 SOL del operador sin forma de cerrarlo; `POST /api/sessions/intent` con `rail: solana-x402` puede drenar el SOL del operador. Hace falta `close_opened` + limpieza al vencer el intent, o rate limit. Va antes de exponer un gateway con operador.
5. **Túnel del gateway**: el `llms.txt` publicado apunta a `eat-poll-clients-gates.trycloudflare.com` y no responde. Levantar `pnpm forger` con `TUNNEL=cloudflared`; si la URL cambia, actualizar `VITE_API_URL` en Vercel y redeployar.
6. **HLS en vivo** sigue roto (redirect `cookieCheck` de MediaMTX en el proxy `/live/*`). Va antes de regrabar la demo.
7. **Fuera del repo** (Franco): pitch de 2:00 con la estructura del informe, demo con Solscan y vuelta a HOME, formulario del capítulo, primer Forger externo, mainnet con Squads (runbook en el spec 15).

## Toolchain en esta Mac

- Anchor 0.32.1 en `/opt/homebrew/bin/anchor`; Solana 3.0.13 en `~/.local/share/solana/install/active_release/bin`.
- `cargo-build-sbf` se rompe con su propio `rustup toolchain list -v`: correr `rustup toolchain uninstall 1.89.0-sbpf-solana-v1.52` justo antes de `npm run build` en `programs/`.
- `anchor test` necesita `rm -rf programs/.anchor/test-ledger` y `COPYFILE_DISABLE=1` cuando macOS deja `._genesis.bin`.
- Gamma de Polymarket no aplica acá; Vercel del sitio: proyecto `rent-a-shell`, `VITE_API_URL` cargada en Production y Preview.

## Comandos útiles

`pnpm test` (todo), `pnpm --filter web build`, `cd programs && npm test`, `pnpm --filter @ras/rails-solana e2e` (con `solana-test-validator --reset --bpf-program 5459LTpropgaL1a7Ct4nRUN6BULGvJs3STMcreh2gf4X programs/target/deploy/shell_escrow.so` corriendo), `pnpm forger`, `pnpm forger:doctor`, `pnpm mock`, `pnpm hub`.
