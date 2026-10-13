import type { MotionProps } from 'framer-motion';
import { useReducedMotion } from './useReducedMotion';
import { dur, easeOut } from './motion';

const viewport = { once: true, margin: '-10% 0px -10% 0px' } as const;

/** Reveal on entering the viewport (opacity + 12px). With reduced motion it just appears. */
export function useReveal() {
  const reduced = useReducedMotion();
  return (delay = 0): MotionProps =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          whileInView: { opacity: 1, y: 0 },
          viewport,
          transition: { duration: dur.base, ease: easeOut, delay },
        };
}

/** Row reveal for lists and terminal output: each line slides in from the left, one after the other. */
export function useRows() {
  const reduced = useReducedMotion();
  return (i: number, base = 0): MotionProps =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, x: -6 },
          whileInView: { opacity: 1, x: 0 },
          viewport,
          transition: { duration: dur.base, ease: easeOut, delay: base + i * 0.06 },
        };
}
