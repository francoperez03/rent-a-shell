import type { ReactNode } from 'react';
import { motion, type MotionProps } from 'framer-motion';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { dur, easeOut } from '@/lib/motion';

interface SectionIndexProps {
  /** Datasheet section number, e.g. "01". Omit for an unnumbered section. */
  index?: string;
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
  const reduced = useReducedMotion();
  const paragraphs = Array.isArray(body) ? body : body ? [body] : [];
  return (
    <motion.header {...(anim ?? {})} className={cn('relative border-t pt-4', bench ? 'border-bench-rule' : 'border-rule', className)}>
      {/* the rule draws itself left to right when the section scrolls in, like a plotter */}
      {anim && !reduced && (
        <motion.span
          aria-hidden
          className={cn('absolute -top-px left-0 h-px w-full origin-left', bench ? 'bg-bench-ink' : 'bg-ink')}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, margin: '-10% 0px -10% 0px' }}
          transition={{ duration: dur.medium * 2, ease: easeOut }}
        />
      )}
      <div className={cn('grid grid-cols-1 gap-x-8 gap-y-3', index ? 'md:grid-cols-[6rem_1fr_auto]' : 'md:grid-cols-[1fr_auto]')}>
        {index && <span className={cn('font-mono text-data tabular leading-none md:pt-1', bench ? 'text-bench-ink' : 'text-ink')}>{index}</span>}
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
