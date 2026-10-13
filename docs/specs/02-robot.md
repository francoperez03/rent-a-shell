# 02 · Robot: El Tucu as shell #1

We use the arm from the BNB Builder Sessions **exactly as programmed**. Source of truth: `robot-a/SPEC.md` §4.4 and `apps/firmware/README.md`. If anything here contradicts those files, they win.

## Hardware

- ESP32 + 4 SG90 servos: base, `shoulder`, `elbow`, `grip`.
- ESP-IDF 5.5.3 firmware, WiFi STA on the own router with a fixed IP.
- 5 V power supply with common ground and a capacitor on the 5 V line.
- Optional INA219 current sensor on the servo bus (SDA 21, SCL 22, address 0x40).
- USB webcam on the gateway computer pointing at the arm.

## Firmware API

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/state` | | `{ok, moving, rutina, angles:{base,shoulder,elbow,grip}, current_ma, uptime_ms}` |
| POST | `/dance` | `{rutina: "robot" \| "lento" \| "saludo" \| "recta"}` | `{ok, duration_ms}` or `409` if already moving |
| POST | `/joint` | `{joint, angle}` | `{ok, joint, angle, clamped, limits}`, `409` while dancing, `400` if invalid |
| POST | `/stop` | | `{ok, angles}`, always accepted |

- `current_ma`: total servo bus current from the INA219, `null` if the chip isn't detected.
- HOME `{base:90, shoulder:90, elbow:90, grip:70}`.
- Max speed 2° every 20 ms.
- Ranges until calibrated: base 20 to 160, shoulder 50 to 130, elbow 50 to 130, grip 40 to 110. `[to verify]` against the final calibration in `robot-a/apps/firmware`.
- The firmware clamps to the safe range: the gateway doesn't need to repeat the limits, but publishes them in the spec.
- Routines live in `apps/firmware/main/dance.c` and `apps/mock/dance.mjs` (`robot`, `lento`, `saludo`, `recta`).

## Commands exposed in a session

The gateway translates session commands into the firmware API. Closed allowlist:

| Session command | ESP32 call | Rule |
|---|---|---|
| `joint {joint, angle}` | `POST /joint` | requires a valid session |
| `dance {rutina}` | `POST /dance` | requires a valid session, routine from the list |
| `stop` | `POST /stop` | requires a valid session; the gateway also calls it on its own at expiry |
| `state` | `GET /state` | public, no session (feeds the website HUD) |

When the session expires or closes, the gateway calls `POST /stop` and then `POST /joint` on each joint to return to HOME.

## Machine-readable spec

Served by the gateway at `GET /api/shells` and used by the website, `llms.txt` and the MCP. Types in `packages/shell-spec`.

```json
{
  "id": "el-tucu",
  "name": "El Tucu",
  "kind": "arm-4dof",
  "location": "Tucumán, AR",
  "status": "online",
  "gateway": "https://<gateway-url>",
  "camera": { "hls": "https://<gateway-url>/live/el-tucu/index.m3u8", "frame": "https://<gateway-url>/api/shells/el-tucu/frame" },
  "joints": {
    "base": [20, 160], "shoulder": [50, 130], "elbow": [50, 130], "grip": [40, 110]
  },
  "home": { "base": 90, "shoulder": 90, "elbow": 90, "grip": 70 },
  "routines": ["robot", "lento", "saludo", "recta"],
  "sensors": ["angles", "current_ma"],
  "pricing": { "block_minutes": 5, "usd": "0.05" }
}
```

`status`: `online`, `busy` (active session), `offline` (doesn't answer `/state` or there's no video). Example price in USD, `[INPUT]` final price. The spec doesn't say how to pay: payment methods come from `GET /api/rails` (`08-rail-adapter.md`), so changing infra doesn't touch the spec.

## Development without the arm

`robot-a/apps/mock` has the same API and routines as the firmware (`check-tables.mjs` fails if they differ), and simulates `current_ma`.

```bash
cd robot-a
pnpm --filter mock start          # listens on http://localhost:8080
ESP32_URL=http://localhost:8080   # in the gateway
```

## Robot risks

| Risk | Mitigation |
|---|---|
| An SG90 overheats with back-to-back sessions | 1-minute rest at HOME between sessions; `[to verify]` how many sessions it holds in a rehearsal |
| Event WiFi | own router, reserved IP |
| The power supply can't deliver current for 4 servos | measure first (the INA219 helps), `[INPUT]` supply amperes |
| It fails mid-demo | backup video recorded in F7 |
