# 08 · Rieles de pago detrás de un adaptador

Regla de diseño: **ningún archivo fuera de `packages/rails/*` importa viem, addresses, chain IDs, facilitators ni SDKs de pago.** El gateway y el sitio hablan con una interfaz. Celo es la primera implementación; Twin y belo se suman o reemplazan cambiando configuración.

Motivo: la infra de pago puede cambiar (Twin por sus stablecoins multi-chain, belo por su banca para agentes) y el resto del producto (sesiones, robot, cámara, sitio) no debería enterarse.

## Dónde vive

```
packages/
  rails/
    core/      interfaz, tipos, registro, rail falso para tests (sin dependencias de chain)
    celo/      x402 USDC, transferencia USDC/wFiat, on-ramp Ripio
    twin/      transferencia ARGt, BOLt, BRAt, CHLt, COLt, MEXt, PERt en Arbitrum, Base, Polygon, Ethereum
    belo/      stub hasta que haya API pública
```

`apps/gateway` depende solo de `rails/core` y de los paquetes que se carguen por config. `apps/web` no depende de ningún paquete de rieles: lee un manifiesto del gateway.

## Interfaz

```ts
// packages/rails/core
type Money = { usd: string }                         // precio canónico del producto

type Instructions =
  | { kind: "x402"; requirement: unknown }           // lo arma el riel, el gateway lo devuelve en el 402
  | { kind: "transfer"; chainId: number; token: Hex; to: Hex; amount: string; decimals: number; explorer: string }
  | { kind: "redirect"; url: string }                // Ripio, belo, cualquier checkout externo
  | { kind: "approval"; ref: string; note: string }  // el pagador aprueba en otra app (belo)

type Intent = { id: string; rail: string; amount: string; asset: string; expiresAt: number; instructions: Instructions }

type Payment = { intentId: string; rail: string; payer: string; tx?: string; explorerUrl?: string; paidAt: number }

interface PaymentRail {
  id: string                                         // "celo-x402", "celo-wallet", "ripio", "twin-wallet", "belo"
  manifest(): RailManifest                           // lo que el sitio necesita para dibujar el checkout
  createIntent(price: Money, opts: { asset?: string; payerHint?: string }): Promise<Intent>
  // rieles síncronos (x402): verifican y liquidan con el header de pago
  settle?(intent: Intent, paymentHeader: string): Promise<Payment>
  // rieles asíncronos (transfer, redirect, approval): el gateway consulta hasta que pague o venza
  check?(intent: Intent): Promise<Payment | null>
}

type RailManifest = {
  id: string
  label: string                                      // "USDC en Celo", "Pesos con Ripio", "ARGt (Twin)"
  audience: ("human" | "agent")[]
  countries?: string[]                               // sugerencia para el checkout, ej. ["AR"]
  wallet?: { chains: { id: number; name: string; rpc: string; explorer: string }[] }  // para que el sitio arme wagmi
  assets: { symbol: string; decimals: number }[]
}
```

Reglas:
- El precio canónico es USD. Cada riel convierte a su asset y fija la cotización en el intent (15 min).
- Un riel nunca toca sesiones ni el robot. Devuelve `Payment` y el gateway emite el token.
- El watcher on-chain, la referencia en decimales y el matcheo viven dentro del riel.
- El gateway guarda intents y pagos con `rail` como dato: cambiar de riel no rompe el historial.

## Registro por configuración

```bash
RAILS=celo-x402,celo-wallet,ripio          # hackathon Celo × Ripio
RAILS=twin-wallet                          # solo Twin
RAILS=celo-x402,twin-wallet,belo           # mezcla
```

El gateway arma `rails = RAILS.split(",").map(load)`. Cada riel lee sus propias variables con prefijo (`CELO_*`, `TWIN_*`, `BELO_*`). `PAY_TO` puede ser por riel (`CELO_PAY_TO`, `TWIN_PAY_TO`).

## API del gateway (independiente del riel)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/rails` | manifiestos de los rieles activos |
| POST | `/api/sessions/intent` | `{shell, blocks, rail, asset?}` → `Intent` |
| GET | `/api/sessions/intent/:id` | llama `check()` del riel; con `paid` devuelve el token |
| POST | `/api/sessions/x402` | usa el primer riel activo con `settle()`; `?rail=` para elegir |

Reemplaza las rutas específicas de Celo de `03-gateway-local.md`.

## Implementaciones

### `celo` (hackathon, primero)

Lo que define `04-pagos.md`: `celo-x402` (USDC, facilitator `api.x402.celo.org`), `celo-wallet` (USDC y wFiat por transferencia + watcher), `ripio` (redirect a `ramp.ripio.com`, se confirma con el watcher de `celo-wallet`). Base: `~/repos/robotics/pagos-placa/spike.mjs`.

### `twin`

- Manifiesto: `twin-wallet`, para personas, cuatro chains (Arbitrum 42161, Base 8453, Polygon 137, Ethereum 1), assets ARGt, BOLt, BRAt, CHLt, COLt, MEXt, PERt (18 decimales).
- Addresses y RPCs: copiar de Faro, `~/repos/job/stables/twin/apps/faro/lib/config/tokens.ts`. Ojo: hay addresses repetidas entre tokens distintos en chains distintas en la tabla de Twin (por ejemplo `0x5986…2214` aparece para ARGt en Arbitrum y Ethereum, BRAt en Polygon y MEXt en Base) `[a verificar]` contra Twin antes de cobrar.
- `createIntent`: transferencia con referencia en decimales a `TWIN_PAY_TO` en la chain que elija el pagador.
- `check`: watcher de `Transfer` en esa chain, patrón de logs de Faro (`LOG_RANGE`, maxSpan por RPC).
- Bridge (adapters de Twin, `hooks/use-bridge.ts`): fuera del riel. Sirve al dueño para consolidar fondos, no al pago.
- x402 con tokens Twin: `[a verificar]` si implementan EIP-3009 y si hay facilitator en esas chains. Si no, Twin queda solo para personas.

### `belo`

- belo Agentic Banking (https://agentic.belo.app, en waitlist al 2026-10-11): MCP v1 con `auth.sign_in`, `account.balances`, `exchange.fx`, `ramp.fiat_crypto`, `transaction.approve`, entre otros. Regiones AR, BR, BO, CO, CL, EC, MX, PA, PY, PE, UY, VE. El agente propone y una persona aprueba (`HUMAN_APPROVAL_REQUIRED`).
- Encaje: riel para **agentes con supervisión humana**. El agente del pagador usa el MCP de belo, la persona aprueba en belo, y nosotros recibimos.
- Instrucción esperada: `approval` o `transfer` a una address o $Belotag. `[a verificar]`: si belo paga a una address on-chain externa, en qué chain y token, o solo entre cuentas belo (Belopay figura como "coming soon").
- En la hackathon: paquete con `manifest()` y `createIntent` que lanzan "no disponible". Sirve para probar que el registro carga y descarta rieles sin romper el gateway.

## Sitio

- El checkout llama `GET /api/rails` y dibuja una opción por manifiesto. Sin rieles hardcodeados.
- wagmi se configura con la unión de `manifest.wallet.chains` de los rieles activos.
- El paso de pago se dibuja según `instructions.kind`: `transfer` (botón de wallet), `redirect` (abrir pestaña), `approval` (texto y espera), `x402` (solo agentes, se documenta en `/agents`).
- Celoscan, Arbiscan y demás salen de `explorerUrl` del `Payment`.

## Tests

- `rails/core` trae un `fakeRail` que paga al segundo `check()`. Todos los tests del gateway (F1) usan ese riel.
- Cada riel tiene un test de contrato con la interfaz y un script manual contra mainnet con montos chicos.
- Grep de CI: `viem|0x[0-9a-fA-F]{40}|42220|x402` fuera de `packages/rails/` falla.
