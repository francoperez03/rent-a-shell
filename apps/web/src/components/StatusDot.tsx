import type { ShellStatus } from '@ras/shell-spec';
import { cn } from '@/lib/cn';

const LABEL: Record<ShellStatus, string> = { online: 'Online', busy: 'In use', offline: 'Offline' };

/** Shell status. One accent: online pulses, in use stays solid, offline is dimmed. */
export function StatusDot({ status, className }: { status: ShellStatus | undefined; className?: string }) {
  const s = status ?? 'offline';
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em]', className)}>
      <span
        aria-hidden
        className={cn(
          'h-2 w-2 rounded-full',
          s === 'online' && 'animate-status-pulse bg-accent',
          s === 'busy' && 'bg-accent',
          s === 'offline' && 'bg-white/30'
        )}
      />
      {LABEL[s]}
    </span>
  );
}
