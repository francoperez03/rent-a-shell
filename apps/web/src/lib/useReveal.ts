import type { MotionProps } from 'framer-motion';
import { useReducedMotion } from './useReducedMotion';
import { dur, easeOut } from './motion';

/** Reveal on entering the viewport (opacity + 12px). With reduced motion it just appears. */
export function useReveal() {
  const reduced = useReducedMotion();
  return (delay = 0): MotionProps =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-10% 0px -10% 0px' },
          transition: { duration: dur.base, ease: easeOut, delay },
        };
}
