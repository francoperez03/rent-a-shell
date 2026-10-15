import type { Config } from 'tailwindcss';

// Tokens live in src/styles/globals.css (OKLCH); DESIGN.md documents them.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        'paper-2': 'var(--paper-2)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        rule: 'var(--rule)',
        'rule-2': 'var(--rule-2)',
        signal: 'var(--signal)',
        'signal-deep': 'var(--signal-deep)',
        'signal-ink': 'var(--signal-ink)',
        ok: 'var(--ok)',
        'ok-deep': 'var(--ok-deep)',
        warn: 'var(--warn)',
        danger: 'var(--danger)',
        bench: 'var(--bench)',
        'bench-2': 'var(--bench-2)',
        'bench-ink': 'var(--bench-ink)',
        'bench-ink-2': 'var(--bench-ink-2)',
        'bench-rule': 'var(--bench-rule)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      // Fixed scale (1.25); only display and h1 are fluid. Pair with .wide-112 / .wide-106 for stretch.
      fontSize: {
        display: ['clamp(2.75rem, 6vw, 5.5rem)', { lineHeight: '0.98', letterSpacing: '-0.02em', fontWeight: '700' }],
        h1: ['clamp(2rem, 3.6vw, 3.25rem)', { lineHeight: '1.04', letterSpacing: '-0.015em', fontWeight: '700' }],
        h2: ['1.75rem', { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '600' }],
        h3: ['1.25rem', { lineHeight: '1.3', fontWeight: '600' }],
        lead: ['1.25rem', { lineHeight: '1.5' }],
        body: ['1.0625rem', { lineHeight: '1.6' }],
        small: ['0.9375rem', { lineHeight: '1.5' }],
        'data-lg': ['clamp(2.5rem, 5vw, 4rem)', { lineHeight: '1.15', fontWeight: '500' }],
        data: ['1.5rem', { lineHeight: '1.1', fontWeight: '500' }],
        mono: ['0.8125rem', { lineHeight: '1.5', letterSpacing: '0.02em' }],
        'mono-xs': ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.04em' }],
      },
      maxWidth: {
        container: '1280px',
        prose: '68ch',
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        md: '4px',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '240ms',
        medium: '400ms',
      },
      spacing: {
        section: 'clamp(64px, 10vw, 128px)',
      },
    },
  },
  plugins: [],
};

export default config;
