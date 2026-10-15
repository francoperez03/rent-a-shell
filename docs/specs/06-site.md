# 06 · Website

Public website on Vercel. A person comes in, sees the robot live, picks, pays from anywhere and controls it. An agent finds everything it needs at `/agents` and `/llms.txt`.

## Stack

Same as the landing-research replicas, to reuse the motion-kit without friction:

| Piece | Version |
|---|---|
| Vite | 5.4 |
| React | 18.3.1 |
| TypeScript | 5.5.4 |
| Tailwind | 3.4.6 |
| gsap | ^3.13.0 (ScrollTrigger) |
| lenis | ^1.3.23 |
| three + @react-three/fiber | ^0.186.0 + ^8.18.0 (v9 requires React 19 and leaves the page blank) |
| hls.js | 1.7.3 (same as El Tucu) |
| qrcode | ^1.5; draws the Solana Pay QR the intent returns, with no networks or mints in the code |
| clsx | |

Motion-kit: copied from Crisol's `packages/motion-kit/src` into `apps/web/src/motion-kit/` (it isn't published as a package). Recipe catalog in Crisol's `packages/motion-kit/CATALOG.md`.

`/llms.txt` on a Vite site: a static file generated at build time from `GET /api/shells`, or a Vercel rewrite to the gateway. `[to verify]` which is better; the rewrite keeps live state.

## Pages

| Route | For whom | What it has |
|---|---|---|
| `/` | everyone | hero with the robot live, how it works, for people, for agents, close (the shell list and the live events block were removed on 2026-10-14; the nav links to shell #1 from the catalog) |
| `/shells` | everyone | the catalog as a wheel: the current shell large at the centre (photo from `public/shells/<id>.jpg`), neighbours or "coming soon" at the sides, arrows when there is more than one |
| `/shells/:id` | people | spec, video, queue, pick blocks, cost of owning versus renting, Forger and customization request |
| `/checkout` | people | payment with Solana Pay QR, live status until `paid` |
| `/session` | whoever paid | control console |
| `/agents` | agents and devs | endpoints, MCP, `@x402/fetch` example, link to `llms.txt` |

## Taste

Synthesis of the landing-research runs (Crisol `docs/landing/research/{maneva,offbrand,uplink}` and the linear, paisanos and studio34 analyses). Common pattern: one dominant type family, weight 400 to 500, negative tracking; contrast through size; uppercase mono for metadata; monochrome base with a single accent; some small loop always alive; nothing bounces.

| Decision | Value | Source |
|---|---|---|
| Background | navy `#0B0919` | uplink |
| Text | `#F5F5F7` | uplink |
| Single accent | blue `#014FFE` (CTA, focus, selection) | uplink |
| "Live" state | green `#61FF00`, only in status pills and the "LIVE" dot | uplink |
| Shell states | online green, busy blue, offline gray `#6B6B75`, error `#ffc337` | fixed color code reused across the site (studio34); maneva's error yellow |
| Display | a grotesque with −0.04em to −0.05em tracking, weight 400, 100 to 200 px in the hero `[INPUT]` font (candidates: Geist, Inter Display) | maneva, uplink |
| Functional | 15 to 16 px, same family or Helvetica Neue | uplink |
| HUD | uppercase mono 11 to 13 px (Geist Mono) for labels like `EL TUCU · ONLINE · 23 MS` | maneva |
| Sections | manual-style numbering (`0.1 ROBOT`, `0.2 PAYMENT`, `0.3 AGENTS`) | linear |
| State curve | `cubic-bezier(.38,.005,.215,1)` at 0.6 s | uplink |
| Time-based reveals | expo.out 1.2 s | maneva |
| Scroll-bound | `ease: none` | all |

## Motion per section

| Section | Technique | Kit recipe |
|---|---|---|
| Preloader | 0 to 100 counter with a 1 s expo.inOut diagonal exit, while HLS connects | `Preloader.tsx`, `curtainClip` |
| Hero | full-screen live video of El Tucu with HUD labels; title by characters with 0.01 stagger; verb rotating every 5 s ("test / move / inspect") | `useHeroChars`, `useTextCycle` |
| How it works | three steps (pick → pay → control) drawn with scroll and auto-advancing every 4 s | `useTrackDraw`, `useAutoAdvance` |
| People and agents | two columns with word reveal; the agents block shows a `curl` and the 402 response typing itself | `useWordReveal`, `WordsIn` |
| Shells | list on the left, sticky video on the right that changes with focus | `useFocusWindow`, `useReveals` (`.img-in`) |
| Numbers | sessions, minutes rented, on-chain payments, bound 1:1 to scroll (read from `/api/events`) | `useStatSlider` |
| Close | blue CTA with per-character roll on hover | `Roll`, `ChipButton.tsx` |
| Global | smooth scroll on the landing | `useLenis` |

Scroll ranges measured at 1512×812: scale by `vh()/812` (kit helpers `vh`, `absRange`).

## Session console (`/session`)

Linear's register rules here: a live product, no narrative scroll. **No Lenis, no custom cursor, no pins**: they get in the way of real-time control.

```
┌──────────────────────────────────────────┬──────────────────┐
│                                          │ SESSION · 04:12  │
│        live HLS video                    │ ● LIVE 2.8 s     │
│        (HUD angle labels, mA)            ├──────────────────┤
│                                          │ BASE      ──●──  │
│                                          │ SHOULDER  ─●───  │
│                                          │ ELBOW     ───●─  │
│                                          │ GRIP      ●────  │
│                                          ├──────────────────┤
│                                          │ robot lento      │
│                                          │ saludo recta     │
│                                          ├──────────────────┤
│                                          │ [   STOP   ]     │
└──────────────────────────────────────────┴──────────────────┘
```

- Sliders with the spec's ranges. On release it sends `joint`; while dragging, it coalesces every 100 ms.
- Keyboard: arrows for base and shoulder, W/S elbow, A/D grip, space STOP (pattern from `hackware/apps/platform/src/components/console/robot-console.tsx`).
- Live loops: session clock, video latency, "connecting…" dots, real angles from `/state`.
- 0.6 s transitions with the uplink curve. STOP always visible and above everything else (amber).
- At expiry: overlay "Session ended · El Tucu returns to HOME" and a CTA for another block.

## Checkout

- Rail selector built from `GET /api/rails` (`08-rail-adapter.md`): one option per manifest, no rails or chains in the website code. It suggests by `navigator.language` against `manifest.countries` if a rail declares them. All of them can always be picked.
- The payment step is drawn by `instructions.kind` (`solana-pay`: QR, "Open in wallet" button and copyable link; `approval`: text).
- Live payment status (SSE `payment_seen`), with a link to the tx on Solscan.
- Starting components: `paybot/apps/web` (`BotAccessGate`, `PaymentModal`, `PaymentStatusCard`, `CountdownTimer`), adapted to the taste.

## Accessibility and performance

- `prefers-reduced-motion`: no smooth scroll, instant reveals (kit's `reducedMotion`).
- The console works fully with the keyboard. Labels on every slider.
- Responsive at 390 px: the console stacks video on top and controls below.
- The HLS video starts muted and doesn't block render; if it fails it shows the last frame (`/api/shells/:id/frame`).
