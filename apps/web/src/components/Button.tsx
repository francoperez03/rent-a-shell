import { forwardRef } from 'react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import Link, { type LinkProps } from 'next/link';
import { cn } from '@/lib/cn';
import { Roll } from '@/motion-kit/split';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Surface = 'paper' | 'bench';
type Size = 'md' | 'sm' | 'lg';

interface CommonProps {
  variant?: Variant;
  /** Surface the button sits on: adjusts outline and text colors for contrast. */
  surface?: Surface;
  size?: Size;
  /** Label. With `roll` it does the per-character roll on hover. */
  label: string;
  roll?: boolean;
  /** Keeps the width and swaps the label while a request is in flight. */
  loading?: boolean;
  className?: string;
}

/** Instrument key: rectangle, 2px radius, mono uppercase label. Primary is signal with ink text. */
function classesFor(variant: Variant, surface: Surface): string {
  switch (variant) {
    case 'primary':
      return 'bg-signal text-ink hover:bg-signal-deep hover:text-signal-ink';
    case 'danger':
      return 'bg-danger text-signal-ink hover:brightness-110';
    case 'ghost':
      return surface === 'bench' ? 'text-bench-ink-2 hover:text-bench-ink hover:underline' : 'text-ink-2 hover:text-ink hover:underline';
    default:
      return surface === 'bench'
        ? 'border border-bench-rule text-bench-ink hover:border-bench-ink'
        : 'border border-rule-2 text-ink hover:border-ink';
  }
}

const SIZES: Record<Size, string> = { sm: 'h-10 px-4 text-mono-xs', md: 'h-11 px-5 text-mono', lg: 'h-14 px-6 text-mono' };

const base =
  'roll-parent inline-flex items-center justify-center gap-2 rounded-sm font-mono font-medium uppercase select-none whitespace-nowrap transition-[color,background-color,border-color] duration-base ease-out active:translate-y-px disabled:pointer-events-none disabled:border disabled:border-rule-2 disabled:bg-paper-2 disabled:text-ink-3';

type ButtonProps = CommonProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { as?: 'button' };
type AnchorProps = CommonProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & { as: 'a'; href: string };
type RouterProps = CommonProps & Omit<LinkProps, 'children'> & { as: 'link'; href: string };

export const Button = forwardRef<HTMLElement, ButtonProps | AnchorProps | RouterProps>(
  ({ variant = 'primary', surface = 'paper', size = 'md', label, roll = true, loading = false, className, ...rest }, ref) => {
    const classes = cn(base, SIZES[size], classesFor(variant, surface), surface === 'bench' && 'on-bench', className);
    const text = loading ? 'Working…' : label;
    const children = roll && !loading ? <Roll text={text} /> : text;

    if (rest.as === 'a') {
      const { as: _as, ...p } = rest;
      return <a ref={ref as React.Ref<HTMLAnchorElement>} className={classes} {...p}>{children}</a>;
    }
    if (rest.as === 'link') {
      const { as: _as, ...p } = rest;
      return <Link ref={ref as React.Ref<HTMLAnchorElement>} className={classes} {...p}>{children}</Link>;
    }
    const { as: _as, disabled, ...p } = rest;
    return (
      <button ref={ref as React.Ref<HTMLButtonElement>} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...p}>
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
