import { motion } from 'framer-motion';
import type { MotionProps } from 'framer-motion';
import { cn } from '@/lib/cn';

interface SectionHeadingProps {
  title: string;
  body?: string | string[];
  /** 'display': hero and closing. 'section': everything else. */
  size?: 'display' | 'section';
  tone?: 'light' | 'dark';
  /** Entry props per block by delay (each section orchestrates its reveal). */
  anim?: (delay: number) => MotionProps;
}

const TITLE_SIZE = {
  display: 'clamp(2.5rem, 5vw, 4.25rem)',
  section: 'clamp(2.25rem, 4vw, 3.5rem)',
};

/** landing2 heading: Fraunces light title and Plex body paragraphs. */
export function SectionHeading({ title, body, size = 'section', tone = 'light', anim = () => ({}) }: SectionHeadingProps) {
  const dark = tone === 'dark';
  const paragraphs = body === undefined ? [] : Array.isArray(body) ? body : [body];
  return (
    <div>
      <motion.h2
        {...anim(0)}
        className={cn('font-display font-light tracking-[-0.01em] [text-wrap:balance]', dark ? 'text-white' : 'text-ink')}
        style={{ fontSize: TITLE_SIZE[size], lineHeight: 1.04 }}
      >
        {title}
      </motion.h2>
      {paragraphs.map((text, i) => (
        <motion.p
          key={i}
          {...anim(0.14 + i * 0.06)}
          className={cn(
            'max-w-[60ch] text-[1.125rem] font-light leading-[1.55] [text-wrap:pretty]',
            dark ? 'text-white/80' : 'text-ink-soft',
            i > 0 ? 'mt-4' : 'mt-6'
          )}
        >
          {text}
        </motion.p>
      ))}
    </div>
  );
}
