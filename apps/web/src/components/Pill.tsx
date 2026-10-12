import { forwardRef } from 'react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Roll } from '@/motion-kit/split';

type Variant = 'primary' | 'secondary';
type Surface = 'dark' | 'light';

interface CommonProps {
  variant?: Variant;
  /** Surface the pill sits on: adjusts colors for contrast. */
  surface?: Surface;
  /** CTA text. With `roll` it does the motion-kit per-character roll on hover. */
  label: string;
  roll?: boolean;
  className?: string;
}

/** landing2 CTA: pill, uppercase, subtle tracking. The primary one uses the accent. */
function classesFor(variant: Variant, surface: Surface): string {
  if (variant === 'primary') return 'bg-accent text-accent-ink hover:bg-accent-hover';
  return surface === 'dark'
    ? 'border border-white/35 text-white hover:border-white/70 hover:bg-white/5'
    : 'border border-hairline-strong text-ink hover:border-ink/50 hover:bg-ink/5';
}

const base =
  'roll-parent inline-flex items-center justify-center h-11 px-6 rounded-pill font-sans text-[13px] font-medium uppercase tracking-[0.08em] select-none transition-colors duration-base ease-out-quint active:scale-[0.985] focus-visible:outline-offset-4 disabled:opacity-40 disabled:pointer-events-none';

type ButtonProps = CommonProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { as?: 'button' };
type AnchorProps = CommonProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & { as: 'a'; href: string };
type RouterProps = CommonProps & Omit<LinkProps, 'children'> & { as: 'link' };

export const Pill = forwardRef<HTMLElement, ButtonProps | AnchorProps | RouterProps>(
  ({ variant = 'primary', surface = 'dark', label, roll = true, className, ...rest }, ref) => {
    const classes = cn(base, classesFor(variant, surface), className);
    const children = roll ? <Roll text={label} /> : label;

    if (rest.as === 'a') {
      const { as: _as, ...p } = rest;
      return <a ref={ref as React.Ref<HTMLAnchorElement>} className={classes} {...p}>{children}</a>;
    }
    if (rest.as === 'link') {
      const { as: _as, ...p } = rest;
      return <Link ref={ref as React.Ref<HTMLAnchorElement>} className={classes} {...p}>{children}</Link>;
    }
    const { as: _as, ...p } = rest;
    return <button ref={ref as React.Ref<HTMLButtonElement>} className={classes} {...p}>{children}</button>;
  }
);

Pill.displayName = 'Pill';
