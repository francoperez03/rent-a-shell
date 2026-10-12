// ?vh=N pins the design height (landing-research compares at 1512×812 even if the debugger infobar changes innerHeight).
// Sets --vh in px (use `calc(var(--vh) * 100)` instead of 100vh) and returns vh() for px timelines.
let lock = 0;

export function applyVhLock() {
  if (typeof window === 'undefined') return;
  const n = Number(new URLSearchParams(location.search).get('vh'));
  if (!n) return;
  lock = n;
  document.documentElement.style.setProperty('--vh', `${n / 100}px`);
}

export const vh = () => lock || window.innerHeight;
export const vw = () => window.innerWidth;
