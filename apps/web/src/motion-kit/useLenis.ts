// Lenis + ScrollTrigger: Lenis drives the scroll, ScrollTrigger updates on each scroll, gsap.ticker drives Lenis.
import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger, reducedMotion } from './gsap';

export function useLenis({ expose = false }: { expose?: boolean } = {}) {
  useEffect(() => {
    // rent-a-shell: no smooth scroll with reduced motion
    if (reducedMotion()) return;
    // diagnostics for landing-research (compare): exposes the triggers on window.__ST
    if (expose) (window as unknown as { __ST?: typeof ScrollTrigger }).__ST = ScrollTrigger;
    const lenis = new Lenis();
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    // ScrollTrigger positions are computed on mount; the web font changes heights later → refresh.
    document.fonts.ready.then(() => ScrollTrigger.refresh());
    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener('load', onLoad);
    return () => {
      window.removeEventListener('load', onLoad);
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, [expose]);
}
