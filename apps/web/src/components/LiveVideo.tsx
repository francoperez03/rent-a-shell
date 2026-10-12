import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Shell } from '@ras/shell-spec';
import { apiUrl } from '@/lib/api';
import { cn } from '@/lib/cn';

type Mode = 'connecting' | 'hls' | 'frame' | 'disconnected';

const RETRY_MS = 10_000;
const FRAME_MS = 1_000;

/**
 * Shell camera. Order: HLS (native in Safari, hls.js elsewhere) → latest frame
 * refreshed every 1 s → "disconnected", retrying every 10 s. Pattern from robot-a/Camera.tsx.
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

  return (
    <div className={cn('relative overflow-hidden bg-[var(--panel-dark-deep)]', className)}>
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
        <p role="status" className="absolute inset-0 grid place-items-center p-8 text-center font-mono text-[12px] uppercase tracking-[0.12em] text-white/60">
          {mode === 'disconnected' ? `${name} is disconnected. Retrying every 10 seconds.` : 'Connecting…'}
        </p>
      )}
      <span className="absolute left-3 top-3 flex items-center gap-2 bg-[rgba(0,12,41,0.8)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-white/85">
        <span aria-hidden className={cn('h-2 w-2 rounded-full', mode === 'disconnected' ? 'bg-white/30' : 'animate-status-pulse bg-accent')} />
        {mode === 'hls' ? 'Live' : mode === 'frame' ? 'Frame by frame' : mode === 'connecting' ? 'Connecting' : 'No signal'}
      </span>
      {children}
    </div>
  );
}
