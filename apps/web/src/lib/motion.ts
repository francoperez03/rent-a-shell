/**
 * Reusable easings and transitions. Same values as apps/landing.
 */

export const easeOut = [0.16, 1, 0.3, 1] as const;
export const easeInOut = [0.65, 0, 0.35, 1] as const;
export const easeSpring = [0.34, 1.56, 0.64, 1] as const;

export const springSoft = { type: 'spring', stiffness: 100, damping: 20 } as const;
export const springSharp = { type: 'spring', stiffness: 200, damping: 26 } as const;

export const dur = {
  fast: 0.18,
  base: 0.32,
  medium: 0.56,
  slow: 0.9,
} as const;

/** Standard block reveal: opacity + light translateY. */
export const revealUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-10% 0px -10% 0px' },
  transition: { duration: dur.medium, ease: easeOut },
};

/** Variants for child staggers. */
export const staggerParent = (stagger = 0.1, delayChildren = 0) => ({
  hidden: {},
  visible: {
    transition: {
      staggerChildren: stagger,
      delayChildren,
    },
  },
});

export const staggerChild = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: dur.medium, ease: easeOut },
  },
};
