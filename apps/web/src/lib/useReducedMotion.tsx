'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Reduced motion = system preference OR the user's manual override.
 * Patek exposes a "Reduce motion" toggle in the footer; we replicate that control
 * on top of honoring `prefers-reduced-motion`.
 */
interface MotionPrefContextValue {
  /** Effective state: system OR override. Read this to decide whether to animate. */
  reduced: boolean;
  /** Only the user's manual override (to reflect the toggle state). */
  manualReduced: boolean;
  setManualReduced: (v: boolean) => void;
}

const MotionPrefContext = createContext<MotionPrefContextValue | null>(null);

const QUERY = '(prefers-reduced-motion: reduce)';

/** System preference, read after mount so the first client render matches the server HTML (which cannot know it). */
function useSystemReduced(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

export function MotionPrefProvider({ children }: { children: ReactNode }) {
  const systemReduced = useSystemReduced();
  const [manualReduced, setManualReduced] = useState(false);

  const value = useMemo<MotionPrefContextValue>(
    () => ({
      reduced: systemReduced || manualReduced,
      manualReduced,
      setManualReduced,
    }),
    [systemReduced, manualReduced]
  );

  return <MotionPrefContext.Provider value={value}>{children}</MotionPrefContext.Provider>;
}

/** Effective reduced-motion state. */
export function useReducedMotion(): boolean {
  const ctx = useContext(MotionPrefContext);
  // Fallback when used outside the provider (e.g. tests).
  const systemReduced = useSystemReduced();
  return ctx ? ctx.reduced : systemReduced;
}

/** Manual toggle control (footer). */
export function useMotionToggle(): { manualReduced: boolean; toggle: () => void } {
  const ctx = useContext(MotionPrefContext);
  if (!ctx) throw new Error('useMotionToggle must be used within <MotionPrefProvider>');
  const { manualReduced, setManualReduced } = ctx;
  const toggle = useCallback(() => setManualReduced(!manualReduced), [manualReduced, setManualReduced]);
  return { manualReduced, toggle };
}
