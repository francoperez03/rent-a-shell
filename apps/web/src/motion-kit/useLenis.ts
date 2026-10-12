// Lenis + ScrollTrigger: Lenis maneja el scroll, ScrollTrigger se actualiza en cada scroll, gsap.ticker mueve a Lenis.
import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger, reducedMotion } from './gsap';

export function useLenis({ expose = false }: { expose?: boolean } = {}) {
  useEffect(() => {
    // rent-a-shell: con reduced motion no hay smooth scroll
    if (reducedMotion()) return;
    // diagnóstico para landing-research (compare): expone los triggers en window.__ST
    if (expose) (window as unknown as { __ST?: typeof ScrollTrigger }).__ST = ScrollTrigger;
    const lenis = new Lenis();
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    // Las posiciones de ScrollTrigger se calculan al montar; la fuente web cambia alturas después → refrescar.
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
