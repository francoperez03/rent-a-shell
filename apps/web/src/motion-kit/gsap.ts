import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
export { gsap, ScrollTrigger };

// Constantes medidas en offbrand (docs/landing/research/offbrand/analysis.md §5). Comentario = código de la animación.
export const EASE_ROLL = 'cubic-bezier(0.165, 0.84, 0.44, 1)'; // M-HOV-01
export const REVEAL = { y: 80.8, duration: 0.8, ease: 'expo.out', stagger: 0.04 }; // M-REV-01/02

export const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
