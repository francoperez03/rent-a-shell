import { Fragment, type ReactNode } from 'react';

// Manual split (SplitText equivalent): words in .word, chars in .char. No dependency.
export function Words({ text, className = '' }: { text: string; className?: string }) {
  return (
    <>
      {text.split(' ').map((w, i) => (
        <Fragment key={i}>
          <span className={`word inline-block ${className}`}>{w}</span>{' '}
        </Fragment>
      ))}
    </>
  );
}

// M-HOV-01: text duplicated per char for the hover roll (CSS in motion-kit.css: .roll)
export function Roll({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`roll ${className}`}>
      {/* rent-a-shell: real text for screen readers (aria-label on a span does not name the link) */}
      <span className="sr-only">{text}</span>
      {[...text].map((c, i) => (
        <span key={i} className={`ch${c === ' ' ? ' sp' : ''}`} style={{ ['--i' as string]: i }} aria-hidden>
          <span>{c === ' ' ? ' ' : c}</span>
          <span>{c === ' ' ? ' ' : c}</span>
        </span>
      ))}
    </span>
  );
}

// Chars: the space goes as nbsp; a ' ' inside an inline-block collapses and glues the words.
export function Chars({ text, className = '' }: { text: string; className?: string }): ReactNode {
  return (
    <>
      {[...text].map((c, i) => (
        <span key={i} className={`char inline-block ${className}`}>{c === ' ' ? '\u00a0' : c}</span>
      ))}
    </>
  );
}

// maneva M-REV-02: each word in its mask (.words-clip) for the yPercent 100 → 0 of useReveals('.words-in').
// Leaves an sr-only copy of the text (like SplitText in the ref) for screen readers and so the compare matches.
export function WordsIn({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`words-in ${className}`}>
      {text.split(' ').map((w, i) => (
        <Fragment key={i}>
          <span className="words-clip"><span className="word">{w}</span></span>{' '}
        </Fragment>
      ))}
      <span className="sr-only">{text}</span>
    </span>
  );
}

// uplink M-HOV-01: duplicated label; on hover (its own or of a .swap-parent ancestor) it rises one line. CSS: .swap-label (motion-kit.css)
export function SwapLabel({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`swap-label ${className}`}>
      <span>{text}</span>
      <span aria-hidden>{text}</span>
    </span>
  );
}
