import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The custom type scale (tailwind.config.ts fontSize). Without this, twMerge reads `text-h2` as a color and
// drops it whenever a `text-ink` follows: every SectionIndex heading rendered at body size.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display', 'h1', 'h2', 'h3', 'lead', 'body', 'small', 'data-lg', 'data', 'mono', 'mono-xs'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
