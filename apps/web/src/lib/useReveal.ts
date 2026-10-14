import type { MotionProps } from 'framer-motion';
import { useReducedMotion } from './useReducedMotion';
import { dur, easeOut } from './motion';

const viewport = { once: true, margin: '-10% 0px -10% 0px' } as const;

/**
 * Reveal (opacity + 12px). With reduced motion it just appears (same props, zero duration: the server HTML
 * always carries the initial state, and the preference is only known after mount).
 * 'view': when the element scrolls into the viewport. 'mount': right away, for above-the-fold blocks
 * (the hero arrived empty on phones after navigating back from /session: the in-view observer never fired).
 */
export function useReveal() {
  const reduced = useReducedMotion();
  return (delay = 0, on: 'view' | 'mount' = 'view'): MotionProps => {
    const transition = reduced ? { duration: 0, delay: 0 } : { duration: dur.base, ease: easeOut, delay };
    return on === 'mount'
      ? { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition }
      : { initial: { opacity: 0, y: 12 }, whileInView: { opacity: 1, y: 0 }, viewport, transition };
  };
}

/** Row reveal for lists and terminal output: each line slides in from the left, one after the other. */
export function useRows() {
  const reduced = useReducedMotion();
  return (i: number, base = 0): MotionProps => ({
    initial: { opacity: 0, x: -6 },
    whileInView: { opacity: 1, x: 0 },
    viewport,
    transition: reduced ? { duration: 0, delay: 0 } : { duration: dur.base, ease: easeOut, delay: base + i * 0.06 },
  });
}
