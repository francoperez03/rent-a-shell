# 08 · Rieles de pago detrás de un adaptador

Regla de diseño: **ningún archivo fuera de `packages/rails/*` importa `@solana/*`, `@x402/*`, mints, redes CAIP-2 ni facilitators.** El gateway y el sitio hablan con una interfaz. Hoy hay una sola implementación (Solana); otro riel se suma con un paquete nuevo y la variable `RAILS`, sin tocar el gateway.

## Dónde vive

```
packages/
  rails/
    core/      interfaz, helpers de montos, registro, fakeRail para tests (sin dependencias de red)
    solana/    solana-x402 (agentes) y solana-pay (personas)
```

`apps/gateway` depende de `rails/core` y de los paquetes que carga por config. `apps/web` no depende de ningún paquete de rieles: lee los manifiestos del gateway.

## Interfaz

```ts
// packages/rails/core/src/index.ts
interface PaymentRail {
  id: string                                          // "solana-x402", "solana-pay", "fake"
  manifest(): RailManifest                            // lo que el sitio necesita para dibujar el checkout
  createIntent?(price: Money, opts: { id: string; asset?: string }): Promise<Intent>
  check?(intent: Intent): Promise<Payment | null>     // rieles asíncronos: el gateway consulta hasta paid o vencido
  paywall?(path, priceFor, description): MiddlewareHandler  // rieles síncronos (x402): cobra antes del handler
  clientExample?(url: string): string                 // snippet para llms.txt y /agents
  fetch?(req: Request): Promise<Response>             // rutas propias, montadas en /api/rails/:id/*
  finalize?(payment: Payment, outcome: "completed" | "refund"): Promise<{ tx?: string } | void>
}

// packages/shell-spec/src/index.ts
type Instructions =
  | { kind: "x402"; url: string }
  | { kind: "solana-pay"; url: string; reference: string; to: string; amount: string; symbol: string }
  | { kind: "approval"; ref: string; note: string }
```

Reglas:
- El precio canónico es USD. Cada riel lo convierte a su asset y lo fija en el intent (15 min).
- Un riel nunca toca sesiones ni el robot. Devuelve `Payment` y el gateway emite el token.
- La referencia del pago y el matcheo on-chain viven dentro del riel.
- El gateway guarda intents y pagos con `rail` como dato: cambiar de riel no rompe el historial.
- `fetch`: el gateway monta las rutas del riel en `/api/rails/:id/*` sin saber qué hacen. Hoy: el transaction request de Solana Pay (`GET`/`POST /api/rails/solana-pay/tx/:intentId`) y su ícono.
- `finalize`: el gateway lo llama al cerrar cada sesión con pago. `completed` libera al Forger (con la comisión), `refund` devuelve al pagador. Tiene que ser idempotente. Los rieles que cobran directo (x402) no lo implementan.

## Registro por configuración

```bash
RAILS=solana-x402,solana-pay   # producción
RAILS=fake                     # desarrollo y tests, sin red
```

Cada riel lee sus propias variables (`SOLANA_*`, `X402_*`).

## API del gateway (independiente del riel)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/rails` | manifiestos de los rieles activos |
| POST | `/api/sessions/intent` | `{shell, blocks, rail, asset?}` → `Intent` |
| GET | `/api/sessions/intent/:id` | llama `check()` del riel; con `paid` devuelve el token |
| POST | `/api/sessions/x402` | monta el `paywall()` del riel x402 activo |

## Sitio

- El checkout llama `GET /api/rails` y dibuja una opción por manifiesto con `audience` humano. Sin rieles fijos en el código.
- El paso de pago se dibuja según `instructions.kind`: `solana-pay` (QR, botón "Abrir en la wallet", link copiable), `approval` (texto y espera), `x402` (solo agentes, se documenta en `/agents`).
- El link a Solscan sale de `explorerUrl` del `Payment`.

## Tests y aislamiento

- `rails/core` trae un `fakeRail` que paga al segundo `check()`. Los tests del gateway usan ese riel.
- `rails/solana` tiene tests de `received()` (suma de pre/postTokenBalances) y del link de Solana Pay.
- `scripts/check-isolation.sh` corre en `pnpm test`: falla si aparece `solana:<genesis>`, un mint de USDC, `@x402/` o `@solana/` en `apps/` o `packages/shell-spec`. `apps/buyer` queda exento porque es un cliente externo de ejemplo.
