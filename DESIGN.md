---
name: Rent a Shell
description: Real hardware by the minute, designed like a lab instrument datasheet
colors:
  paper: "#F7F3EB"
  paper-2: "#EEE9DF"
  ink: "#15110D"
  ink-2: "#47413C"
  ink-3: "#6E6762"
  rule: "#CFCAC2"
  rule-2: "#A9A49B"
  signal: "#F65400"
  signal-deep: "#BC2D00"
  signal-ink: "#FCFCFC"
  ok: "#2E9E52"
  ok-deep: "#1F7A3C"
  warn: "#E2A000"
  danger: "#CC2823"
  bench: "#110C08"
  bench-2: "#1F1915"
  bench-ink: "#EEEBE4"
  bench-ink-2: "#A29E96"
  bench-rule: "#38322D"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 6vw, 5.5rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.02em"
  h1:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(2rem, 3.6vw, 3.25rem)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.015em"
  h2:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  h3:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0"
  lead:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0"
  data:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "0"
  mono:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.02em"
rounded:
  none: "0px"
  sm: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
  section: "clamp(64px, 10vw, 128px)"
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "{colors.signal-deep}"
    textColor: "{colors.signal-ink}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "0 20px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.signal-ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    height: "56px"
    padding: "0 24px"
  panel:
    backgroundColor: "{colors.bench-2}"
    textColor: "{colors.bench-ink}"
    rounded: "{rounded.none}"
    padding: "24px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "0 12px"
---

## Overview

Rent a Shell rents real robots by the minute to small hardware teams and their AI agents. The interface borrows from a 1975 instrument datasheet: warm paper, near-black ink, a single orange signal, a technical grotesk for words and a wide monospace for numbers. Measurements (angles, milliamps, seconds, dollars) are the main visual material. Reading surfaces are paper; the session console and the camera wells are a warm near-black "bench".

References: Braun and Teenage Engineering instrument panels, HP datasheets, Klim-style single-orange commitment. Registers: brand for landing, shell, agents and 404; product for checkout and the console.

## Colors

OKLCH is canonical (`apps/web/src/styles/globals.css`); the frontmatter carries sRGB hex for tools.

- Paper `oklch(96.5% 0.012 85)` and Paper 2 `oklch(93.5% 0.014 85)` for pages, wells and zebra rows.
- Ink `oklch(18% 0.01 60)`, Ink 2 `oklch(38% 0.012 60)`, Ink 3 `oklch(52% 0.012 60)`: headings, body, muted. Ink 3 on paper is 4.99:1.
- Rule `oklch(84% 0.012 80)` and Rule 2 `oklch(72% 0.014 80)`: hairlines, dot grid, borders.
- Signal `oklch(66% 0.21 40)`: the only accent. Fills primary buttons and marks live state. Text on it is ink (5.2:1); white on signal fails. Signal deep `oklch(52% 0.19 40)` is the text and link variant on paper (5.41:1) and the hover fill.
- OK `oklch(62% 0.15 150)` for dots; OK deep `oklch(45% 0.13 150)` when "online" is text. Warn `oklch(75% 0.16 80)` on bench for queued and about-to-expire. Danger `oklch(55% 0.2 28)` for STOP and errors.
- Bench `oklch(16% 0.012 60)`, Bench 2 `oklch(22% 0.012 60)`, Bench ink `oklch(94% 0.01 85)`, Bench ink 2 `oklch(70% 0.012 85)` (7.27:1), Bench rule `oklch(32% 0.012 60)`.

Strategy: committed on the accent (one signal band in the hero), restrained elsewhere. Status colors are never used as decoration.

## Typography

Archivo (variable width and weight) carries display, headings, UI and body. Display headings use `font-stretch: 112%`, weight 700 and tracking -0.02em; page titles 106%; UI 100%. Martian Mono carries every number, label, unit and code block, with `font-variant-numeric: tabular-nums` on readouts. Body copy caps at 68ch. Uppercase appears only on mono labels of three words or fewer. The scale is fixed in rem with a 1.25 ratio; only display and h1 are fluid.

## Elevation

Flat. Depth comes from rules and paper-2 fills, never from shadows or blur. Bench panels sit on bench with a 1px bench-rule border. The single exception is the mobile STOP button, which carries a hard offset shadow so it reads as a physical key. Focus rings are 2px ink (paper) or 2px bench-ink (bench) with a 2px offset.

## Components

- **Button:** rectangle, 2px radius, 44px tall, mono uppercase label. Primary fills signal with ink text and darkens to signal deep on hover. Secondary is a rule-2 outline. Ghost is text only. Danger (STOP) is 56px and fills danger. Disabled is 40% opacity. Loading keeps the width and swaps the label.
- **Readout:** label (mono uppercase, ink 3), value (data size, tabular), unit (mono, ink 3). `live` adds a pulsing signal dot.
- **SectionIndex:** mono number (`01`) + sans title + optional body, with a top rule. Replaces eyebrows.
- **Panel:** bench-2 surface with a mono header row (label left, aside right) and a 24px body. Hosts the console and the live block.
- **Table:** mono uppercase header, rule separators, paper-2 zebra, right-aligned numeric columns.
- **Field:** 44px input with rule-2 border, mono label above, danger error text below stating cause and action.
- **LiveVideo:** bench well with tick marks on the frame and a mono badge; offline shows a "no signal" readout.
- **StatusDot:** ok (online), signal (busy/live), ink 3 (offline).

Motion: reveals of 240ms on landing sections only; 150 to 250ms transitions on product surfaces; `status-pulse` for live markers. Reduced motion disables all of it.

## Do's and Don'ts

- Do show a real measurement on every page; do right-align numbers; do use ink on signal.
- Do keep the console dense and the landing airy.
- Don't use serif display, navy, gradients, glass, glow or 3D blobs.
- Don't put white text on signal; don't use status colors as text without the deep variant.
- Don't repeat tracked eyebrows on every section; don't add icon tiles above headings.
- Don't use arbitrary pixel type sizes; use the scale.
