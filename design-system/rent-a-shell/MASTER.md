# Rent a Shell · Design System (MASTER)

Generated with ui-ux-pro-max (`search.py --design-system --persist`) and adjusted to the product. Pages in `pages/` override this file.

**Style:** Swiss Modernism 2.0 applied to a lab instrument: strict grid, one signal accent, measurements as first-class UI. Warm paper for reading surfaces; a warm near-black "bench" only where live video and controls live.

## Global Rules

### Color Palette (OKLCH is canonical; hex for tools)

| Role | OKLCH | Hex | Variable | Use |
|---|---|---|---|---|
| Paper | `oklch(96.5% 0.012 85)` | `#F7F3EB` | `--paper` | page background |
| Paper 2 | `oklch(93.5% 0.014 85)` | `#EEE9DF` | `--paper-2` | wells, table stripes, selected rows |
| Ink | `oklch(18% 0.01 60)` | `#15110D` | `--ink` | headings, strong text, text on signal |
| Ink 2 | `oklch(38% 0.012 60)` | `#47413C` | `--ink-2` | body |
| Ink 3 | `oklch(52% 0.012 60)` | `#6E6762` | `--ink-3` | muted labels (4.99:1 on paper) |
| Rule | `oklch(84% 0.012 80)` | `#CFCAC2` | `--rule` | hairlines, grid dots |
| Rule 2 | `oklch(72% 0.014 80)` | `#A9A49B` | `--rule-2` | strong rules, secondary button border |
| Signal | `oklch(66% 0.21 40)` | `#F65400` | `--signal` | primary CTA fill, live/online marks, selection (UI only, 3.07:1 on paper) |
| Signal deep | `oklch(52% 0.19 40)` | `#BC2D00` | `--signal-deep` | links and signal **text** on paper (5.41:1), hover of primary |
| OK | `oklch(62% 0.15 150)` | `#2E9E52` | `--ok` | online dot (UI only) |
| OK deep | `oklch(45% 0.13 150)` | | `--ok-deep` | "online" as text on paper |
| Warn | `oklch(75% 0.16 80)` | `#E2A000` | `--warn` | queued, about to expire (bench surfaces) |
| Danger | `oklch(55% 0.2 28)` | `#CC2823` | `--danger` | STOP, errors (4.85:1 on paper) |
| Bench | `oklch(16% 0.012 60)` | `#110C08` | `--bench` | console and video wells |
| Bench 2 | `oklch(22% 0.012 60)` | `#1F1915` | `--bench-2` | panels on bench |
| Bench ink | `oklch(94% 0.01 85)` | `#EEEBE4` | `--bench-ink` | text on bench |
| Bench ink 2 | `oklch(70% 0.012 85)` | `#A29E96` | `--bench-ink-2` | muted on bench (7.27:1) |
| Bench rule | `oklch(32% 0.012 60)` | `#38322D` | `--bench-rule` | rules on bench |

Rules: one accent. Signal never fills large areas except the hero band. Text on signal is **ink**, never white (white on signal is 3.3:1). Status colors are for dots and bars; as text, use the `-deep` variant or ink.

### Typography

- **Sans (display + UI + body):** Archivo, variable `wdth 62..125`, `wght 400..800`. Display uses `font-stretch: 112%` and weight 700; UI uses 100% and 500/600.
- **Mono (data, labels, code):** Martian Mono 400/500. Letter-spacing 0.02em. Uppercase only for labels of three words or fewer.
- **Google Fonts:** `Archivo:wdth,wght@62..125,400..800` and `Martian+Mono:wght@400;500`.
- **Scale (fixed rem, 1.25 ratio; display is fluid):**

| Token | Size / line-height | Family | Use |
|---|---|---|---|
| `display` | `clamp(2.75rem, 6vw, 5.5rem)` / 0.98, tracking -0.02em | Archivo 700, wdth 112 | landing hero |
| `h1` | `clamp(2rem, 3.6vw, 3.25rem)` / 1.04, -0.015em | Archivo 700, wdth 106 | page titles |
| `h2` | `1.75rem` / 1.15, -0.01em | Archivo 600 | section titles |
| `h3` | `1.25rem` / 1.3 | Archivo 600 | card titles |
| `lead` | `1.25rem` / 1.5 | Archivo 400 | hero paragraph |
| `body` | `1.0625rem` / 1.6 | Archivo 400 | prose, max 68ch |
| `small` | `0.9375rem` / 1.5 | Archivo 400 | secondary prose |
| `data` | `1.5rem` / 1.1 | Martian Mono 500, tabular | readouts |
| `data-lg` | `clamp(2.5rem, 5vw, 4rem)` / 1 | Martian Mono 500 | hero numbers, price |
| `mono` | `0.8125rem` / 1.5, +0.02em | Martian Mono 400 | labels, meta, code |

### Spacing

8px base unit. Section padding `clamp(64px, 10vw, 128px)`. Gutters 16px (mobile) / 24px (desktop). Container 1280px. Grid 12 columns.

### Rules, radius and depth

- Depth comes from rules (`--rule`) and paper-2 fills. No box shadows except the STOP button on mobile (a hard 0 4px 0 bench shadow).
- Radius: 2px on buttons and inputs, 0 on panels and tables.
- Datasheet texture: a 24px dot grid in `--rule` at 60% behind the hero and the live panel.

## Component Specs

### Button

- Shape: rectangle, radius 2px, height 44px (40px small), padding 0 20px, label Martian Mono 0.8125rem 500 uppercase 0.04em.
- Primary: fill `--signal`, text `--ink`; hover fill `--signal-deep`, text `--signal-ink`; active translate 1px; focus ring 2px `--ink` offset 2px.
- Secondary: 1px border `--rule-2`, text `--ink`; hover border `--ink`.
- Ghost: no border, text `--ink-2`, hover text `--ink` and underline.
- Danger (STOP): fill `--danger`, text `--signal-ink`, height 56px.
- On bench surfaces: primary unchanged; secondary border `--bench-rule`, text `--bench-ink`.
- States: disabled 40% opacity and `cursor-not-allowed`; loading swaps the label for "Working…" and keeps width.

### Readout

Mono value with unit: value in `data` size, unit in `mono` size `--ink-3`, label above in `mono` uppercase. `live` variant adds a pulsing `--signal` dot.

### Panel (bench)

Fill `--bench-2`, 1px border `--bench-rule`, header row in mono with a label and an aside, body padding 24px. Used for the console and the live block.

### Table

Header mono uppercase `--ink-3`, rows separated by `--rule`, zebra `--paper-2`, numeric columns right-aligned tabular.

### Field

Input 44px, 1px border `--rule-2`, radius 2px, paper background, focus border `--ink` + ring. Label mono above; error text `--danger` below with the cause and the action.

## Style Guidelines

- Numbers, units and ticks carry the brand. Every page shows at least one real measurement.
- One strong kicker per page; section numbering (`01`, `02`) in mono instead of repeated eyebrows.
- Motion: 240ms reveals on landing sections, 150 to 250ms on product surfaces, `status-pulse` for live. No cursor effects, no smooth scroll library, no 3D.
- Imagery: the live camera is the hero image. When offline, the well shows the last frame or a "no signal" readout, never a gradient.

## Anti-Patterns (Do NOT Use)

- Serif display, italic affectation, navy backgrounds.
- White text on signal orange.
- Neon green on black, mono everywhere.
- Gradients, glassmorphism, glow, blurred blobs.
- Rounded icon tiles above headings; three equal cards with icons.
- Repeated tiny tracked eyebrows on every section.
- Arbitrary `text-[NNpx]` classes; use the scale.

## Pre-Delivery Checklist

- [ ] Contrast: text ≥ 4.5:1, UI ≥ 3:1 (see table above).
- [ ] Focus visible everywhere; keyboard console works.
- [ ] 390 / 768 / 1024 / 1512 with no horizontal scroll.
- [ ] `prefers-reduced-motion` removes reveals and roll.
- [ ] No emoji icons; SVG only (Phosphor).
- [ ] Landing chunk under 300 kB.
