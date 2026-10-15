# 03 · Local gateway

A single Node 22 process with Hono on `localhost:8787`, plus MediaMTX and ffmpeg for the camera. It runs on the computer next to the robot; `pnpm forger` (`scripts/forger/run.mjs`) starts and supervises everything on macOS, Windows or Linux.

## Responsibilities

1. Publish the catalog and the state of each shell.
2. Charge through the `PaymentRail` interface (`08-rail-adapter.md`) and issue a session token. The gateway imports nothing from Solana or any network.
3. Act as the lock: only the valid token can move the robot.
4. Pass commands to the ESP32 through an allowlist.
5. Cut the session at expiry and leave the robot at HOME.
6. Serve the MCP for agents (`05-agents.md`).

## API

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/api/shells` | | list of specs (`02-robot.md`) with live `status` |
| GET | `/api/shells/:id/state` | | proxy to `GET /state`, 500 ms cache |
| GET | `/api/shells/:id/frame` | | latest JPEG frame from the camera (for agents without HLS) |
| GET | `/api/shells/:id/queue` | | active session (expires at…) and queue |
| GET | `/api/rails` | | manifests of the active rails (`08-rail-adapter.md`) |
| POST | `/api/sessions/x402` | x402 | the agent pays and gets the token in the same response; uses the first rail with a paywall or `?rail=` |
| POST | `/api/sessions/intent` | | `{shell, blocks, rail, asset?}`: the rail returns an `Intent` with its instructions (solana-pay, approval) |
| GET | `/api/sessions/intent/:id` | | calls the rail's `check()`; status `pending`, `paid` or `expired`; with `paid` it brings the token |
| POST | `/api/cmd` | Bearer token | `{cmd, args}` from the allowlist, proxied to the ESP32 |
| POST | `/api/sessions/end` | Bearer token | closes early (no partial refund in v1) |
| GET | `/api/events` | | SSE with `state`, `session_started`, `session_ended`, `payment_seen` for the HUD |
| POST | `/mcp` | | MCP server (Streamable HTTP) |
| POST | `/api/shells/:id/requests` | | customization request to the Forger `{contact, message}`: 1 to 200 and 10 to 2000 characters, body up to 4 KB (413), 5 per IP every 10 min (429). Stored in `DATA_FILE` |
| GET | `/api/forger/requests` | Bearer `FORGER_TOKEN` | list of requests for the Forger; without token 401 |
| * | `/api/rails/:id/*` | | each rail's own routes (`fetch` in `08-rail-adapter.md`); today the Solana Pay transaction request |
| GET | `/live/*` | | proxy to MediaMTX's HLS (`HLS_UPSTREAM`), so one tunnel covers API and video |

## Session token

- HS256 JWT signed with `SESSION_SECRET`: `{sid, shell, rail, exp}`.
- `exp` = start + paid minutes. The start is when the shell becomes free (if there's a queue, the token is issued anyway and the session reports `active: false` until it starts).
- One active session per shell. FIFO queue, persisted in `DATA_FILE`.
- The token is stored in the browser (sessionStorage) or kept by the agent.

## `/api/cmd` rules

- Rejects with `401` without a token, `403` if the token belongs to another shell or expired, `409` if the ESP32 answers 409.
- Rate limit: 10 commands per second per session.
- `stop` is never rate-limited.
- 2 s timeout to the ESP32. Three failures in a row put the shell `offline`.

## Cut at expiry

A tick every second. At expiry: `POST /stop`, `joint` to HOME on each joint, `session_ended` event, and the next session in the queue starts after the rest period (`REST_SECONDS`, 60 s).

## Payment close (`finalizeEnded`)

On each tick, for each ended session with a payment and without `finalized`:
- ended by expiry or by `POST /api/sessions/end`: `finalize(payment, "completed")`;
- ended because the robot went down (`ended: "offline"`): `finalize(payment, "refund")`.

Rails without `finalize` (x402, fake) are marked immediately. If `finalize` fails, it's retried 30 s later (`finalize_retry_at`); meanwhile the funds stay in escrow and the payer can reclaim them on their own after the deadline (`04-payments.md`). The session stores `finalized` and `finalize_tx`.

## Cut when the robot goes down

If the robot goes offline (3 failures in a row) with an active session, the gateway records `offline_since`. If it doesn't come back within `OFFLINE_REFUND_SECONDS` (120 by default), it cuts the session with `ended: "offline"` and the payment close refunds it. If it comes back earlier, the mark is cleared and the session continues.

## Camera

Same scheme as El Tucu (`robot-a/SPEC.md` §4.3):

| Piece | Value |
|---|---|
| Server | MediaMTX with `scripts/forger/mediamtx.yml`, the only process that opens the webcam |
| Capture | ffmpeg (`avfoundation` on macOS, `dshow` on Windows, `v4l2` on Linux) publishing to MediaMTX at the `SHELL_ID` path |
| Output | HLS on `localhost:8888`, exposed by the gateway at `/live` |
| Latency | a few seconds with HLS. WebRTC is out: it uses UDP and doesn't go through the tunnel |
| Frame for agents | the gateway reads a JPEG via ffmpeg from MediaMTX's RTSP and caches it for 1 s |

## Processes

`pnpm forger` starts MediaMTX, the ffmpeg capture, the tunnel (`cloudflared`) and the gateway as children, restarts whatever crashes and re-registers in the site's catalog (`HUB_URL`) when the tunnel URL changes. Autostart: Login Items on macOS, a scheduled task on Windows, pm2 or systemd on Linux (see the Forger skill).

## Failures

| What fails | What the user sees | What the gateway does |
|---|---|---|
| ESP32 | `offline` pill, console disabled | retries `/state` on each tick; if it doesn't come back within `OFFLINE_REFUND_SECONDS`, cuts the session and refunds it through the rail (`04-payments.md`) |
| Camera | "No video" over the last frame | keeps accepting commands; the HUD shows angles from `/state` |
| Tunnel | the website shows "El Tucu is disconnected" and retries every 10 s | `pnpm forger` restarts the tunnel and re-registers |
| Gateway | same as the tunnel | `pnpm forger` restarts it; sessions are persisted in `DATA_FILE` |

## Reused code

- Proxy and 409 handling: `robot-a/apps/agent/app/agent/src/tucu.ts` (`dance`, `/state` query).
- x402 and Solana Pay payments: `packages/rails/solana` (`x402.ts`, `pay.ts`, `pay-escrow.ts`).
- Reference 402 middleware: `paybot/packages/x402/src/middleware.ts`. The 402 is built from the `requirement` the rail returns.

## Spec sheet (2026-10-14)

The shell's spec sheet comes from `apps/gateway/shell.json` (`SHELL_FILE` to point elsewhere; `shell.example.json` is El Tucu's), validated with zod in `config.ts` (`loadSheet`): slug id, min below max per joint, HOME inside the ranges, price as a two-decimal string, non-empty routines and sensors, optional `image` file next to the json. The gateway refuses to start on an invalid sheet. `SHELL_*`, `BLOCK_*` and `FORGER_*` env vars override single fields. The photo is served at `GET /api/shells/:id/image` (one hour cache) and published as `image` in `/api/shells`, `llms.txt` and the site. `pnpm forger:spec` validates and prints the sheet; `forger:doctor` checks it too.
