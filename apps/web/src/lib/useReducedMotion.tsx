import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useReducedMotion as useReducedMotionFM } from 'framer-motion';

/**
 * Movimiento reducido = preferencia del sistema OR override manual del usuario.
 * Patek expone un toggle "Reduce motion" en el footer; replicamos ese control
 * además de respetar `prefers-reduced-motion`.
 */
interface MotionPrefContextValue {
  /** Estado efectivo: sistema OR override. Consumir esto para decidir si animar. */
  reduced: boolean;
  /** Solo el override manual del usuario (para reflejar el estado del toggle). */
  manualReduced: boolean;
  setManualReduced: (v: boolean) => void;
}

const MotionPrefContext = createContext<MotionPrefContextValue | null>(null);

export function MotionPrefProvider({ children }: { children: ReactNode }) {
  const systemReduced = useReducedMotionFM() ?? false;
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

/** Estado efectivo de movimiento reducido. */
export function useReducedMotion(): boolean {
  const ctx = useContext(MotionPrefContext);
  // Fallback si se usa fuera del provider (ej. tests).
  const systemReduced = useReducedMotionFM() ?? false;
  return ctx ? ctx.reduced : systemReduced;
}

/** Control del toggle manual (footer). */
export function useMotionToggle(): { manualReduced: boolean; toggle: () => void } {
  const ctx = useContext(MotionPrefContext);
  if (!ctx) throw new Error('useMotionToggle must be used within <MotionPrefProvider>');
  const { manualReduced, setManualReduced } = ctx;
  const toggle = useCallback(() => setManualReduced(!manualReduced), [manualReduced, setManualReduced]);
  return { manualReduced, toggle };
}
