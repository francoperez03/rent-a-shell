import { forwardRef, useRef, type MutableRefObject } from 'react';
import LiquidOrb, { type OrbColors } from './LiquidOrb';

// Fixed orb behind everything (z -2): round 80vh host with the liquid canvas + two rings.
// The ref points to the host so useOrbPath moves/scales it with the scroll.
const Orb = forwardRef<HTMLDivElement, { colors?: OrbColors; size?: string; rings?: boolean }>(function Orb({ colors, size = 'calc(var(--vh, 1vh) * 80)', rings = true }, ref) {
  const host = useRef<HTMLDivElement | null>(null);
  return (
    <div className="fixed inset-0 z-[-2] pointer-events-none" data-layer="orb-w">
      <div
        ref={(el) => { host.current = el; if (typeof ref === 'function') ref(el); else if (ref) (ref as MutableRefObject<HTMLDivElement | null>).current = el; }}
        className="orb absolute left-1/2 top-1/2 rounded-full overflow-hidden"
        style={{ width: size, height: size, willChange: 'transform' }}
      >
        <LiquidOrb host={host} colors={colors} />
      </div>
      {rings && (<>
        <div className="ring left-1/2 top-1/2" style={{ width: 'calc(var(--vh, 1vh) * 72)', height: 'calc(var(--vh, 1vh) * 72)', transform: 'translate(-50%, -50%) scale(1.2)' }} data-ring="1" />
        <div className="ring left-1/2 top-1/2" style={{ width: 'calc(var(--vh, 1vh) * 72)', height: 'calc(var(--vh, 1vh) * 72)', transform: 'translate(-50%, -50%) scale(0.9)' }} data-ring="2" />
      </>)}
    </div>
  );
});
export default Orb;
