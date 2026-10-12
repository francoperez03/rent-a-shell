import type { ReactNode } from 'react';

// maneva M-HOV-02 (+ M-REV-03 vía useReveals '.btn-w'): píldora con label + chip cuadrado con flecha + línea detrás.
// En hover el chip cruza al otro lado y la píldora se corre. Tokens: --chip-bg, --chip-fg, --chip-h, --chip-radius, --chip-gap.
// --mid-w = ancho de la píldora (para el cruce); si no se pasa `midWidth` se estima por el largo del label.
export default function ChipButton({ label, href = '#', className = '', midWidth, icon }: { label: string; href?: string; className?: string; midWidth?: number; icon?: ReactNode }) {
  return (
    <a href={href} className={`btn-w ${className}`} style={{ ['--mid-w' as string]: `${midWidth ?? Math.round(label.length * 10.5 + 34)}px` }}>
      <span className="btn-mid">{label}</span>
      <span className="btn-sq" aria-hidden>
        {icon ?? <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 6h8M6 2l4 4-4 4" /></svg>}
      </span>
      <span className="btn-line" aria-hidden />
    </a>
  );
}
