import type { MotionProps } from 'framer-motion';
import { useReducedMotion } from './useReducedMotion';
import { dur, easeOut } from './motion';

/** landing2 reveal on entering the viewport (opacity + y). With reduced motion: nothing, it just appears. */
export function useReveal() {
  const reduced = useReducedMotion();
  return (delay = 0): MotionProps =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-10% 0px -10% 0px' },
          transition: { duration: dur.medium, ease: easeOut, delay },
        };
}
