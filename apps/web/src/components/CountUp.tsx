import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import { useReducedMotion } from '@/lib/useReducedMotion';

const MS = 1200;

/** A number that counts up from 0 when it scrolls into view (ease-out cubic, like the spec counter on Crisol). Keeps the decimals of the input: "0.05" stays "0.05". */
export function CountUp({ value, prefix = '' }: { value: string | number; prefix?: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const text = String(value);
  const target = Number(text);
  const decimals = (text.split('.')[1] ?? '').length;
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView || reduced) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / MS);
      setN(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, target]);

  if (!Number.isFinite(target)) return <span>{prefix}{text}</span>;
  return (
    <span ref={ref}>
      {prefix}
      {reduced ? text : n.toFixed(decimals)}
    </span>
  );
}
