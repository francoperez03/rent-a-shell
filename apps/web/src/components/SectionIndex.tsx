import type { ReactNode } from 'react';
import { motion, type MotionProps } from 'framer-motion';
import { cn } from '@/lib/cn';

interface SectionIndexProps {
  /** Datasheet section number, e.g. "01". */
  index: string;
  title: string;
  body?: string | string[];
  surface?: 'paper' | 'bench';
  size?: 'h2' | 'h1';
  anim?: MotionProps;
  aside?: ReactNode;
  className?: string;
}

/** Section header in the datasheet grammar: top rule, mono index, title, optional body. Replaces repeated eyebrows. */
export function SectionIndex({ index, title, body, surface = 'paper', size = 'h2', anim, aside, className }: SectionIndexProps) {
  const bench = surface === 'bench';
  const paragraphs = Array.isArray(body) ? body : body ? [body] : [];
  return (
    <motion.header {...(anim ?? {})} className={cn('border-t pt-4', bench ? 'border-bench-rule' : 'border-rule', className)}>
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-[6rem_1fr_auto]">
        <span className={cn('font-mono text-mono tabular', bench ? 'text-bench-ink-2' : 'text-ink-3')}>{index}</span>
        <div className="max-w-prose">
          <h2 className={cn(size === 'h1' ? 'text-h1 wide-106' : 'text-h2', bench ? 'text-bench-ink' : 'text-ink')}>{title}</h2>
          {paragraphs.map((p, i) => (
            <p key={i} className={cn('mt-3 text-body', bench ? 'text-bench-ink-2' : 'text-ink-2')}>{p}</p>
          ))}
        </div>
        {aside && <div className="md:justify-self-end">{aside}</div>}
      </div>
    </motion.header>
  );
}
