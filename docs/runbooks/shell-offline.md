# Runbook: the site says a shell is offline

The site marks a shell offline when the hub (the Next.js app on Vercel) cannot fetch `<gateway>/api/shells` within
`HUB_TIMEOUT_MS` (10 s) on its 30 s refresh. Walk the chain from the robot outwards; stop at the first thing that fails.

## 1. Robot and gateway (on the Forger machine)

```bash
curl http://192.168.1.15/state                      # ESP32: must be 200 with angles
curl http://localhost:8787/api/health               # gateway: {"ok":true,...,"robot":true}
curl http://localhost:8787/api/shells/el-tucu/state # angles, moving, uptime
curl -o /dev/null -w '%{http_code}\n' http://localhost:8787/live/el-tucu/index.m3u8   # HLS: 200 (404 = camera down, see 5)
tail -50 <forger log>                               # pnpm forger output: [tunnel] URL, [hub] registered, [camera] errors
```

`robot:false` means the ESP32 is not answering on the LAN: power, Wi-Fi, IP changed (`pnpm forger:find-esp32`).

## 2. Tunnel

```bash
cat apps/gateway/data/public-url.txt                # current quick-tunnel URL
curl -o /dev/null -w '%{http_code} %{time_total}s\n' "$(cat apps/gateway/data/public-url.txt)/api/shells"
curl -s http://127.0.0.1:20242/metrics | grep -E '^cloudflared_tunnel_(ha_connections|total_requests|request_errors)'
```

The metrics port is 20241..20245 (first free one; 20241 is often the named `cloudflared` service of this Mac, not ours).
If the URL does not answer: kill the `cloudflared tunnel --url` process, the launcher restarts it with a new URL and
registers it again on the hub (it retries forever since 2026-10-16).

## 3. Hub registration

```bash
TOK=<HUB_ADMIN_TOKEN from apps/web/.env.local>
curl -H "Authorization: Bearer $TOK" https://rent-a-shell.vercel.app/api/forgers   # url, online, lastSeen, shells
curl https://rent-a-shell.vercel.app/api/catalog                                   # what the site shows
```

If the registered URL is not the one in `public-url.txt`, register by hand (the launcher normally does it):

```bash
HT=<HUB_TOKEN from apps/gateway/.env.local>
curl -X POST -H "content-type: application/json" -H "authorization: Bearer $HT" \
  -d "{\"gateway\":\"$(cat apps/gateway/data/public-url.txt)\"}" https://rent-a-shell.vercel.app/api/forgers
```

## 4. How Vercel sees the gateway

```bash
cd apps/web && vercel logs rent-a-shell.vercel.app | grep 'hub\]'      # "[hub] <url> unreachable: <reason>"
curl -H "Authorization: Bearer $TOK" "https://rent-a-shell.vercel.app/api/probe?url=$(cat ../gateway/data/public-url.txt)&path=/api/shells"
```

The probe answers from the Vercel instance: DNS, three fetch variants with timings, and `attempts`, the last catalog
refreshes of that instance with their duration and error. Read it like this:

- probe fetches fail too: the tunnel is unreachable from Vercel's region. Restart the tunnel (step 2).
- probe fetches are fast but `attempts` show `~28000 ms` and "aborted due to timeout": a background refresh is being frozen
  by Vercel after the response. That was the 2026-10-16 bug; the refresh now runs inside Next's `after()`. If it comes
  back, check that `entries()` in `apps/web/src/server/hub.ts` still uses `after()`.
- everything fine but the site still says offline: stale instance. `vercel redeploy rent-a-shell.vercel.app`.

## 5. Camera (LIVE shows nothing, HLS 404)

The launcher only restarts ffmpeg when it exits. On 2026-10-16 it kept running while logging
`Invalid buffer size, packet size ... < expected frame_size` (the capture changed resolution underneath it) and the stream
was gone. Fix: `kill <pid of ffmpeg -f avfoundation>`; the launcher respawns it in 3 s. A watchdog on that error is the
next improvement.

## Known gaps

- `[registry] register: AnchorError ... InstructionFallbackNotFound` on gateway start: the `shell_escrow` program on devnet
  predates `register_shell`. Harmless for renting; on-chain reputation stays empty until the program is redeployed.
