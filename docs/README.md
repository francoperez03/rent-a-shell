# Rent a Shell · docs

Specs y planes de la versión para Colosseum: pagos solo en Solana (USDC por x402 para agentes, Solana Pay para personas).

Un robot real (El Tucu) se alquila por bloques de tiempo. Lo puede alquilar una persona desde cualquier país o un agente de IA. Paga, recibe una sesión, mueve el robot y lo ve por cámara en vivo. Al vencer, el robot vuelve a HOME y la sesión se cierra.

## Orden de lectura

| # | Archivo | Qué define |
|---|---|---|
| 1 | [`specs/01-arquitectura.md`](specs/01-arquitectura.md) | Mapa completo, quién habla con quién, decisión ESP32 vs Legion, variables |
| 2 | [`specs/02-robot.md`](specs/02-robot.md) | El Tucu como shell #1: API, límites, comandos de sesión, ficha |
| 3 | [`specs/03-gateway-local.md`](specs/03-gateway-local.md) | Servidor en la Legion: sesiones, proxy al ESP32, cámara, túnel |
| 4 | [`specs/04-pagos.md`](specs/04-pagos.md) | Dos rieles de pago en Solana (x402 y Solana Pay) hacia un mismo token de sesión |
| 5 | [`specs/05-agentes.md`](specs/05-agentes.md) | Cómo un agente descubre, paga y controla: `llms.txt`, MCP, x402 |
| 6 | [`specs/06-sitio.md`](specs/06-sitio.md) | Sitio: páginas, taste, motion, stack |
| 7 | [`specs/07-proyecto-a.md`](specs/07-proyecto-a.md) | El frente "personas que practican Physical AI" sobre el mismo núcleo |
| 8 | [`specs/08-rieles-adaptador.md`](specs/08-rieles-adaptador.md) | Interfaz `PaymentRail` y regla de aislamiento |
| 9 | [`specs/09-hub.md`](specs/09-hub.md) | Hub del marketplace: registro de Forgers, catálogo, `llms.txt` y MCP |
| · | [`forgers.md`](forgers.md) | Cómo un Forger publica su hardware y cobra |
| · | [`costos.md`](costos.md) | Tenerlo propio contra alquilarlo |
| 9 | [`plans/PLAN.md`](plans/PLAN.md) | Fases con verificación, quién corre cada una |

Regla transversal: toda conexión con Solana, mints y facilitators vive en `packages/rails/*`. El gateway y el sitio solo conocen la interfaz.

## Convenciones

- `[INPUT]`: falta un dato o una decisión de Franco.
- `[a verificar]`: hay que probarlo en vivo antes de construir encima. Todos se juntan en la fase F0 del plan.
- Lo que corre en la Mac lo hace Claude Code. Lo que corre en la Legion, el ESP32 o exige wallets lo hace Franco con los comandos exactos del plan.

## Fuentes que se reutilizan

| Pieza | Dónde vive |
|---|---|
| Robot, firmware, mock, cámara, túnel | `~/repos/job/eventos/bnb-builder-session/agentes/robot-a` (`SPEC.md`, `PLAN.md`, `apps/firmware`, `apps/mock`, `apps/web`) |
| UI de sesión con pago | `~/repos/proyectos-lokos/eth-global-ba/paybot/apps/web` |
| Taste y motion | `~/repos/job/Crisol/docs/landing/research`, `~/repos/job/Crisol/packages/motion-kit` |
| Evaluación contra Colosseum | 7/10 Rent a Shell, 6,5/10 Proyecto A; texto de submission en [`colosseum.md`](colosseum.md) |
