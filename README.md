# Rent a Shell

Plataforma donde **agentes de IA alquilan cuerpos robóticos** para actuar en el mundo físico.

Hackathon: **Agents on Open Rails** (Celo × Ripio) · https://loops.house/agents-on-open-rails
Track objetivo: **Build with buy** (agentes que pagan solos por servicios vía x402).
Track secundario posible: **Stable Agents: LATAM** (si el pago se hace en wFiat locales).

## Idea

Un agente vive en software. Cuando necesita hacer algo en el mundo físico, alquila un "shell": un cuerpo robótico disponible en la plataforma. Lo paga solo, lo programa con lo que necesita hacer, lo usa por el tiempo pagado y lo devuelve.

- **Shells**: robots publicados por sus dueños (brazo, rover, dron, cámara móvil, etc.) con sus capacidades descritas en un formato que un agente pueda leer.
- **Agentes**: buscan un shell que cumpla lo que necesitan, pagan por tiempo de uso y le mandan instrucciones o un programa.
- **Dueños**: cobran por cada sesión sin intervenir.

## Flujo

1. El agente recibe una tarea que requiere un cuerpo físico.
2. Consulta el catálogo de shells y elige uno por capacidad, ubicación y precio.
3. Paga de forma autónoma con x402 (stablecoin en Celo).
4. La plataforma verifica el pago y **le asigna el shell** por la ventana de tiempo pagada.
5. El agente programa el shell (comandos o código) y recibe feedback: cámara, sensores, estado.
6. Al vencer el tiempo se libera el shell y el pago se liquida al dueño.

## Casos de uso (abierto)

Todavía sin definir. Ideas para explorar:

- Inspección remota: el agente mira algo en un lugar físico y reporta.
- Tareas de laboratorio: mover, medir, apretar un botón.
- Testing de software de robótica: el agente prueba su propio código en hardware real.
- Recados físicos simples dentro de un espacio controlado.

## Piezas técnicas (borrador)

| Pieza | Rol |
|---|---|
| Catálogo | Lista de shells con capacidades, precio por tiempo y estado (libre/ocupado) |
| Endpoint x402 | El agente paga y recibe el acceso en la misma request |
| Contrato / escrow | Registra el pago, define la ventana de uso, libera fondos al dueño |
| Runtime del shell | Corre en el robot: valida la sesión, ejecuta comandos, expone cámara y sensores |
| SDK / MCP para agentes | Interfaz para que cualquier agente descubra, alquile y controle un shell |

## Relación con el Proyecto A

Comparten la misma base (hardware publicado por terceros, pago por tiempo, acceso que se abre y cierra). En el A el que alquila es una persona que paga en fiat local; en Rent a Shell el que alquila es un agente que paga solo.

## Recursos

- buy (marketplace x402 de Celo): ver página de la hackathon.
- wFiat en Celo (18 decimales):
  - wARS `0x0dc4f92879b7670e5f4e4e6e3c801d229129d90d`
  - wBRL `0xd76f5faf6888e24d9f04bf92a0c8b921fe4390e0`
  - wMXN `0x337e7456b420bd3481e7fa61fa9850343d610d34`
  - wCOP `0x8a1d45e102e886510e891d2ec656a708991e2d76`
  - wPEN `0x4F34c8b3b5FB6D98Da888F0feA543d4d9C9F2eBE`
  - wCLP `0x61D450a098b6a7f69fC4b98CE68198fe59768651`
- Telegram de la hackathon: https://t.me/realworldagentshackathon
- Referencia previa: `paybot` (`github.com/superposition/paybot`), pago x402 para controlar un robot con webcam.

## Docs

Specs y plan de la versión de hackathon en [`docs/`](docs/README.md). Robot: El Tucu (brazo de las BNB Builder Sessions, sin cambios de firmware) detrás de un gateway en la Legion; el ESP32 queda solo en la red local. Pagos detrás de un adaptador (`docs/specs/08-rieles-adaptador.md`): Celo primero, Twin y belo intercambiables.
