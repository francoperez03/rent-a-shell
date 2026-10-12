import { cn } from '@/lib/cn';

/** landing2 section signature: small uppercase, open tracking. `index` adds the manual-style number (0.1, 0.2). */
export function Eyebrow({ children, index, dark = false, className }: { children: string; index?: string; dark?: boolean; className?: string }) {
  return (
    <p className={cn('mb-5 font-sans text-[13px] font-medium uppercase tracking-[0.14em]', dark ? 'text-white/70' : 'text-ink-mute', className)}>
      {index && <span className={cn('mr-3 font-mono', dark ? 'text-white/45' : 'text-ink-mute/70')}>{index}</span>}
      {children}
    </p>
  );
}
