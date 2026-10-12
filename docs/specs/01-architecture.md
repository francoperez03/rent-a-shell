# 01 · Architecture

## Map

```
 Person (browser)                        AI agent
   │  website, checkout, console           │  llms.txt, MCP, x402
   ▼                                       ▼
┌──────────────────────── Vercel ─────────────────────────┐
│ static website (Vite + React)                           │
│ /llms.txt  /agents  (pages for agents)                  │
└───────────────┬─────────────────────────────────────────┘
                │ fetch to the gateway's public URL
                ▼
┌──────── Fixed gateway URL (tunnel) ─────────────────────┐
│ /api/*   ──► Hono gateway  localhost:8787               │
│ /live/*  ──► MediaMTX HLS (proxied by the gateway)      │
│ /mcp     ──► MCP server (inside the gateway)            │
└───────────────┬─────────────────────────────────────────┘
                │ local network (own router)
                ▼
          ESP32 El Tucu  http://<fixed-ip>
          GET /state  POST /dance /joint /stop

 Gateway ──► PaymentRail interface (packages/rails/core)
               └─ solana: x402 (USDC, facilitator) and Solana Pay (QR with reference)
```

Every connection to chains, tokens and payment providers lives behind the adapter in `08-rail-adapter.md`. The rest of the system knows nothing about networks, mints or facilitators.

## Who talks to whom

| Origin | Destination | What | Public |
|---|---|---|---|
| Browser | Vercel | website | yes |
| Browser | gateway `/api` | catalog, create session, commands | yes, with CORS only for the website domain |
| Browser | gateway `/live` | HLS video | yes, read-only |
| Agent | gateway `/api` and `/mcp` | x402, session, commands, frame | yes |
| Gateway | ESP32 | `/state`, `/dance`, `/joint`, `/stop` | **no**, local network only |
| Rails (inside the gateway) | RPCs, facilitators, payment APIs | read payments, `verify`/`settle` | outbound |
| ffmpeg | MediaMTX | publishes the webcam | local |

## Decision: ESP32 behind the gateway

The ESP32 stays on the local network only and everything goes through a gateway on the computer next to it. Reasons:

1. El Tucu's firmware has no auth or TLS. Exposed to the internet, anyone could move the arm without paying.
2. The camera already needs a computer (MediaMTX + ffmpeg with the webcam).
3. The session lock (only whoever paid moves it, and until it expires) lives in the gateway, so the firmware stays as it is.
4. The ESP32 on direct WiFi works the same: it's the connection between ESP32 and computer inside the own router.

Alternative discarded for the hackathon: the ESP32 talking only to a cloud server over an outbound WebSocket. It avoids the tunnel but forces a firmware rewrite and still needs a computer for the camera.

## Tunnel

Same as El Tucu (`robot-a/SPEC.md` §4.5):

- No domain: a **Cloudflare quick tunnel** (`pnpm forger` starts it and re-registers when the URL changes) or **Tailscale Funnel** for a fixed free URL.
- With a domain: `cloudflared` as a service with a named tunnel. `[INPUT]` domain.
- Fallback: ngrok (it has a browser warning screen and a traffic cap, which is why it's last).

The gateway proxies MediaMTX's HLS at `/live/*`, so a single tunnel covers the API and the video.

## Environment variables

| Variable | Where | Value |
|---|---|---|
| `VITE_API_URL` | website (Vercel) | `https://<gateway-url>` |
| `VITE_HUB_URL` | website (Vercel) | hub URL, optional (catalog of every Forger) |
| `ESP32_URL` | gateway | `http://<esp32-ip>` or `http://localhost:8080` (mock) |
| `SESSION_SECRET` | gateway | secret to sign session tokens, only on the gateway machine |
| `RAILS` | gateway | active rails, e.g. `solana-x402,solana-pay` |
| `SOLANA_NETWORK` | `solana` rail | `devnet` or `mainnet` |
| `SOLANA_PAY_TO`, `SOLANA_RPC_URL`, `X402_FACILITATOR_URL` | `solana` rail | owner wallet `[INPUT]`, optional RPC, optional facilitator (default x402.org on devnet, PayAI on mainnet) |
| `ALLOWED_ORIGIN` | gateway | website domain on Vercel |
| `PUBLIC_URL` | gateway | tunnel URL (for `llms.txt` and 402 responses) |
| `RTSP_URL`, `HLS_UPSTREAM` | gateway | MediaMTX RTSP (frames) and HLS (proxied at `/live`) |

## What's secret

`SESSION_SECRET`, `SOLANA_OPERATOR_KEY` (escrow operator, see `04-payments.md`) and any wallet key live only on the gateway machine. The gateway **needs no private key to receive payments**: it receives in `SOLANA_PAY_TO` and the facilitator pays the x402 fee. None of this goes to git, Vercel or chats.

## Monorepo

```
rent-a-shell/
  apps/
    web/        website (Vite + React 18), deployed on Vercel
    gateway/    Hono on Node 22: sessions, payments, proxy, MCP
    hub/        marketplace hub: Forger catalog, health, llms.txt, MCP
    buyer/      example buyer agent for the demo (@x402/fetch)
  packages/
    shell-spec/ shared types: shell spec, commands, session
    rails/      core (interface), solana (08-rail-adapter.md)
  programs/     Anchor escrow program (shell_escrow)
  skills/       Claude Code skills (rent and Forger)
  docs/
```

The website carries no networks or mints: it builds the checkout from `GET /api/rails` and draws the QR the intent returns.

The mock and the firmware **aren't copied**: they're used from `robot-a/apps/mock` and `robot-a/apps/firmware`.
