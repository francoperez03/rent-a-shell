# Handoff · Rent a Shell (2026-10-16, fin de sesión)

Pegá esto en una sesión nueva de Claude Code abierta en `~/repos/job/stables/rent-a-shell`.

---

Continuá el trabajo en Rent a Shell (repo público: https://github.com/francoperez03/rent-a-shell). Leé primero `README.md`, `docs/specs/09-hub.md`, `docs/specs/03-gateway-local.md` y `docs/forgers.md`. Reglas de Franco: respondé en español rioplatense; nunca la construcción "no es X, es Y"; en español sin guiones largos ni cortos para incisos; commits sin co-author; secretos solo en `.env.local`. Flujo de trabajo: commit en `develop`, PR a `main`, merge (Vercel despliega solo desde `main`).

## Dónde estamos

- **Sitio y hub en un solo Next.js** (`apps/web`, Next 16, React 19) en producción: https://rent-a-shell.vercel.app. El hub vive en `apps/web/src/server/hub.ts`; registro de Forgers en Upstash Redis (recurso `upstash-kv-coquelicot-flask`, vars `KV_REST_API_*`). `apps/hub` ya no existe. `main` está al día (último merge PR #21).
- **Registro de Forgers con token**: `POST /api/forgers` exige `Authorization: Bearer rsf_…`; los tokens los emite el admin con `POST /api/forgers/tokens {label}` usando `HUB_ADMIN_TOKEN` (está en Vercel y en `apps/web/.env.local`). Un id de shell pertenece a su token (sin secuestro), 3 gateways por token, solo https público en producción. El token de Franco está en `apps/gateway/.env.local` como `HUB_TOKEN`.
- **Ficha estándar**: `apps/gateway/shell.json` + `shell.jpg` (gitignorados; `shell.example.json` es El Tucu). El gateway la valida con zod, sirve la foto en `/api/shells/:id/image` y la publica como `image`. `pnpm forger:spec` valida e imprime la ficha; `forger:doctor` la chequea. El skill de Forgers (`skills/rent-a-shell-forger/SKILL.md`, sección 4) guía la carga campo por campo.
- **Páginas**: `/shells` (rueda: shell central con foto, laterales "Coming soon · Become a Forger"), landing con pasos animados, dos caminos (persona / agente) con comando, frase de wallet y frase de alquiler copiables, cierre en oscuro. Copy auditado y honesto: devnet (plata de prueba), escrow marcado como "coming", "drive it from your code".
- **El Tucu** corre con `pnpm forger` en la Mac (túnel cloudflared, cámara 0) y se registra solo; figura **offline** mientras el ESP32 (`192.168.1.15`) no responda. Log en `/tmp/forger.log`.
- **Video para "You can just build things" (OpenAI)**: `~/Movies/CapCut/el_tucu_codex_subs.mp4` tiene subtítulos (Bricolage, PNG overlays en `~/Movies/CapCut/subs/`) y 4 SFX (swoosh 0:08, monedas 0:21, ding 0:24, swoosh 0:38) hechos con ffmpeg (sin libass). Franco quiere corregir cosas en el timeline de Tesseract: armar el proyecto con `tesseract-taste` en `~/Movies/CapCut` y abrir `run.sh sfx`. Copy y tiempos del guion están en el chat anterior y en el `.ass` (`~/Movies/CapCut/el_tucu_codex.ass`). Borrador del formulario de envío (título, descripción, how it built, parts) también en el chat anterior; falta el link al post público y la foto (`apps/web/public/shells/el-tucu.jpg`).

## Lo que sigue, en orden

1. **Timeline del video** (ver arriba) y publicar el post en X con el video; completar el formulario de OpenAI.
2. **Redeploy del programa de escrow a devnet**: el programa en devnet es una build vieja; el gateway loguea `InstructionFallbackNotFound` al registrar el shell on-chain, y refunds/settle no están vivos. Pasos: `cd programs && npm run build`, `anchor deploy --provider.cluster devnet`, copiar el IDL a `packages/rails/solana/src/idl/`, `pnpm --filter @ras/rails-solana register-shell`. Después volver el copy de escrow a presente (landing paso Pay, PayModal, PayStep, consola, `hub.ts` llms, banda Forgers "on settle") y corregir el `llms.txt` del gateway y las descripciones de rails.
3. **Hueco conocido**: un escrow `Opened` que nunca se paga retiene ~0.0035 SOL del operador; `POST /api/sessions/intent` puede drenarlo. Hace falta `close_opened` o rate limit antes de exponer el gateway con operador en mainnet.
4. **HLS en vivo** sigue roto (redirect `cookieCheck` de MediaMTX en el proxy `/live/*`); hoy el sitio muestra frames JPEG.
5. **INA219** sin soldar: no hay `current_ma`; el copy ya no lo promete.
6. Dron (forger #2): plan en `docs/dron-partes.md` y `hardware/dron/` (frame FreeCAD), Fase 0 pendiente.

## Toolchain en esta Mac

- Vercel CLI 61 (hay 64 disponible); proyecto `rent-a-shell`, root `apps/web`, preset Next.js.
- Anchor 0.32.1; Solana 3.0.13 en `~/.local/share/solana/install/active_release/bin`; `cargo-build-sbf` requiere `rustup toolchain uninstall 1.89.0-sbpf-solana-v1.52` antes de `npm run build` en `programs/`.
- ffmpeg sin libass (subtítulos como PNG); fuentes Bricolage en `~/.claude/skills/tesseract-taste/fonts/`.

## Comandos útiles

`pnpm test` (todo), `pnpm web` (Next en :5175, `apps/web/.env.local` con `HUB_GATEWAYS=http://localhost:8787`), `pnpm forger`, `pnpm forger:doctor`, `pnpm forger:spec`, `pnpm mock`, `cd programs && npm test`, `pnpm --filter @ras/rails-solana e2e` (con `solana-test-validator --reset --bpf-program 5459LTpropgaL1a7Ct4nRUN6BULGvJs3STMcreh2gf4X programs/target/deploy/shell_escrow.so`).
