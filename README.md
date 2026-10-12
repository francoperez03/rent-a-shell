# Rent a Shell

Hardware real, alquilado por minutos, para que equipos chicos construyan soluciones físicas sin comprar ni instalar el hardware. Lo usan desarrolladores y sus agentes de IA, y se paga en USDC sobre Solana.

## Tesis

Con la IA, un equipo chico ya puede construir soluciones que involucran hardware: el agente escribe el firmware, el control y la integración. Lo que falta es el acceso. Un equipo bootstrapped, o uno sin perfiles que sepan instalar y mantener equipos, solo tiene simuladores, y el simulador no muestra el servo que llega dos grados corto ni el sensor que lee con ruido.

Rent a Shell pone hardware real a un request de distancia. El desarrollador (o su agente) alquila un shell por bloques de cinco minutos, prueba su código contra el mundo físico, mide y sigue iterando. El resultado es menos tiempo de desarrollo y menos plata gastada en equipos que se usan unas horas. Del otro lado, quien ya tiene el hardware cobra por el tiempo que antes estaba ocioso.

Objetivo: submission a **Colosseum** (texto en [`docs/colosseum.md`](docs/colosseum.md)).

## Idea

Un agente vive en software. Cuando necesita hacer algo en el mundo físico, alquila un "shell": un cuerpo robótico disponible en la plataforma. Lo paga solo, lo programa con lo que necesita hacer, lo usa por el tiempo pagado y lo devuelve.

- **Shells**: robots publicados por sus dueños (brazo, rover, dron, cámara móvil, etc.) con sus capacidades descritas en un formato que un agente pueda leer.
- **Agentes**: buscan un shell que cumpla lo que necesitan, pagan por tiempo de uso y le mandan instrucciones o un programa.
- **Personas**: también pueden alquilar, pagando con un QR de Solana Pay.
- **Forgers**: arman, publican y mantienen los shells del catálogo. Cobran por minuto de uso directo en su wallet y pueden ofrecer personalizaciones. Costos de tenerlo propio contra alquilarlo en [`docs/costos.md`](docs/costos.md).

## Flujo

1. El agente recibe una tarea que requiere un cuerpo físico.
2. Lee `llms.txt` o el MCP del gateway y elige un shell por capacidad, ubicación y precio.
3. Paga de forma autónoma con x402 (USDC en Solana; el facilitator paga el fee, el agente no necesita SOL).
4. El gateway liquida el pago y **le asigna el shell** por la ventana de tiempo pagada.
5. El agente programa el shell (comandos) y recibe feedback: cámara, estado, ángulos medidos.
6. Al vencer el tiempo el robot vuelve a HOME y se libera. El pago llega directo a la wallet del dueño.

## Caso de demo

Testing de software de robótica: el agente prueba su propio código en hardware real. Paga un bloque, corre una secuencia de movimientos, mide si cada articulación llegó a la posición pedida y devuelve un reporte con la tx (`apps/buyer`).

## Piezas

| Pieza | Dónde |
|---|---|
| Gateway del Forger (sesiones, cola, corte a HOME, MCP, `llms.txt`, pedidos de personalización) | `apps/gateway` |
| Hub del marketplace (catálogo de Forgers, salud, `llms.txt`, MCP) | `apps/hub` |
| Rieles de pago Solana (`solana-x402`, `solana-pay` con escrow) | `packages/rails/solana` |
| Programa de escrow (Anchor, 90/10 y reembolso) | `programs/programs/shell-escrow` |
| Sitio (landing, checkout con QR, consola, guía de agentes) | `apps/web` |
| Agente comprador de ejemplo | `apps/buyer` |
| Robot: El Tucu (ESP32, 4 servos) | `~/repos/job/eventos/bnb-builder-session/agentes/robot-a` |

## Correr

```bash
pnpm install
pnpm check-solana          # facilitator y mint de USDC en devnet
pnpm mock                  # El Tucu simulado (puerto 8080)
pnpm gateway               # puerto 8787, config en apps/gateway/.env.local
pnpm hub                   # puerto 8790, catálogo de Forgers (apps/hub/.env.local)
pnpm web                   # puerto 5175
pnpm --filter buyer keygen # wallet descartable para el agente
pnpm buyer                 # el agente paga y prueba la secuencia
```

## Relación con el Proyecto A

Comparten la misma base (hardware publicado por terceros, pago por tiempo, acceso que se abre y cierra). En el A el que alquila es una persona que practica Physical AI; en Rent a Shell el que alquila es un agente que paga solo.

## Docs

Specs y plan en [`docs/`](docs/README.md). El ESP32 queda solo en la red local, detrás de un gateway en la Legion expuesto por túnel. Los pagos viven detrás de un adaptador (`docs/specs/08-rieles-adaptador.md`).

Referencia previa: `paybot` (`github.com/superposition/paybot`), pago x402 para controlar un robot con webcam.

## Skills de Claude Code

- **`skills/rent-a-shell`** (alquilar): un Claude Code alquila un shell, corre un plan de movimientos, mide ángulos, corriente y fotos, y devuelve un reporte. Paga por x402 con tope de gasto aprobado por la persona. El cliente es `skills/rent-a-shell/rent.mjs`.
- **`skills/rent-a-shell-forger`** (publicar): convierte una compu (Windows primero) en Forger con `pnpm forger`, que levanta cámara, túnel, gateway y registro en el hub, y cierra con `pnpm forger:doctor`.

El hub sirve ambas en `/skills/rent/SKILL.md` y `/skills/forger/SKILL.md`.
