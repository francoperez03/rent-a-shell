# Rent a Shell

Plataforma donde **agentes de IA alquilan cuerpos robóticos** para actuar en el mundo físico. Pagan solos, en USDC sobre Solana.

Objetivo: submission a **Colosseum** (texto en [`docs/colosseum.md`](docs/colosseum.md)).

## Idea

Un agente vive en software. Cuando necesita hacer algo en el mundo físico, alquila un "shell": un cuerpo robótico disponible en la plataforma. Lo paga solo, lo programa con lo que necesita hacer, lo usa por el tiempo pagado y lo devuelve.

- **Shells**: robots publicados por sus dueños (brazo, rover, dron, cámara móvil, etc.) con sus capacidades descritas en un formato que un agente pueda leer.
- **Agentes**: buscan un shell que cumpla lo que necesitan, pagan por tiempo de uso y le mandan instrucciones o un programa.
- **Personas**: también pueden alquilar, pagando con un QR de Solana Pay.
- **Dueños**: cobran por cada sesión sin intervenir.

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
| Gateway (sesiones, cola, corte a HOME, MCP, `llms.txt`) | `apps/gateway` |
| Rieles de pago Solana (`solana-x402`, `solana-pay`) | `packages/rails/solana` |
| Sitio (landing, checkout con QR, consola, guía de agentes) | `apps/web` |
| Agente comprador de ejemplo | `apps/buyer` |
| Robot: El Tucu (ESP32, 4 servos) | `~/repos/job/eventos/bnb-builder-session/agentes/robot-a` |

## Correr

```bash
pnpm install
pnpm check-solana          # facilitator y mint de USDC en devnet
pnpm mock                  # El Tucu simulado (puerto 8080)
pnpm gateway               # puerto 8787, config en apps/gateway/.env.local
pnpm web                   # puerto 5175
pnpm --filter buyer keygen # wallet descartable para el agente
pnpm buyer                 # el agente paga y prueba la secuencia
```

## Relación con el Proyecto A

Comparten la misma base (hardware publicado por terceros, pago por tiempo, acceso que se abre y cierra). En el A el que alquila es una persona que practica Physical AI; en Rent a Shell el que alquila es un agente que paga solo.

## Docs

Specs y plan en [`docs/`](docs/README.md). El ESP32 queda solo en la red local, detrás de un gateway en la Legion expuesto por túnel. Los pagos viven detrás de un adaptador (`docs/specs/08-rieles-adaptador.md`).

Referencia previa: `paybot` (`github.com/superposition/paybot`), pago x402 para controlar un robot con webcam.
