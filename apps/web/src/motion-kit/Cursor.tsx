import { useEffect, useRef } from 'react';
import { gsap } from './gsap';

// M-GBL-02: cursor de 32px con mix-blend difference; sigue con lag (quickTo) y escala 0.55 sobre links.
// Requiere `* { cursor: none }` en el consumidor (motion-kit.css no lo impone).
export default function Cursor({ className = 'bg-white', size = 32 }: { className?: string; size?: number }) {
  const dot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dot.current!;
    const x = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3' });
    const y = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3' });
    // rent-a-shell: oculto hasta el primer movimiento (si no, aparece clavado arriba a la izquierda)
    const move = (e: MouseEvent) => { el.style.opacity = '1'; x(e.clientX - size / 2); y(e.clientY - size / 2); };
    const over = (e: MouseEvent) => { const t = (e.target as HTMLElement).closest('a, button'); gsap.to(el, { scale: t ? 0.55 : 1, duration: 0.3 }); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseover', over);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseover', over); };
  }, [size]);
  return (
    <div className="fixed inset-0 z-[2000] pointer-events-none" style={{ mixBlendMode: 'difference' }} data-layer="cursor">
      <div ref={dot} className={`cursor-dot absolute left-0 top-0 rounded-full ${className}`} style={{ width: size, height: size, opacity: 0 }} />
    </div>
  );
}
