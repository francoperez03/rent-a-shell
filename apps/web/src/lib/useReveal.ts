import type { MotionProps } from 'framer-motion';
import { useReducedMotion } from './useReducedMotion';
import { dur, easeOut } from './motion';

/** Reveal de landing2 al entrar en viewport (opacity + y). Con reduced motion: nada, aparece directo. */
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
