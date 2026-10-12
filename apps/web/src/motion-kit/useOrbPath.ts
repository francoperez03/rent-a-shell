import { useEffect, type RefObject } from 'react';
import { gsap, reducedMotion } from './gsap';
import { vh, vw } from './useVhLock';

// M-SCR-01 / 02b / 03: the orb travels the page with a single scrub timeline over the whole document.
// p = fraction of total scroll; w = width in vh; cx/cy = center as a fraction of the viewport.
export type OrbKey = { p: number; w: number; cx: number; cy: number };

// Keyframes measured in offbrand (9704 px @1512×812)
export const OFFBRAND_ORB_KEYS: OrbKey[] = [
  { p: 0.0, w: 0.887, cx: 0.5, cy: 0.5 },
  { p: 0.086, w: 1.69, cx: 0.95, cy: 0.5 },
  { p: 0.245, w: 1.49, cx: 0.36, cy: 0.37 },
  { p: 0.30, w: 1.33, cx: 0.005, cy: 0.33 },
  { p: 0.327, w: 0.81, cx: 0.19, cy: 0.57 },
  { p: 0.354, w: 0.095, cx: 0.46, cy: 0.95 },
  { p: 0.397, w: 0.026, cx: 0.5, cy: 0.99 },
  { p: 0.45, w: 0.59, cx: 0.5, cy: 0.66 },
  { p: 0.534, w: 0.945, cx: 0.47, cy: 0.53 },
  { p: 0.615, w: 1.1, cx: 0.17, cy: 0.5 },
  { p: 0.66, w: 0.0, cx: 0.17, cy: 0.5 },
  { p: 1.0, w: 0.0, cx: 0.17, cy: 0.5 },
];

export function useOrbPath(orb: RefObject<HTMLElement | null>, keys: OrbKey[] = OFFBRAND_ORB_KEYS) {
  useEffect(() => {
    const el = orb.current!;
    const at = (k: OrbKey) => ({ width: k.w * vh(), height: k.w * vh(), x: k.cx * vw() - vw() / 2, y: k.cy * vh() - vh() / 2 });
    // rent-a-shell: with reduced motion the orb stays still on the first keyframe
    if (reducedMotion()) { gsap.set(el, { xPercent: -50, yPercent: -50, ...at(keys[0]) }); return; }
    const tl = gsap.timeline({ scrollTrigger: { trigger: document.body, start: 0, end: () => document.documentElement.scrollHeight - vh(), scrub: true } });
    keys.forEach((k, i) => {
      if (!i) { gsap.set(el, { xPercent: -50, yPercent: -50, ...at(k) }); return; }
      const prev = keys[i - 1];
      tl.to(el, { ...at(k), ease: i === 1 ? 'power1.out' : 'none', duration: k.p - prev.p }, prev.p);
    });
    return () => { tl.scrollTrigger?.kill(); tl.kill(); };
  }, [orb, keys]);
}
