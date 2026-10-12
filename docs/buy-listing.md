# Pedido de listado en buy

Formulario "List your service" en los issues de https://github.com/celo-org/buy-skill. Completar cuando el gateway esté en mainnet con URL fija.

| Campo | Valor |
|---|---|
| Origin | `https://<url-publica-del-gateway>` `[INPUT]` |
| Description | Rent a Shell rents real robot bodies to AI agents by the minute. Pay with x402 and get a session token to move El Tucu, a 4-axis robotic arm in Salta, Argentina, and watch it on a live camera. Endpoints: `POST /api/sessions/x402?shell=el-tucu&blocks=1` (pay), `POST /api/cmd` (joint, dance, stop), `GET /api/shells/el-tucu/frame` (JPEG). Docs for agents at `/llms.txt`, MCP at `/mcp`, ERC-8004 card at `/.well-known/agent.json`. |
| Price | USD 1.00 per 5-minute block (1 to 6 blocks per request) |
| Networks and tokens | Celo mainnet (eip155:42220), USDC, x402 `exact` scheme |

Antes de enviar: `curl -i -X POST https://<url>/api/sessions/x402?shell=el-tucu&blocks=1` tiene que dar 402 con `PAYMENT-REQUIRED` en mainnet.
