import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}', './src/motion-kit/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-inset': 'var(--bg-inset)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        'ink-mute': 'var(--ink-mute)',
        hairline: 'var(--hairline)',
        'hairline-strong': 'var(--hairline-strong)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-ink': 'var(--accent-ink)',
        alert: 'var(--alert)',
        'alert-dark': 'var(--alert-on-dark)',
        signal: 'var(--signal)',
        grid: 'var(--grid)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        'display-xl': ['6rem', { lineHeight: '0.95', letterSpacing: '-0.03em' }],
        'display-l': ['4.5rem', { lineHeight: '1.0', letterSpacing: '-0.025em' }],
        'display-m': ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display-s': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'body-xl': ['1.5rem', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        'body-l': ['1.25rem', { lineHeight: '1.5' }],
        'body-m': ['1.0625rem', { lineHeight: '1.6' }],
        'body-s': ['0.9375rem', { lineHeight: '1.55' }],
        eyebrow: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.2em' }],
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
        '16': '64px',
        '20': '80px',
        '24': '96px',
        '32': '128px',
        '40': '160px',
        '48': '192px',
      },
      maxWidth: {
        container: '1280px',
        prose: '65ch',
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '20px',
        '2xl': '28px',
        pill: '9999px',
      },
      transitionTimingFunction: {
        'out-quint': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-quint': 'cubic-bezier(0.65, 0, 0.35, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        fast: '180ms',
        base: '320ms',
        medium: '560ms',
        slow: '900ms',
      },
      backgroundImage: {
        grid: 'linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '24px 24px',
      },
    },
  },
  plugins: [],
};

export default config;
