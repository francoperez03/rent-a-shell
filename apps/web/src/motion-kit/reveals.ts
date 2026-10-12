// Reveals por clase (maneva M-REV-01..05, M-SCR-08): IntersectionObserver threshold 0 = ScrollTrigger 'top bottom', una vez.
// Defaults del sitio: duration 1.2, ease expo.out. Cada preset = { set, to }: gsap.set al montar y gsap.to al entrar.
// Se agregan/sobreescriben presets por opciones; un preset con `to: null` se ignora.
import { useEffect, type RefObject } from 'react';
import { gsap, ScrollTrigger, reducedMotion } from './gsap';

type Scope = RefObject<HTMLElement | null>;
export type RevealPreset = (el: HTMLElement, i: number) => { targets?: gsap.TweenTarget; set: gsap.TweenVars; to: gsap.TweenVars | ((play: (t: gsap.TweenTarget, v: gsap.TweenVars) => void) => void) };

const D = { duration: 1.2, ease: 'expo.out' };
export const REVEAL_PRESETS: Record<string, RevealPreset> = {
  // M-REV-01 fade (cards): alpha, delay 0.2
  '.fade-in': () => ({ set: { autoAlpha: 0 }, to: { autoAlpha: 1, ...D, delay: 0.2 } }),
  // M-REV-05 líneas / párrafos: y 63 → 0 (o data-y) + alpha
  '.line-in': (el) => ({ set: { autoAlpha: 0, y: Number(el.dataset.y ?? 63) }, to: { autoAlpha: 1, y: 0, ...D } }),
  // M-REV-02 words: autoAlpha 0 yPercent 100 → 1 0, stagger 0.01 (hijos .word de WordsIn)
  '.words-in': (el) => ({ targets: el.querySelectorAll('.word'), set: { autoAlpha: 0, yPercent: 100 }, to: { autoAlpha: 1, yPercent: 0, stagger: 0.01, ...D } }),
  // M-REV-04 icon-only: scale .5 rotate −20, 0.5 s delay 0.2
  '.icon-in': () => ({ set: { autoAlpha: 0, scale: 0.5, rotate: -20 }, to: { autoAlpha: 1, scale: 1, rotate: 0, duration: 0.5, delay: 0.2 } }),
  // M-SCR-08 imagen: scale 1.1 → 1 + alpha
  '.img-in': () => ({ set: { autoAlpha: 0, scale: 1.1 }, to: { autoAlpha: 1, scale: 1, ...D } }),
  // M-REV-03 botón con chip (ChipButton): scale .5 origen left center, alpha 0.5 s, chip xPercent −100, línea scaleX 0, texto +0.2 s; delay índice·0.05
  '.btn-w': (btn, i) => {
    const sq = btn.querySelector('.btn-sq'), line = btn.querySelector('.btn-line'), txt = btn.querySelector('.btn-mid');
    const d = i * 0.05;
    return {
      set: { autoAlpha: 0, scale: 0.5, transformOrigin: 'left center' },
      to: (play) => {
        if (sq) gsap.set(sq, { autoAlpha: 0, xPercent: -100 });
        if (line) gsap.set(line, { scaleX: 0 });
        if (txt) gsap.set(txt, { autoAlpha: 0 });
        play([btn, sq], { autoAlpha: 1, duration: 0.5, delay: d });
        play(btn, { scale: 1, delay: d, ...D });
        if (line) play(line, { scaleX: 1, delay: d, ...D });
        if (sq) play(sq, { xPercent: 0, delay: d, ...D });
        if (txt) play(txt, { autoAlpha: 1, delay: 0.2 + d, ...D });
      },
    };
  },
};

export function revealOnce(el: Element, fn: () => void, start = 'top bottom') {
  return ScrollTrigger.create({ trigger: el, start, once: true, onEnter: fn });
}

export function useReveals(scope: Scope, presets: Record<string, RevealPreset | null> = {}) {
  useEffect(() => {
    if (reducedMotion() || !scope.current) return;
    const all = { ...REVEAL_PRESETS, ...presets };
    const ctx = gsap.context(() => {
      const root = scope.current!;
      for (const [sel, preset] of Object.entries(all)) {
        if (!preset) continue;
        root.querySelectorAll<HTMLElement>(sel).forEach((el, i) => {
          const p = preset(el, i);
          const targets = p.targets ?? el;
          gsap.set(targets, p.set);
          // el .btn-w del preset necesita sus sets de hijos antes del reveal: se hacen dentro de `to` con play
          if (typeof p.to === 'function') { const pre: [gsap.TweenTarget, gsap.TweenVars][] = []; p.to((t, v) => pre.push([t, v])); revealOnce(el, () => pre.forEach(([t, v]) => gsap.to(t, v))); }
          else { const to = p.to; revealOnce(el, () => gsap.to(targets, to)); }
        });
      }
    }, scope);
    return () => ctx.revert();
  }, [scope, presets]);
}
