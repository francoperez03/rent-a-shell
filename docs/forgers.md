# Forgers · cómo publicar tu hardware

Un Forger arma un shell, lo mantiene online y cobra por minuto de uso. Corre un gateway propio al lado de su robot y lo registra en el hub.

## 1. Gateway

```bash
git clone <repo> && cd rent-a-shell && pnpm install
cp apps/gateway/.env.example apps/gateway/.env.local
```

En `apps/gateway/.env.local`:

| Variable | Qué poner |
|---|---|
| `ESP32_URL` | IP del robot en tu red local |
| `PUBLIC_URL` | URL HTTPS pública del gateway (túnel). La usan el hub, el sitio y las wallets (transaction request) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `SHELL_ID`, `SHELL_NAME` | id único en el catálogo y nombre visible |
| `SHELL_SENSORS` | `angles,current_ma` si tenés INA219; si no, `angles` |
| `BLOCK_MINUTES`, `BLOCK_USD` | duración y precio del bloque |
| `FORGER_NAME`, `FORGER_CONTACT` | cómo te ven los clientes |
| `FORGER_TOKEN` | `openssl rand -hex 24`, para leer los pedidos |
| `RAILS` | `solana-x402,solana-pay` |
| `SOLANA_NETWORK` | `devnet` o `mainnet` |
| `SOLANA_PAY_TO` | la address de tu wallet (Phantom). Solo recibe: la clave no va al gateway |
| `SOLANA_OPERATOR_KEY` | secret base58 de una wallet aparte, con un poco de SOL para fees. Solo puede liquidar o reembolsar escrows, nunca mandar fondos a otro lado. Sin ella, Solana Pay cobra directo y sin escrow |

```bash
pnpm gateway
curl $PUBLIC_URL/api/shells     # tu ficha
```

## 2. Registrarte en el hub

```bash
curl -X POST https://<hub>/api/forgers \
  -H 'content-type: application/json' \
  -d '{"gateway":"https://<tu-gateway>"}'
```

El hub pide tu `/api/shells`. Si responde, quedás en el catálogo (201); si no, 422. Cada 30 s chequea que sigas online.

## 3. Cobrar

- Personas (Solana Pay con escrow): al terminar la sesión te llega el 90 % y la plataforma se queda con el 10 %. Si tu robot se cae más de `OFFLINE_REFUND_SECONDS`, la sesión se corta y el pago vuelve al cliente.
- Agentes (x402): te llega el 100 % directo a `SOLANA_PAY_TO`.

## 4. Pedidos de personalización

Los clientes te dejan pedidos desde la ficha del shell (un sensor extra, otro efector, otro montaje):

```bash
curl -H "authorization: Bearer $FORGER_TOKEN" $PUBLIC_URL/api/forger/requests
```
