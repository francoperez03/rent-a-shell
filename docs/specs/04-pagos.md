# 04 · Pagos

Tres rieles, un solo resultado: un token de sesión (`03-gateway-local.md`). Este archivo define la **implementación Celo** de la interfaz `PaymentRail` (`08-rieles-adaptador.md`): todo lo de acá vive en `packages/rails/celo` y nada sale de ese paquete. Twin y belo se describen en la misma spec del adaptador. Base investigada en `~/repos/robotics/pagos-placa/README.md` (2026-10-08).

| Riel de este archivo | `id` en el registro |
|---|---|
| R1 · x402 | `celo-x402` |
| R2 · wallet | `celo-wallet` |
| R3 · Ripio | `ripio` |

## Contratos en Celo

| Token | Address | Decimales | Fuente |
|---|---|---|---|
| USDC | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` | 6 | `pagos-placa/README.md` |
| USDT | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` | 6 | `pagos-placa/README.md` |
| wARS | `0x0dc4f92879b7670e5f4e4e6e3c801d229129d90d` | 18 | página de la hackathon |
| wBRL, wMXN, wCOP, wPEN, wCLP | ver `../../README.md` | 18 | página de la hackathon |

`[a verificar]` las addresses de USDC y USDT contra docs.celo.org antes de F2.

## Rieles

| Riel | Quién | Desde dónde | Paga en | Confirmación |
|---|---|---|---|---|
| R1 · x402 | agente | cualquier lugar | USDC (o USDT) | facilitator x402, síncrono |
| R2 · wallet | persona con wallet | cualquier país | USDC o wFiat | watcher on-chain del `Transfer` |
| R3 · Ripio | persona sin cripto | Argentina (otros países según Ripio) | pesos → wARS | watcher on-chain del `Transfer` |

### R1 · x402 (agentes)

1. El agente hace `POST /api/sessions/x402?shell=el-tucu&blocks=1`.
2. El gateway responde `402` con el requerimiento x402 esquema `exact`: red Celo, asset USDC, `payTo = PAY_TO`, monto = bloques × precio.
3. El agente firma EIP-3009 (no necesita CELO para gas) y reintenta con el header de pago. Cliente: `@x402/fetch` + `@x402/evm` 2.27.0, como en `spike.mjs`.
4. El gateway llama `verify` y `settle` en `https://api.x402.celo.org` y responde `200` con `{token, starts_at, expires_at, tx}`.

`[a verificar]`: que el facilitator de Celo soporte USDC en mainnet con `exact` (el README de pagos-placa dice que sí para USDC y USDT); paquete servidor de x402 que corresponde a la versión 2.27.0 de los clientes.

### R2 · wallet (personas en cualquier país)

1. La persona elige bloques y token en el checkout. El sitio llama `POST /api/sessions/intent` con `{shell, blocks, rail:"wallet", token}`.
2. El gateway devuelve `{intent_id, pay_to, token, amount, expires_in: 900}`. El monto lleva una **referencia en los últimos decimales** (ej. `1.000137` USDC) para asociar el `Transfer` al intent sin contrato.
3. El sitio conecta la wallet (wagmi + viem, chain `celo`) y manda `transfer(pay_to, amount)`.
4. El gateway mira los `Transfer` hacia `PAY_TO` (patrón `esperarCobro()` de `spike.mjs`), matchea monto exacto y marca el intent `paid`.
5. El sitio hace polling de `GET /api/sessions/intent/:id` y recibe el token.

Si la persona no tiene saldo en Celo: link al bridge de Ripio (`https://bridge.ripio.com`) o a cualquier exchange que retire USDC en Celo. `[a verificar]` qué exchanges retiran USDC por Celo.

### R3 · Ripio on-ramp (personas sin cripto)

1. Checkout con `rail:"ripio"`. El gateway crea el intent en wARS con monto con referencia y arma el link:
   `https://ramp.ripio.com/?country=AR&chain=42220&token=WARS&amount=<ars>&address=<PAY_TO>`
2. El sitio abre Ripio en una pestaña nueva. La persona paga por transferencia o Mercado Pago (KYC en Ripio la primera vez).
3. Ripio no tiene webhook en el widget público: la confirmación sale del watcher on-chain, igual que R2.

Límites y letra chica (de `pagos-placa/README.md`):
- Widget público: persona física residente en AR, mayor de 18, uso personal no comercial. Para operar en serio hace falta la Ramps API B2B con KYB.
- Primera operación USD 1, Mercado Pago 5,8 %, compra/venta 0,1 %.
- Ripio pone el monto final en ARS y puede no coincidir con la referencia decimal. **Riesgo**: el match por monto exacto puede fallar. Plan: address de depósito por intent `[a verificar]` o match por monto aproximado dentro de una ventana de 15 minutos con un solo intent Ripio abierto a la vez.
- Países y tokens dependen de Ripio. `[a verificar]` si BR, MX, CO, PE y CL funcionan con el mismo link cambiando `country` y `token`.

## Precio

| Parámetro | Valor | Estado |
|---|---|---|
| Bloque | 5 minutos | `[INPUT]` |
| Precio por bloque | USD 1 | `[INPUT]` |
| Máximo por compra | 6 bloques (30 min) | `[INPUT]` |
| Conversión a wFiat | cotización wARS/USD al crear el intent, válida 15 min | fuente `[a verificar]`: Textile `preview` o CoinGecko |

## Liquidación al dueño

v1: `PAY_TO` es la wallet del dueño. El pago llega directo, sin escrow. Para el pitch de marketplace multi-host queda el escrow de paybot (`paybot/packages/contracts/contracts/Escrow.sol`: `createPayment`, `claimPayment`, `refundPayment`) como siguiente paso.

Track LATAM: el dueño puede convertir USDC → wARS con Textile (`spike.mjs` → `cambiar()`) y sacar a pesos por `ramp.ripio.com/offramp`. Se muestra en la demo como un paso del dueño.

## Reembolso

Si el robot queda `offline` más de 2 minutos durante una sesión pagada, el gateway marca la sesión `refund_due` y la muestra en un log. En v1 el reembolso lo hace Franco a mano desde la wallet del dueño. `[INPUT]` confirmar que alcanza para la hackathon.

## Requisitos de la hackathon

`pagos-placa/README.md` marca como obligatorios para la hackathon: ERC-8004 (identidad, `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` en Celo) y ERC-8021 (`@celo/attribution-tags`, sufijo en el calldata). `[a verificar]` en las reglas de loops.house y registrar El Tucu como agente/servicio en F6.

## Confirmado al construir (2026-10-11)

- Facilitators: `https://api.x402.sepolia.celo.org` y `https://api.x402.celo.org` responden `/supported` con `exact` en `eip155:11142220` y `eip155:42220`.
- `/settle` exige `X402_API_KEY` (header `X-API-Key`), que se saca en x402.celo.org firmando con una wallet. `/verify` funciona sin key.
- Del lado servidor Celo no está en la tabla de assets por defecto: el precio se declara con `amount` atómico, `asset` USDC y `extra: { name: "USDC", version: "2" }` (patrón de `celo-org/x402-celo-example`).
- USDC Sepolia `0x01C5C0122039549AD1493B8220cABEdD739BC44E`, mainnet `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`, los dos con código.
- El gateway liquida antes de emitir la sesión (flujo manual con `x402HTTPResourceServer`): si el settle falla, no hay token.
- Textile `rfq/preview` USDT → wARS responde sin key: 1 USD ≈ 1.601 wARS ese día.
- Implementación: `packages/rails/celo/src/{config,x402,wallet,watch,attribution,erc8004}.ts`.
