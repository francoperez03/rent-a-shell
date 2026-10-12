import type { ReactNode } from 'react';

// maneva M-HOV-02 (+ M-REV-03 via useReveals '.btn-w'): pill with label + square chip with an arrow + line behind.
// On hover the chip crosses to the other side and the pill shifts. Tokens: --chip-bg, --chip-fg, --chip-h, --chip-radius, --chip-gap.
// --mid-w = pill width (for the crossing); without `midWidth` it is estimated from the label length.
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
