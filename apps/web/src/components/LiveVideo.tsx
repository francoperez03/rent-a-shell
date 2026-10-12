import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Shell } from '@ras/shell-spec';
import { apiUrl } from '@/lib/api';
import { cn } from '@/lib/cn';

type Mode = 'conectando' | 'hls' | 'frame' | 'desconectado';

const RETRY_MS = 10_000;
const FRAME_MS = 1_000;

/**
 * Cámara del shell. Orden: HLS (nativo en Safari, hls.js en el resto) → último frame
 * refrescado cada 1 s → "desconectado" reintentando cada 10 s. Patrón de robot-a/Camera.tsx.
 */
export function LiveVideo({ shell, className, children }: { shell: Shell | undefined; className?: string; children?: ReactNode }) {
  const video = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<Mode>('conectando');
  const [tick, setTick] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const hls = shell?.camera.hls ?? null;
  const frame = shell?.camera.frame ?? null;

  // HLS: si no hay o falla, pasa a frame.
  useEffect(() => {
    const el = video.current;
    if (!shell) return;
    if (!hls || !el) {
      setMode('frame');
      return;
    }
    let cancelled = false;
    let cleanup = () => {};
    setMode('conectando');
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

  // Frame: refresca cada 1 s. Desconectado: reintenta todo cada 10 s.
  useEffect(() => {
    if (mode === 'frame') {
      const id = setInterval(() => setTick((t) => t + 1), FRAME_MS);
      return () => clearInterval(id);
    }
    if (mode === 'desconectado') {
      const id = setTimeout(() => {
        setAttempt((a) => a + 1);
        setMode(hls ? 'conectando' : 'frame');
      }, RETRY_MS);
      return () => clearTimeout(id);
    }
  }, [mode, hls]);

  const name = shell?.name ?? 'El shell';

  return (
    <div className={cn('relative overflow-hidden bg-[var(--panel-dark-deep)]', className)}>
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        aria-label={`Cámara en vivo de ${name}`}
        className={cn('h-full w-full object-cover', mode !== 'hls' && 'invisible')}
      />
      {mode === 'frame' && frame && (
        <img
          src={`${apiUrl(frame)}${frame.includes('?') ? '&' : '?'}t=${tick}`}
          alt={`Último cuadro de la cámara de ${name}`}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setMode('desconectado')}
        />
      )}
      {(mode === 'desconectado' || mode === 'conectando') && (
        <p role="status" className="absolute inset-0 grid place-items-center p-8 text-center font-mono text-[12px] uppercase tracking-[0.12em] text-white/60">
          {mode === 'desconectado' ? `${name} está desconectado. Reintento cada 10 segundos.` : 'Conectando…'}
        </p>
      )}
      <span className="absolute left-3 top-3 flex items-center gap-2 bg-[rgba(0,12,41,0.8)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-white/85">
        <span aria-hidden className={cn('h-2 w-2 rounded-full', mode === 'desconectado' ? 'bg-white/30' : 'animate-status-pulse bg-accent')} />
        {mode === 'hls' ? 'En vivo' : mode === 'frame' ? 'Cuadro a cuadro' : mode === 'conectando' ? 'Conectando' : 'Sin señal'}
      </span>
      {children}
    </div>
  );
}
