// Scroll recipes measured in the labs (offbrand, maneva). Each hook: gsap.context over `scope`, revert on unmount,
// no-op with prefers-reduced-motion. Defaults = measured values (analysis.md §5); everything is a parameter.
import { useEffect, useState, type RefObject } from 'react';
import { gsap, ScrollTrigger, REVEAL, reducedMotion } from './gsap';

type Scope = RefObject<HTMLElement | null>;
type Reveal = { selector?: string; y?: number; duration?: number; ease?: string; stagger?: number; start?: string; opacity?: boolean };

// fn may return a cleanup (called on revert) and receives contextSafe for deferred callbacks (events, timers).
type Safe = <T extends (...args: never[]) => unknown>(f: T) => T;
function useCtx(scope: Scope, fn: (root: HTMLElement, safe: Safe) => void | (() => void), deps: unknown[] = []) {
  useEffect(() => {
    if (reducedMotion() || !scope.current) return;
    const ctx = gsap.context((_self, contextSafe) => fn(scope.current!, (contextSafe ?? ((f: never) => f)) as Safe), scope);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// Ranges in absolute scroll relative to the section top: they do not depend on innerHeight
// (the debugger infobar changes it mid-capture) and survive refresh.
export const absRange = (root: HTMLElement, a: number, b: number) => {
  const top = () => root.getBoundingClientRect().top + window.scrollY;
  return { trigger: root, start: () => top() + a, end: () => top() + b, scrub: true as const, invalidateOnRefresh: true };
};

// M-REV-01/02: per-word reveal on enter (ty 80.8 → 0, opacity 0 → 1, expo.out, stagger 40 ms)
export function useWordReveal(scope: Scope, o: Reveal = {}) {
  useCtx(scope, (root) => {
    gsap.from(o.selector ?? '.word', { y: o.y ?? REVEAL.y, opacity: o.opacity === false ? 1 : 0, duration: o.duration ?? REVEAL.duration, ease: o.ease ?? REVEAL.ease, stagger: o.stagger ?? REVEAL.stagger, scrollTrigger: { trigger: root, start: o.start ?? 'top 75%' } });
  });
}

// M-REV-03/04: staggered item entrance (links: y 21, 0.6 s, stagger 60 ms)
export function useStaggerIn(scope: Scope, o: Reveal & { selector: string }) {
  useCtx(scope, (root) => {
    gsap.from(o.selector, { y: o.y ?? 21, opacity: 0, duration: o.duration ?? 0.6, ease: o.ease ?? 'expo.out', stagger: o.stagger ?? 0.06, scrollTrigger: { trigger: root, start: o.start ?? 'top 70%' } });
  });
}

// M-SCR-02: linear mirrored two-column parallax, +offset → 0 (left) and −offset → 0 (right) across the whole section
export function useMirrorParallax(scope: Scope, o: { left?: string; right?: string; offset?: number } = {}) {
  useCtx(scope, (root) => {
    const st = { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true };
    gsap.fromTo(o.left ?? '.col-l', { y: o.offset ?? 124 }, { y: 0, ease: 'none', scrollTrigger: st });
    gsap.fromTo(o.right ?? '.col-r', { y: -(o.offset ?? 124) }, { y: 0, ease: 'none', scrollTrigger: st });
  });
}

// M-SCR-03: 100vh sticky container inside a tall section; content scales from → to while stuck
export function usePinConverge(scope: Scope, o: { selector?: string; from?: number; to?: number; range?: [number, number] } = {}) {
  useCtx(scope, (root) => {
    const [a, b] = o.range ?? [-480, 876];
    gsap.fromTo(o.selector ?? '.pin-content', { scale: o.from ?? 1.96 }, { scale: o.to ?? 1, ease: 'none', scrollTrigger: absRange(root, a, b) });
  });
}

// M-SCR-01b + M-NAR-01: hero lines shift at different speeds (4:2:1) during the first viewport;
// optional intro with chars from scattered positions.
export function useHeroLines(scope: Scope, o: { selector?: string; factors?: number[]; x?: number; intro?: boolean; charSelector?: string } = {}) {
  useCtx(scope, (root) => {
    const f = o.factors ?? [1, 0.5, 0.25];
    gsap.utils.toArray<HTMLElement>(o.selector ?? '.hero-line', root).forEach((el, i) => {
      gsap.to(el, { x: (o.x ?? -320) * (f[i] ?? f[f.length - 1]), ease: 'power1.out', scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: true } });
    });
    if (o.intro !== false) {
      gsap.from(o.charSelector ?? '.char', { x: () => gsap.utils.random(-300, 300), y: () => gsap.utils.random(-200, 200), rotation: () => gsap.utils.random(-40, 40), opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.03, delay: 0.2 });
    }
  });
}

// M-SCR-04/05/06/07: cross mask that grows ×34 and rotates, with the gradient counter-scaled to stay fixed to the viewport;
// side headline, rings, odd/even word wobble and panel shrink on exit.
// Ranges in px relative to the section top (measured @1512×812 on a 300vh section).
export type CrossMaskOpts = {
  shape?: string; fill?: string; line?: string; ring?: string; panel?: string;
  scale?: { from: number; peak: number; end: number; grow: [number, number]; shrink: [number, number] };
  rotation?: { from: number; to: number; range: [number, number]; ease?: string };
  line_?: { from: number; to: number; range: [number, number]; ease?: string };
  rings?: { from: number; mid: number; end: number; in: [number, number]; out: [number, number] } | false;
  wobble?: { y: number; range: [number, number] } | false;
  panelScale?: { to: number; range: [number, number] } | false;
};
export function useCrossMask(scope: Scope, o: CrossMaskOpts = {}) {
  useCtx(scope, (root) => {
    const sel = { shape: o.shape ?? '.x-shape', fill: o.fill ?? '.x-fill', line: o.line ?? '.x-line', ring: o.ring ?? '.x-ring', panel: o.panel ?? '.x-panel' };
    const sc = o.scale ?? { from: 0.61, peak: 34, end: 27.3, grow: [-7, 1451], shrink: [1451, 2323] };
    const rt = o.rotation ?? { from: 45, to: 225, range: [-7, 2323], ease: 'power2.out' };
    const abs = (r: [number, number]) => absRange(root, r[0], r[1]);
    // proxy {s, r}: the cross is only a mask; the fill counter-scales 1/s and counter-rotates −r to stay fixed to the viewport
    const xs = { s: sc.from, r: rt.from };
    const apply = () => { gsap.set(sel.shape, { scale: xs.s, rotation: xs.r }); gsap.set(sel.fill, { scale: 1 / xs.s, rotation: -xs.r }); };
    apply();
    gsap.fromTo(xs, { s: sc.from }, { s: sc.peak, ease: 'none', onUpdate: apply, scrollTrigger: abs(sc.grow) });
    gsap.fromTo(xs, { r: rt.from }, { r: rt.to, ease: rt.ease ?? 'power2.out', onUpdate: apply, scrollTrigger: abs(rt.range) });
    gsap.fromTo(xs, { s: sc.peak }, { s: sc.end, ease: 'none', immediateRender: false, onUpdate: apply, scrollTrigger: abs(sc.shrink) });
    const ln = o.line_ ?? { from: 841, to: 85, range: [70, 1656], ease: 'power3.out' };
    gsap.fromTo(sel.line, { x: ln.from }, { x: ln.to, ease: ln.ease ?? 'power3.out', scrollTrigger: abs(ln.range) });
    if (o.rings !== false) {
      const rg = o.rings ?? { from: 0.71, mid: 0.11, end: 1.2, in: [-206, 1031], out: [1865, 2316] };
      gsap.fromTo(sel.ring, { scale: rg.from }, { scale: rg.mid, ease: 'none', scrollTrigger: abs(rg.in) });
      gsap.to(sel.ring, { scale: rg.end, ease: 'power2.out', scrollTrigger: abs(rg.out) });
    }
    if (o.wobble !== false) {
      const wb = o.wobble ?? { y: 48, range: [1715, 2281] };
      gsap.to(`${sel.line} .word:nth-child(odd)`, { y: -wb.y, ease: 'power2.out', scrollTrigger: abs(wb.range) });
      gsap.to(`${sel.line} .word:nth-child(even)`, { y: wb.y, ease: 'power2.out', scrollTrigger: abs(wb.range) });
    }
    if (o.panelScale !== false) {
      const ps = o.panelScale ?? { to: 0.917, range: [1934, 2323] };
      gsap.to(sel.panel, { scale: ps.to, ease: 'none', transformOrigin: '50% 0%', scrollTrigger: abs(ps.range) });
    }
  });
}

// offbrand cross clip-path (30 % arms, semicircular tips, concave corners r=16 %, 72 points)
export const CROSS_CLIP = "polygon(35.0% 15.0%, 36.1% 9.3%, 39.4% 4.4%, 44.3% 1.1%, 50.0% 0.0%, 55.7% 1.1%, 60.6% 4.4%, 63.9% 9.3%, 65.0% 15.0%, 65.0% 19.0%, 65.3% 22.1%, 66.2% 25.1%, 67.7% 27.9%, 69.7% 30.3%, 72.1% 32.3%, 74.9% 33.8%, 77.9% 34.7%, 81.0% 35.0%, 85.0% 35.0%, 90.7% 36.1%, 95.6% 39.4%, 98.9% 44.3%, 100.0% 50.0%, 98.9% 55.7%, 95.6% 60.6%, 90.7% 63.9%, 85.0% 65.0%, 81.0% 65.0%, 77.9% 65.3%, 74.9% 66.2%, 72.1% 67.7%, 69.7% 69.7%, 67.7% 72.1%, 66.2% 74.9%, 65.3% 77.9%, 65.0% 81.0%, 65.0% 85.0%, 63.9% 90.7%, 60.6% 95.6%, 55.7% 98.9%, 50.0% 100.0%, 44.3% 98.9%, 39.4% 95.6%, 36.1% 90.7%, 35.0% 85.0%, 35.0% 81.0%, 34.7% 77.9%, 33.8% 74.9%, 32.3% 72.1%, 30.3% 69.7%, 27.9% 67.7%, 25.1% 66.2%, 22.1% 65.3%, 19.0% 65.0%, 15.0% 65.0%, 9.3% 63.9%, 4.4% 60.6%, 1.1% 55.7%, 0.0% 50.0%, 1.1% 44.3%, 4.4% 39.4%, 9.3% 36.1%, 15.0% 35.0%, 19.0% 35.0%, 22.1% 34.7%, 25.1% 33.8%, 27.9% 32.3%, 30.3% 30.3%, 32.3% 27.9%, 33.8% 25.1%, 34.7% 22.1%, 35.0% 19.0%)";

// maneva M-SCR-07: sticky card stack. Each card (except the last) scales 1 → 0.7 with ease none while the next one
// covers it; trigger is the card itself, '70% top' → 'bottom top' (measured: 12687 → 13039 px @1512×812, curve error 0.09).
export function useStickyStack(scope: Scope, o: { selector?: string; scale?: number; start?: string; end?: string } = {}) {
  useCtx(scope, (root) => {
    const els = gsap.utils.toArray<HTMLElement>(o.selector ?? '.sticky-el', root);
    els.forEach((el, i) => { if (i < els.length - 1) gsap.to(el, { scale: o.scale ?? 0.7, ease: 'none', scrollTrigger: { trigger: el, start: o.start ?? '70% top', end: o.end ?? 'bottom top', scrub: true } }); });
  });
}

// maneva M-NAR-02 + M-SCR-01: h1 chars enter (autoAlpha 0 / yPercent 100 → 1 / 0, stagger 0.01, power2.out) when
// `after` fires (PRELOADER_EVENT by default; null = on mount) and exit scrubbed over the first viewport, stagger from the end.
export function useHeroChars(scope: Scope, o: { selector?: string; block?: string; after?: string | null; stagger?: number; ease?: string } = {}) {
  useCtx(scope, (root, safe) => {
    const chars = root.querySelectorAll(o.selector ?? '.char');
    const block = o.block ? root.querySelector(o.block) : root;
    gsap.set(chars, { autoAlpha: 0, yPercent: 100 });
    // contextSafe: tweens and the ScrollTrigger created when the event arrives stay inside the context (revert cleans them up)
    const go = safe(() => {
      gsap.to(chars, { autoAlpha: 1, yPercent: 0, stagger: o.stagger ?? 0.01, duration: 1.2, ease: o.ease ?? 'power2.out' });
      gsap.timeline({ scrollTrigger: { trigger: block, start: 'top top', end: () => `+=${window.innerHeight}`, scrub: true } })
        .to(chars, { autoAlpha: 0, yPercent: 100, duration: 0.2, ease: o.ease ?? 'power2.out', stagger: { each: 0.0001, from: 'end' } });
    });
    const ev = o.after === undefined ? 'motion-kit:preloader' : o.after;
    if (!ev) { go(); return; }
    window.addEventListener(ev, go, { once: true });
    return () => window.removeEventListener(ev, go);
  });
}

// maneva M-SCR-06: focus window. Each list item lights up (autoAlpha 1) while inside
// [start, end] of the viewport and dims outside; the sticky media beside it stays fixed.
export function useFocusWindow(scope: Scope, o: { selector?: string; start?: string; end?: string; duration?: number; ease?: string } = {}) {
  useCtx(scope, (root) => {
    gsap.utils.toArray<HTMLElement>(o.selector ?? '.focus-item', root).forEach((el) => {
      gsap.set(el, { autoAlpha: 0 });
      ScrollTrigger.create({ trigger: el, start: o.start ?? 'top 100%', end: o.end ?? 'bottom 6%', onToggle: (s) => gsap.to(el, { autoAlpha: s.isActive ? 1 : 0, duration: o.duration ?? 0.6, ease: o.ease ?? 'expo.out', overwrite: true }) });
    });
  });
}

// maneva M-HOV-03: a class on `target` while the scroll is inside `trigger` (nav that changes color over light sections).
export function useToggleClass(target: Scope, o: { trigger: string; className: string; start?: string; end?: string }) {
  useEffect(() => {
    if (!target.current) return;
    const st = ScrollTrigger.create({ trigger: o.trigger, start: o.start ?? 'top 80px', end: o.end ?? 'bottom top', toggleClass: { targets: target.current, className: o.className } });
    return () => st.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, o.trigger, o.className, o.start, o.end]);
}

// maneva M-CLK-01: accordion. `para` height 0 ↔ auto 0.7 s expo.inOut; `bar` (the vertical bar of the +) rotates 90°.
export function toggleAccordion(item: HTMLElement, open: boolean, o: { para?: string; bar?: string; duration?: number } = {}) {
  const para = item.querySelector(o.para ?? '.para'), bar = item.querySelector(o.bar ?? '.bar');
  const d = o.duration ?? 0.7;
  if (para) gsap.to(para, { height: open ? 'auto' : 0, duration: d, ease: 'expo.inOut' });
  if (bar) gsap.to(bar, { rotateZ: open ? 90 : 0, duration: d, ease: 'expo.inOut' });
}

// maneva M-SCR-04 in DOM: diagonal curtain (fract/floor, tilt = aspect·0.2, direction alternating by parity) as clip-path.
export function curtainClip(u: number, aspect: number) {
  const parity = Math.floor(u) % 2; let t = u - Math.floor(u); if (parity) t = 1 - t;
  const tilt = aspect * 0.2, k = t * (1 + tilt);
  const y0 = k * 100, y1 = (k - tilt) * 100; // edge: coord = y + x·tilt = k
  return parity ? `polygon(0 ${100 - y0}%, 100% ${100 - y1}%, 100% 100%, 0 100%)` : `polygon(0 0, 100% 0, 100% ${y1}%, 0 ${y0}%)`;
}

// ---------- uplink (docs/landing/research/uplink/analysis.md §5; no cut: it-5 score 49) ----------

// scrubbed timeline whose time is the scroll px from `a` to `b` (relative to the section top): 1 unit = 1 px
export function pxTimeline(root: HTMLElement, a: number, b: number) {
  const tl = gsap.timeline({ scrollTrigger: absRange(root, a, b), defaults: { ease: 'none' } });
  tl.to({}, { duration: 0.001 }, b - a); // sets the total duration = range
  return tl;
}

// generic gsap.fromTo over absRange (a one-line scrub effect per section)
export function useScrub(scope: Scope, o: { sel: string; from: gsap.TweenVars; to: gsap.TweenVars; range: [number, number]; ease?: string }) {
  useCtx(scope, (root) => { gsap.fromTo(o.sel, o.from, { ...o.to, ease: o.ease ?? 'none', scrollTrigger: absRange(root, o.range[0], o.range[1]) }); });
}

// uplink M-SCR-03: paragraphs that write and erase word by word inside the pin.
// Per paragraph: entry [inA, inB] (word: yPercent 101 → 0 over ~70 % of the range, opacity 0.35 → 1 starts at 33 %), exit [outA, outB]
// (yPercent 0 → −101, opacity → 0). Stagger: 30 % of the range spread on entry, 10 % on exit.
export type ScrubPara = { sel: string; in: [number, number]; out: [number, number] };
export function useWordScrub(scope: Scope, o: { paras: ScrubPara[]; range: [number, number]; fadeOut?: { sel: string; at: [number, number] } }) {
  useCtx(scope, (root) => {
    const tl = pxTimeline(root, o.range[0], o.range[1]);
    for (const p of o.paras) {
      const words = gsap.utils.toArray<HTMLElement>(p.sel + ' .word', root);
      const inD = p.in[1] - p.in[0];
      gsap.set(words, { yPercent: 101, autoAlpha: 0 });
      tl.set(words, { autoAlpha: 0.35 }, p.in[0]);
      tl.to(words, { yPercent: 0, duration: inD * 0.7, stagger: { amount: inD * 0.3 } }, p.in[0]);
      tl.to(words, { autoAlpha: 1, duration: inD * 0.45, stagger: { amount: inD * 0.22 } }, p.in[0] + inD * 0.33);
      const outD = p.out[1] - p.out[0];
      tl.to(words, { yPercent: -101, autoAlpha: 0, duration: outD * 0.9, stagger: { amount: outD * 0.1 } }, p.out[0]);
    }
    // when dimming, each element rises by data-out-y (measured: eyebrow −40, spinner −57, buttons −90)
    if (o.fadeOut) tl.to(o.fadeOut.sel, { opacity: 0, y: (_: number, el: HTMLElement) => +(el.dataset.outY ?? 0), duration: o.fadeOut.at[1] - o.fadeOut.at[0] }, o.fadeOut.at[0]);
  });
}

// uplink M-SCR-06 + M-REV-02: each path segment draws (clip-path inset bottom 100 % → 0 %) while going from
// "top 60 %" to "bottom 50 %" of the viewport (measured: start = top − 487, end = bottom − 404); card k lights up (class `on`)
// when its node arrives. Positions in px relative to the section top.
export function useTrackDraw(scope: Scope, o: { segs: { sel: string; top: number; bottom: number }[]; cards: { sel: string; at: number }[]; startOffset?: number; endOffset?: number; onClass?: string }) {
  useCtx(scope, (root) => {
    const so = o.startOffset ?? 487, eo = o.endOffset ?? 404, cls = o.onClass ?? 'on';
    for (const s of o.segs) {
      gsap.fromTo(s.sel, { clipPath: 'inset(0px 0px 100%)' }, { clipPath: 'inset(0px 0px 0%)', ease: 'none', scrollTrigger: absRange(root, s.top - so, s.bottom - eo) });
    }
    const top = () => root.getBoundingClientRect().top + window.scrollY;
    for (const c of o.cards) {
      const el = root.querySelector<HTMLElement>(c.sel)!;
      ScrollTrigger.create({ trigger: root, start: () => top() + c.at, end: () => top() + c.at + 1, onEnter: () => el.classList.add(cls), onLeaveBack: () => el.classList.remove(cls), invalidateOnRefresh: true });
    }
  });
}

// uplink M-SCR-07: stats slider inside a sticky. Track −travel px linear (1 px per scroll px); the outgoing stat does
// scale 1 → 0.8 and opacity 1 → 0 at `outs`; the incoming one gets the `active` class on arrival (`arrive`).
export function useStatSlider(scope: Scope, o: { track: string; slides: string; range?: [number, number]; travel?: number; outs?: [number, number][]; arrive?: number[] }) {
  useCtx(scope, (root) => {
    const [a, b] = o.range ?? [0, 1624];
    const slides = gsap.utils.toArray<HTMLElement>(o.slides, root);
    const tl = pxTimeline(root, a, b);
    tl.to(o.track, { x: -(o.travel ?? 834), duration: 815 }, 0);
    (o.outs ?? [[289, 436], [584, 815]]).forEach(([s, e], i) => {
      tl.to(slides[i], { scale: 0.8, autoAlpha: 0, transformOrigin: '50% 50%', duration: e - s }, s);
    });
    (o.arrive ?? [400, 815]).forEach((t, i) => {
      const el = slides[i + 1]; if (!el) return;
      tl.call(() => { el.classList.remove('active'); el.className = 'active ' + el.className; }, [], t);
      tl.call(() => el.classList.remove('active'), [], t - 1); // reverse
    });
  });
}

// uplink M-LOOP-01: n stacked words (translateY 0 / 100 % / 200 %…), every `every` ms rotates one position with a 0.5 s ease-in-out transition.
export function useTextCycle(scope: Scope, o: { sel?: string; every?: number } = {}) {
  useEffect(() => {
    const root = scope.current; if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>(o.sel ?? '.text-cycle'));
    els.forEach((el, k) => { el.style.transform = `translateY(${k * 100}%)`; el.style.transition = 'transform 0.5s ease-in-out'; });
    if (reducedMotion()) return;
    let i = 0; const n = els.length;
    const id = setInterval(() => { i = (i + 1) % n; els.forEach((el, k) => { el.style.transform = `translateY(${((k - i + n) % n) * 100}%)`; }); }, o.every ?? 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// uplink M-SCR-05b: card that arrives from below and grows over the pinned section (y 174 → 0, scale 0.95 → 1, origin top center, linear).
export function useCardArrive(scope: Scope, o: { sel: string; range: [number, number]; y?: number; scale?: number }) {
  useCtx(scope, (root) => {
    gsap.fromTo(root.querySelector(o.sel), { y: o.y ?? 174, scale: o.scale ?? 0.95, transformOrigin: '50% 0%' }, { y: 0, scale: 1, ease: 'none', scrollTrigger: absRange(root, o.range[0], o.range[1]) });
  });
}

// uplink M-SCR-01 (WebGL globe, inferred): fixed layer that moves/scales with keyframes on absolute scrollY over the document,
// switches to `dots` mode from `dotsAt` and dissolves while the grid appears. Measured keys as default.
export type GlobeKeys = { end: number; move: gsap.TweenVars & { duration: number }; dotsAt: number; fadeAt: number; fadeDur: number };
export const UPLINK_GLOBE: GlobeKeys = { end: 2054, move: { left: 340, top: 60, width: 840, height: 840, duration: 836 }, dotsAt: 500, fadeAt: 1654, fadeDur: 400 };
export function useGlobe(scope: Scope, o: { globe: string; grid: string; keys?: GlobeKeys }) {
  useCtx(scope, (root) => {
    const k = o.keys ?? UPLINK_GLOBE;
    const g = root.querySelector(o.globe)!;
    const tl = gsap.timeline({ scrollTrigger: { trigger: document.body, start: 0, end: k.end, scrub: true }, defaults: { ease: 'none' } });
    tl.to({}, { duration: 0.001 }, k.end);
    tl.to(g, k.move, 0);
    tl.call(() => g.classList.add('dots'), [], k.dotsAt);
    tl.call(() => g.classList.remove('dots'), [], k.dotsAt - 1);
    tl.to(g, { autoAlpha: 0, duration: k.fadeDur }, k.fadeAt);
    tl.fromTo(root.querySelector(o.grid), { autoAlpha: 0 }, { autoAlpha: 1, duration: k.fadeDur }, k.fadeAt);
  });
}

// uplink M-LAY-01: header that hides on scroll down (translateY −100 %) and returns on scroll up or after `idle` ms stopped;
// `scrolledClass` on <html> when y > threshold (to shrink the padding). The site CSS sets the transition.
export function useHideOnScroll(target: Scope, o: { threshold?: number; idle?: number; scrolledClass?: string } = {}) {
  useEffect(() => {
    const el = target.current; if (!el) return;
    const th = o.threshold ?? 100; let idle = 0;
    const st = ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: (self) => {
        const y = self.scroll();
        document.documentElement.classList.toggle(o.scrolledClass ?? 'is--scrolled', y > th);
        el.style.transform = self.direction === 1 && y > th ? 'translateY(-100%)' : 'translateY(0)';
        clearTimeout(idle); idle = window.setTimeout(() => { el.style.transform = 'translateY(0)'; }, o.idle ?? 120);
      },
    });
    return () => { st.kill(); clearTimeout(idle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
}

// uplink M-LAY-02: state that advances on its own every `every` ms while the section is in view (top crosses the center: rootMargin −50 %);
// a manual change (click) restarts the count because the timer depends on `active`. `n` = number of states.
export function useAutoAdvance(scope: Scope, o: { n: number; active: number; setActive: (f: (a: number) => number) => void; every?: number; rootMargin?: string }) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = scope.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: o.rootMargin ?? '0px 0px -50% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [scope, o.rootMargin]);
  useEffect(() => {
    if (!inView || reducedMotion()) return;
    const id = setTimeout(() => o.setActive((a) => (a + 1) % o.n), o.every ?? 4000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.active, inView]);
}
