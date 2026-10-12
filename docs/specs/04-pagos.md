# 04 · Pagos

Dos rieles en Solana, un solo resultado: un token de sesión (`03-gateway-local.md`). Todo lo de acá vive en `packages/rails/solana` y nada sale de ese paquete (`08-rieles-adaptador.md`).

| Riel | `id` en el registro | Quién | Confirmación |
|---|---|---|---|
| R1 · x402 | `solana-x402` | agente | facilitator x402, síncrono: se liquida antes de emitir la sesión |
| R2 · Solana Pay | `solana-pay` | persona con wallet (Phantom, Solflare) | `getSignaturesForAddress(reference)` + saldos del token |

Implementación: `packages/rails/solana/src/{config,x402,pay,check}.ts`.

## Redes y contratos

| | Devnet | Mainnet |
|---|---|---|
| CAIP-2 | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| USDC (6 decimales) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Facilitator | `https://x402.org/facilitator` (sin key) | `https://facilitator.payai.network` |
| RPC por defecto | `https://api.devnet.solana.com` | `https://api.mainnet-beta.solana.com` |
| Explorer | Solscan `?cluster=devnet` | Solscan |

Se elige con `SOLANA_NETWORK=devnet|mainnet`. Los mints son los assets por defecto de `@x402/svm` 2.27.0.

## R1 · x402 (agentes)

1. El agente hace `POST /api/sessions/x402?shell=el-tucu&blocks=1`.
2. El gateway responde `402` con el requerimiento x402 esquema `exact` en la red SVM: asset USDC, `payTo = SOLANA_PAY_TO`, monto = bloques × precio en unidades atómicas. El server de `@x402/svm` agrega `feePayer` (del facilitator) y un `recentBlockhash`.
3. El agente firma la transferencia SPL con `@x402/fetch` + `@x402/svm` (`ExactSvmScheme`, `toClientSvmSigner`) y reintenta con el header de pago. **No necesita SOL**: el facilitator es el fee payer.
4. El gateway llama `verify` y `settle` en el facilitator y recién ahí responde `200` con `{token, sid, starts_at, expires_at, payment}`. Si el settle falla, no hay token.

## R2 · Solana Pay (personas)

1. La persona elige bloques en el checkout. El sitio llama `POST /api/sessions/intent` con `{shell, blocks, rail: "solana-pay"}`.
2. El riel genera una `reference` (32 bytes aleatorios, como pubkey) y arma un transfer request:
   `solana:<SOLANA_PAY_TO>?amount=1&spl-token=<USDC>&reference=<ref>&label=Rent%20a%20Shell&message=...` (percent-encoding, como pide la spec de Solana Pay).
3. El sitio dibuja el QR y un botón "Abrir en la wallet". La persona escanea con Phantom o Solflare; la wallet agrega la `reference` como cuenta de la tx.
4. `check()`: `getSignaturesForAddress(reference)`, después `getTransaction` (`jsonParsed`) y se compara `postTokenBalances` contra `preTokenBalances` para el owner `SOLANA_PAY_TO` y el mint USDC. Si subió al menos el monto, el intent pasa a `paid`. Cubre el caso de ATA nueva (sin saldo previo).
5. El sitio hace polling de `GET /api/sessions/intent/:id` (y escucha `payment_seen` por SSE) y recibe el token.

Con la `reference` no hacen falta montos con decimales mágicos ni un contrato: cada intent tiene su propia cuenta para buscar.

## Verificado en vivo (2026-10-12, devnet)

- `pnpm check-solana`: `x402.org/facilitator/supported` responde `exact` en `solana:EtWT…`, y el mint USDC de devnet existe.
- 402 real del gateway: `{"scheme":"exact","network":"solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1","amount":"1000000","asset":"4zMMC9…","payTo":"<SOLANA_PAY_TO>","extra":{"feePayer":"CKPKJW…","recentBlockhash":"…"}}`.
- `pnpm buyer` con wallet vacía: el facilitator simula la tx y responde `invalid_exact_svm_transaction_simulation_failed` (la firma y el requerimiento son válidos; falta saldo).
- `POST /api/sessions/intent` con `solana-pay` devuelve un link `solana:` válido y el checkout muestra el QR (`evidencia/f4/checkout-solana-pay.png`).
- PayAI responde `/supported` con `exact` en mainnet. `[a verificar]` si el settle en mainnet pide `X402_API_KEY` o créditos (el riel manda `Authorization: Bearer` solo si la variable está).

## Precio

| Parámetro | Valor | Estado |
|---|---|---|
| Bloque | 5 minutos (`BLOCK_MINUTES`) | `[INPUT]` |
| Precio por bloque | USD 1 (`BLOCK_USD`) | `[INPUT]` |
| Máximo por compra | 6 bloques (30 min) | `[INPUT]` |

El precio se cobra en USDC 1:1 con USD.

## Escrow (programa `shell_escrow`)

Pago de personas con comisión del marketplace y reembolso automático. Código en `programs/programs/shell-escrow/src/lib.rs` (Anchor 0.32.1), program id `5459LTpropgaL1a7Ct4nRUN6BULGvJs3STMcreh2gf4X`. Cliente en `packages/rails/solana/src/escrow.ts`.

**Cuentas**
- `Config`, PDA `["config"]`: `admin`, `treasury`, `fee_bps` (1000 = 10 %) y `usdc_mint`.
- `Escrow`, PDA `["escrow", session_id]`: `payer`, `forger`, `operator`, `mint`, `amount`, `expires_at` y `state` (Funded, Settled o Refunded). `session_id` es el sha256 del id del intent, así el riel lo deriva sin guardar estado. La cuenta queda abierta con su estado final: sirve de registro e impide reusar un `session_id`.
- Vault: ATA de USDC del PDA `Escrow`.

**Instrucciones**
- `init_config` y `update_config`: solo el admin. Se corren con `pnpm --filter @ras/rails-solana init-escrow`.
- `deposit(session_id, amount, forger, operator, expires_at)`: firma el pagador; el USDC pasa a su vault. El mint tiene que ser el de `Config`.
- `settle`: firma el operator. `fee_bps` a la tesorería y el resto al Forger (90/10). Cierra el vault y el rent vuelve al pagador.
- `refund`: firma el operator. Todo vuelve al pagador.
- `reclaim`: puede firmarla cualquiera, pasado `expires_at` + 1 h y con el escrow en Funded. Todo vuelve al pagador. Protege al que pagó si el gateway desaparece. El riel pone `expires_at` en `ESCROW_HOLD_SECONDS` (6 h por defecto).

**Operator.** Cada gateway tiene una wallet propia (`SOLANA_OPERATOR_KEY`) que solo puede liquidar al Forger y a la tesorería o reembolsar al pagador: el programa no tiene ningún camino que mande fondos a otro lado. Necesita algo de SOL para fees. Esto reemplaza la regla anterior de "el gateway no tiene keys": la clave del operator vive solo en `.env.local` de la máquina del Forger, y la wallet que cobra (`SOLANA_PAY_TO`) sigue sin estar en el gateway.

**Transaction request de Solana Pay.** Con operator configurado, el riel `solana-pay` (`pay-escrow.ts`) cambia el transfer request por un transaction request: el QR lleva `solana:<PUBLIC_URL>/api/rails/solana-pay/tx/<intentId>`. La wallet hace `GET` (label e ícono) y `POST {account}`; el gateway responde con la tx `deposit` armada y la `reference` como cuenta de solo lectura. `check()` lee la cuenta `Escrow` (Funded y monto correcto). Al cerrar la sesión, `finalize()` hace `settle` o `refund` (idempotente: si ya está cerrado, no hace nada). La URL tiene que ser HTTPS pública para que la wallet llegue: hace falta el túnel. Sin operator, el riel sigue con el transfer request directo a `SOLANA_PAY_TO`.

**x402.** Los agentes siguen pagando directo a la wallet del Forger, sin comisión: el facilitator arma una transferencia SPL simple y no invoca programas.

**Verificado (2026-10-12, validador local con el programa cargado).** `pnpm --filter @ras/rails-solana e2e` (`escrow.e2e.ts`) recorre QR, `GET`/`POST` del transaction request, firma del pagador, `check()` y `finalize`. Resultado: Forger 0,9 USDC, tesorería 0,1 USDC, refund devuelve el 100 % y un segundo `finalize` no hace nada. `anchor test` en `programs/`: 7 de 7 (split exacto, refund, reclaim antes y después del plazo, operator ajeno, doble settle, mint incorrecto, monto cero).

## Reembolso

Con escrow, automático: si el robot cae con sesión paga y no vuelve en `OFFLINE_REFUND_SECONDS`, el gateway corta la sesión y `finalize("refund")` devuelve el USDC (`03-gateway-local.md`). Pagos x402 (directos al Forger): el reembolso sigue siendo manual desde la wallet del Forger.
