import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Shell } from '@ras/shell-spec';
import { apiUrl } from '@/lib/api';
import { cn } from '@/lib/cn';

type Mode = 'connecting' | 'hls' | 'frame' | 'disconnected';

const RETRY_MS = 10_000;
const FRAME_MS = 1_000;

/**
 * Shell camera in a bench well with tick marks on the frame. Order: HLS (native in Safari, hls.js
 * elsewhere) → latest frame refreshed every 1 s → "no signal", retrying every 10 s.
 */
export function LiveVideo({ shell, className, children }: { shell: Shell | undefined; className?: string; children?: ReactNode }) {
  const video = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<Mode>('connecting');
  const [tick, setTick] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const hls = shell?.camera.hls ?? null;
  const frame = shell?.camera.frame ?? null;

  // HLS: if missing or failing, fall back to frames.
  useEffect(() => {
    const el = video.current;
    if (!shell) return;
    if (!hls || !el) {
      setMode('frame');
      return;
    }
    let cancelled = false;
    let cleanup = () => {};
    setMode('connecting');
    const fail = () => !cancelled && setMode('frame');
    const onPlaying = () => !cancelled && setMode('hls');
    el.addEventListener('playing', onPlaying);

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.addEventListener('error', fail, { once: true });
      el.src = hls;
      el.play().catch(() => {});
      cleanup = () => {
        el.removeEventListener('error', fail);
        el.removeAttribute('src');
      };
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) return fail();
        const h = new Hls({ liveDurationInfinity: true });
        h.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            h.destroy();
            fail();
          }
        });
        h.loadSource(hls);
        h.attachMedia(el);
        el.play().catch(() => {});
        cleanup = () => h.destroy();
      });
    }
    return () => {
      cancelled = true;
      el.removeEventListener('playing', onPlaying);
      cleanup();
    };
  }, [shell, hls, attempt]);

  // Frame: refresh every 1 s. Disconnected: retry everything every 10 s.
  useEffect(() => {
    if (mode === 'frame') {
      const id = setInterval(() => setTick((t) => t + 1), FRAME_MS);
      return () => clearInterval(id);
    }
    if (mode === 'disconnected') {
      const id = setTimeout(() => {
        setAttempt((a) => a + 1);
        setMode(hls ? 'connecting' : 'frame');
      }, RETRY_MS);
      return () => clearTimeout(id);
    }
  }, [mode, hls]);

  const name = shell?.name ?? 'The shell';
  const badge = mode === 'hls' ? 'Live' : mode === 'frame' ? 'Frame by frame' : mode === 'connecting' ? 'Connecting' : 'No signal';

  return (
    <div className={cn('on-bench relative overflow-hidden border border-bench-rule bg-bench text-bench-ink', className)}>
      {/* tick marks: the well reads as an instrument window */}
      <Ticks />
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        aria-label={`Live camera of ${name}`}
        className={cn('h-full w-full object-cover', mode !== 'hls' && 'invisible')}
      />
      {mode === 'frame' && frame && (
        <img
          src={`${apiUrl(frame)}${frame.includes('?') ? '&' : '?'}t=${tick}`}
          alt={`Latest camera frame of ${name}`}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setMode('disconnected')}
        />
      )}
      {(mode === 'disconnected' || mode === 'connecting') && (
        <div role="status" className="dot-grid-bench absolute inset-0 grid place-items-center p-8 text-center">
          <div>
            <p className="tabular font-mono text-data text-bench-ink-2">{mode === 'disconnected' ? '— — —' : '· · ·'}</p>
            <p className="mt-3 font-mono text-mono-xs uppercase text-bench-ink-2">
              {mode === 'disconnected' ? `${name} has no signal. Retrying every 10 s.` : 'Connecting to the camera'}
            </p>
          </div>
        </div>
      )}
      <span className="absolute left-3 top-3 flex items-center gap-2 border border-bench-rule bg-bench/85 px-2 py-1 font-mono text-mono-xs uppercase text-bench-ink">
        <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', mode === 'disconnected' ? 'bg-bench-rule' : 'animate-status-pulse bg-signal')} />
        {badge}
      </span>
      {children}
    </div>
  );
}

function Ticks() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 z-10 h-full w-full text-bench-ink-2/60" preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((p) => (
        <g key={p}>
          <line x1={`${p * 100}%`} y1="0" x2={`${p * 100}%`} y2={p === 0.5 ? 10 : 6} stroke="currentColor" strokeWidth="1" />
          <line x1={`${p * 100}%`} y1="100%" x2={`${p * 100}%`} y2={p === 0.5 ? 'calc(100% - 10px)' : 'calc(100% - 6px)'} stroke="currentColor" strokeWidth="1" />
          <line x1="0" y1={`${p * 100}%`} x2={p === 0.5 ? 10 : 6} y2={`${p * 100}%`} stroke="currentColor" strokeWidth="1" />
          <line x1="100%" y1={`${p * 100}%`} x2={p === 0.5 ? 'calc(100% - 10px)' : 'calc(100% - 6px)'} y2={`${p * 100}%`} stroke="currentColor" strokeWidth="1" />
        </g>
      ))}
    </svg>
  );
}
