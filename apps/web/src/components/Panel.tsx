import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface PanelRow {
  label: string;
  value: ReactNode;
}

interface PanelProps {
  label: string;
  aside?: ReactNode;
  rows?: PanelRow[];
  /** Pulsing marker next to the label: the panel shows live data. */
  live?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Bench panel: a dark instrument module with a mono header row. Hosts the console and the live block. */
export function Panel({ label, aside, rows = [], live = false, children, footer, className }: PanelProps) {
  return (
    <section className={cn('on-bench flex flex-col border border-bench-rule bg-bench-2 text-bench-ink', className)}>
      <header className="flex items-center justify-between gap-4 border-b border-bench-rule px-5 py-3">
        <span className="flex items-center gap-2 font-mono text-mono uppercase text-bench-ink-2">
          {live && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-signal animate-status-pulse" />}
          {label}
        </span>
        {aside && <div className="font-mono text-mono text-bench-ink">{aside}</div>}
      </header>
      {rows.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-bench-rule px-5 py-5 md:grid-cols-4">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-1">
              <dt className="font-mono text-mono-xs uppercase text-bench-ink-2">{r.label}</dt>
              <dd className="tabular font-mono text-data text-bench-ink">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children && <div className="flex-1 min-h-0 px-5 py-5">{children}</div>}
      {footer && <footer className="border-t border-bench-rule px-5 py-4">{footer}</footer>}
    </section>
  );
}
