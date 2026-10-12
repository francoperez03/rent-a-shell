import { useEffect, useRef, useState, type ReactNode } from 'react';
import { gsap, reducedMotion } from './gsap';

// maneva M-NAR-01: preloader with a 0 → 100 counter (1 s linear + 0.2 s power2.out), 0.5 s hold,
// exit yPercent −110 + diagonal clip-path 1 s expo.inOut, autoAlpha 0 in 0.05 s. When done it fires PRELOADER_EVENT
// (the hero and the 3D scene start with onPreloader). A child with class .pre-fill rises yPercent −101 in 1 s (logo fill).
export const PRELOADER_EVENT = 'motion-kit:preloader';
export const onPreloader = (fn: () => void) => { window.addEventListener(PRELOADER_EVENT, fn, { once: true }); return () => window.removeEventListener(PRELOADER_EVENT, fn); };

export default function Preloader({ children, counter = true, hold = 0.5, className = '' }: { children?: ReactNode; counter?: boolean; hold?: number; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const done = () => { root.current!.style.display = 'none'; window.dispatchEvent(new Event(PRELOADER_EVENT)); };
    if (reducedMotion()) { done(); return; }
    const v = { value: 0 };
    const fill = inner.current!.querySelector('.pre-fill');
    const tl = gsap.timeline({ onComplete: done });
    if (fill) tl.to(fill, { yPercent: -101, duration: 1, ease: 'power2.out' }, 0.2);
    tl.to(v, { value: 100, duration: 1, ease: 'none', onUpdate: () => setN(Math.round(v.value)) }, 0)
      .to(v, { value: 100, duration: 0.2, ease: 'power2.out' })
      .to(inner.current, { yPercent: -110, clipPath: 'polygon(0 0, 100% 0, 100% 80%, 0% 100%)', duration: 1, ease: 'expo.inOut' }, `+=${hold}`)
      .to(root.current, { autoAlpha: 0, duration: 0.05 });
    return () => { tl.kill(); };
  }, [hold]);
  return (
    <div ref={root} className={`pre-w ${className}`} aria-hidden>
      <div ref={inner} className="pre-inner" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0% 100%)' }}>
        {children}
        {counter && <div className="pre-num">{n} %</div>}
      </div>
    </div>
  );
}
