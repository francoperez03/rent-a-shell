// ?vh=N fija el alto de diseño (landing-research compara a 1512×812 aunque la infobar del debugger cambie innerHeight).
// Setea --vh en px (usar `calc(var(--vh) * 100)` en vez de 100vh) y devuelve vh() para timelines en px.
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
