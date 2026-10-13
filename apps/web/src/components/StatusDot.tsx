import type { ShellStatus } from '@ras/shell-spec';
import { cn } from '@/lib/cn';

const LABEL: Record<ShellStatus, string> = { online: 'Online', busy: 'In use', offline: 'Offline' };

/** Shell status as an indicator lamp: ok pulses when online, signal when in use, dim when offline. */
export function StatusDot({ status, surface = 'paper', className }: { status: ShellStatus | undefined; surface?: 'paper' | 'bench'; className?: string }) {
  const s = status ?? 'offline';
  const bench = surface === 'bench';
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono text-mono-xs uppercase', bench ? 'text-bench-ink-2' : 'text-ink-3', className)}>
      <span
        aria-hidden
        className={cn(
          'h-2 w-2 rounded-full',
          s === 'online' && 'animate-status-pulse bg-ok',
          s === 'busy' && 'bg-signal',
          s === 'offline' && (bench ? 'bg-bench-rule' : 'bg-rule-2')
        )}
      />
      {LABEL[s]}
    </span>
  );
}
