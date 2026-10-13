import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ReadoutProps {
  label: string;
  value: ReactNode;
  unit?: string;
  /** Adds a pulsing signal dot: the value updates in real time. */
  live?: boolean;
  size?: 'md' | 'lg';
  surface?: 'paper' | 'bench';
  className?: string;
}

/** A measurement as UI: mono label, tabular value, unit. The core element of the instrument look. */
export function Readout({ label, value, unit, live = false, size = 'md', surface = 'paper', className }: ReadoutProps) {
  const bench = surface === 'bench';
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className={cn('flex items-center gap-2 font-mono text-mono-xs uppercase', bench ? 'text-bench-ink-2' : 'text-ink-3')}>
        {live && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-signal animate-status-pulse" />}
        {label}
      </span>
      <span className={cn('tabular font-mono', size === 'lg' ? 'text-data-lg' : 'text-data', bench ? 'text-bench-ink' : 'text-ink')}>
        {value}
        {unit && <span className={cn('font-normal', unit === '°' || unit === '%' ? 'ml-0' : 'ml-1', size === 'lg' ? 'text-data' : 'text-mono', bench ? 'text-bench-ink-2' : 'text-ink-3')}>{unit}</span>}
      </span>
    </div>
  );
}
