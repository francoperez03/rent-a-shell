import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * landing2 telemetry panel: a control-room module. Subtle grid, Plex Mono,
 * hairlines and a status dot. Here it also takes `children` (the console lives inside).
 */
export interface TelemetryRow {
  label: string;
  value: ReactNode;
}

interface TelemetryPanelProps {
  label: string;
  /** Text on the right of the header (e.g. session clock). */
  aside?: ReactNode;
  rows?: TelemetryRow[];
  live?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function TelemetryPanel({ label, aside, rows = [], live = false, children, footer, className }: TelemetryPanelProps) {
  return (
    <div
      className={cn('relative w-full overflow-hidden border border-white/10 p-5 text-white md:p-6', className)}
      style={{ background: 'radial-gradient(120% 90% at 25% 15%, var(--panel-dark) 0%, var(--panel-dark-deep) 78%)' }}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          <pattern id="telemetry-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff" strokeOpacity="0.05" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#telemetry-grid)" />
      </svg>

      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-white/15 pb-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/60">{label}</p>
          <div className="flex items-center gap-3">
            {aside}
            <span aria-hidden className={cn('h-2 w-2 rounded-full bg-accent', live && 'animate-status-pulse')} />
          </div>
        </div>

        {rows.length > 0 && (
          <dl className="mt-4 flex flex-col">
            {rows.map((r) => (
              <div key={r.label} className="grid grid-cols-[0.85fr_1.15fr] gap-4 border-t border-white/10 py-3 first:border-t-0">
                <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/45">{r.label}</dt>
                <dd className="font-mono text-[11px] tracking-[0.06em] text-white/85">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {children}

        {footer && <div className="mt-auto border-t border-white/15 pt-5">{footer}</div>}
      </div>
    </div>
  );
}
