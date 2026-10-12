import { Fragment, type ReactNode } from 'react';

// Split manual (equivalente a SplitText): palabras en .word, chars en .char. Sin dependencia.
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

// M-HOV-01: texto duplicado por char para el roll en hover (CSS en motion-kit.css: .roll)
export function Roll({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`roll ${className}`}>
      {/* rent-a-shell: texto real para lectores de pantalla (aria-label en un span no da nombre al link) */}
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

// Chars: el espacio va como nbsp; un ' ' dentro de un inline-block colapsa y pega las palabras.
export function Chars({ text, className = '' }: { text: string; className?: string }): ReactNode {
  return (
    <>
      {[...text].map((c, i) => (
        <span key={i} className={`char inline-block ${className}`}>{c === ' ' ? '\u00a0' : c}</span>
      ))}
    </>
  );
}

// maneva M-REV-02: cada palabra en su máscara (.words-clip) para el yPercent 100 → 0 de useReveals('.words-in').
// Deja una copia sr-only del texto (como SplitText en la ref) para lectores de pantalla y para que el compare matchee.
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

// uplink M-HOV-01: label duplicado; en hover (propio o de un ancestro .swap-parent) sube una línea. CSS: .swap-label (motion-kit.css)
export function SwapLabel({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`swap-label ${className}`}>
      <span>{text}</span>
      <span aria-hidden>{text}</span>
    </span>
  );
}
