import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Angles, Command, Joint, SessionGrant, Shell } from '@ras/shell-spec';
import { LiveVideo } from '@/components/LiveVideo';
import { TelemetryPanel } from '@/components/TelemetryPanel';
import { Pill } from '@/components/Pill';
import { ApiError, api, clearGrant, fmtClock, loadGrant, toMs, useEvents, useNow, useShell, useShellState, type SessionInfo } from '@/lib/api';
import { JOINTS, JOINT_LABEL } from '@/lib/joints';
import { cn } from '@/lib/cn';

const STEP = 5;
const COALESCE_MS = 100;

// Teclado: flechas base y hombro, W/S codo, A/D pinza, espacio STOP.
const KEYS: Record<string, [Joint, 1 | -1]> = {
  ArrowLeft: ['base', -1],
  ArrowRight: ['base', 1],
  ArrowUp: ['shoulder', 1],
  ArrowDown: ['shoulder', -1],
  KeyW: ['elbow', 1],
  KeyS: ['elbow', -1],
  KeyA: ['grip', -1],
  KeyD: ['grip', 1],
};

type Ended = 'expired' | 'ended' | 'revoked' | 'offline';

/** Consola de sesión. Sin Lenis, sin cursor custom, sin pins: un producto vivo. */
export default function SessionPage() {
  const [grant] = useState(loadGrant);
  if (!grant) {
    return (
      <main className="mx-auto grid min-h-viewport max-w-container place-items-center px-5 text-center text-white">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">Sin sesión</p>
          <h1 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-light">No hay una sesión activa en esta pestaña.</h1>
          <Pill as="link" to="/#shells" label="Elegir un shell" className="mt-8" />
        </div>
      </main>
    );
  }
  return <Console grant={grant} />;
}

function Console({ grant }: { grant: SessionGrant }) {
  const { data: shell } = useShell(grant.shell);
  const { data: state } = useShellState(grant.shell, 1_000);
  const now = useNow(500);
  const expiresAt = toMs(grant.expires_at);
  const startsAt = toMs(grant.starts_at);
  const [ended, setEnded] = useState<Ended | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [target, setTarget] = useState<Angles | null>(null);
  const targetRef = useRef<Angles | null>(null);
  targetRef.current = target;
  const resync = useRef(true);
  const pending = useRef<Partial<Angles>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si el robot estaba ocupado, el bloque arranca después: hasta entonces los controles esperan.
  const waiting = now < startsAt;
  const left = waiting ? startsAt - now : expiresAt - now;
  const locked = !!ended || waiting;

  // El gateway confirma que el token sigue vivo (otra pestaña pudo cerrarla).
  const check = useQuery({
    queryKey: ['session', grant.sid],
    queryFn: () => api<SessionInfo>('/api/session', { token: grant.token }),
    refetchInterval: 15_000,
    retry: false,
  });
  useEffect(() => {
    if (check.data?.ended) setEnded(check.data.ended);
    // Un token de un bloque en cola todavía no es válido (nbf): no cuenta como vencido.
    if (check.error instanceof ApiError && check.error.status === 401 && Date.now() >= startsAt) setEnded('revoked');
  }, [check.data, check.error, startsAt]);

  useEffect(() => {
    if (!ended && now >= expiresAt) setEnded('expired');
  }, [now, expiresAt, ended]);

  useEvents((e) => {
    if (e.type === 'session_ended' && e.sid === grant.sid) setEnded(e.reason);
  });

  useEffect(() => {
    if (ended) clearGrant();
  }, [ended]);

  // Los sliders arrancan (y se reacomodan tras STOP o rutina) en los ángulos reales.
  useEffect(() => {
    // Mientras corre una rutina los sliders siguen al robot; al terminar quedan en la pose final.
    if (state && (resync.current || state.rutina)) {
      resync.current = !!state.rutina;
      setTarget(state.angles);
    }
  }, [state]);

  const send = useCallback(
    async (cmd: Command) => {
      try {
        const res = await api<{ clamped?: boolean; error?: string }>('/api/cmd', { method: 'POST', token: grant.token, body: JSON.stringify(cmd) });
        setNote(res.clamped ? 'El robot recortó el ángulo a su rango seguro.' : null);
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        const code = err instanceof ApiError ? err.code : '';
        if (code === 'session_not_started') setNote('Tu bloque todavía no arrancó.');
        else if (code === 'session_expired') setEnded('expired');
        else if (code.startsWith('session_')) setEnded((code.slice(8) as Ended) || 'ended');
        else if (status === 401 || status === 403) setEnded('revoked');
        else if (status === 409) setNote('Está corriendo una rutina. Esperá a que termine o tocá STOP.');
        else if (status === 429) setNote('Más despacio: el robot recibe un comando por vez.');
        else setNote(`No llegó el comando: ${(err as Error).message}`);
      }
    },
    [grant.token]
  );

  const flush = useCallback(() => {
    timer.current = null;
    const batch = pending.current;
    pending.current = {};
    for (const j of JOINTS) {
      const angle = batch[j];
      if (angle !== undefined) send({ cmd: 'joint', args: { joint: j, angle } });
    }
  }, [send]);

  /** Mientras arrastra: junta valores y manda el último cada 100 ms. */
  const queueJoint = useCallback(
    (joint: Joint, angle: number) => {
      setTarget((t) => (t ? { ...t, [joint]: angle } : t));
      pending.current[joint] = angle;
      if (!timer.current) timer.current = setTimeout(flush, COALESCE_MS);
    },
    [flush]
  );

  /** Al soltar: manda el valor final ya. */
  const commitJoint = useCallback(
    (joint: Joint, angle: number) => {
      delete pending.current[joint];
      send({ cmd: 'joint', args: { joint, angle } });
    },
    [send]
  );

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = {};
    resync.current = true;
    send({ cmd: 'stop' });
  }, [send]);

  const dance = (rutina: string) => {
    resync.current = true;
    send({ cmd: 'dance', args: { rutina } });
  };

  const end = async () => {
    stop();
    await api('/api/sessions/end', { method: 'POST', token: grant.token }).catch(() => {});
    setEnded('ended');
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Teclado global. Si el foco está en un slider, las flechas las maneja el slider.
  useEffect(() => {
    if (locked || !shell) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) {
        if (e.code !== 'Space' || (el as HTMLInputElement).type !== 'range') return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) stop();
        return;
      }
      const k = KEYS[e.code];
      const t = targetRef.current;
      if (!k || !t) return;
      e.preventDefault();
      const [joint, dir] = k;
      const [lo, hi] = shell.joints[joint];
      const angle = Math.min(hi, Math.max(lo, t[joint] + dir * STEP));
      if (angle !== t[joint]) queueJoint(joint, angle);
    };
    window.addEventListener('keydown', onDown);
    return () => window.removeEventListener('keydown', onDown);
  }, [locked, shell, stop, queueJoint]);


  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 pb-28 pt-20 md:px-6 md:pt-24 lg:pb-8">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_400px] lg:gap-6">
        <LiveVideo shell={shell} className="aspect-video w-full border border-white/15 lg:aspect-auto lg:h-[calc(100dvh-8rem)]">
          {state && (
            <span className="absolute bottom-3 left-3 right-3 bg-[rgba(0,12,41,0.8)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-white/80 sm:right-auto">
              {JOINTS.map((j) => `${JOINT_LABEL[j]} ${Math.round(state.angles[j])}°`).join(' · ')}
              {typeof state.current_ma === 'number' && ` · ${state.current_ma} mA`}
            </span>
          )}
        </LiveVideo>

        <TelemetryPanel
          label={`Sesión · ${shell?.name ?? grant.shell}`}
          live={!ended}
          aside={
            <span className={cn('font-mono text-[13px] tabular-nums tracking-[0.06em]', left < 60_000 ? 'text-alert-dark' : 'text-white')} aria-label={`${waiting ? 'Arranca en' : 'Quedan'} ${fmtClock(left)}`}>
              {waiting && <span className="mr-2 text-[11px] uppercase text-white/50">arranca en</span>}
              {fmtClock(left)}
            </span>
          }
          className="lg:h-[calc(100dvh-8rem)]"
          footer={
          <div>
            <p className="mb-3 hidden font-mono text-[10px] uppercase leading-relaxed tracking-[0.1em] text-white/40 md:block">
              ← → base · ↑ ↓ hombro · W S codo · A D pinza · espacio STOP
            </p>
            <button
              type="button"
              onClick={stop}
              disabled={locked}
              className="fixed inset-x-4 bottom-4 z-40 h-14 rounded-sm bg-alert-dark font-sans text-[15px] font-semibold uppercase tracking-[0.14em] text-[var(--panel-dark-deep)] shadow-[0_8px_24px_rgba(0,12,41,0.5)] transition-transform duration-fast active:scale-[0.985] disabled:opacity-40 lg:static lg:w-full lg:shadow-none"
            >
              STOP
            </button>
            <button type="button" onClick={end} disabled={!!ended} className="mt-3 w-full text-center font-mono text-[11px] uppercase tracking-[0.16em] text-white/45 hover:text-white disabled:opacity-40">
              Terminar sesión
            </button>
          </div>
          }
        >
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-color:rgba(255,255,255,0.2)_transparent] [scrollbar-width:thin]">
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-white/50" aria-live="polite">
            {waiting ? 'El robot está ocupado. Tu bloque arranca solo cuando termine el anterior.' : state ? (state.rutina ? `Rutina ${state.rutina}` : state.moving ? 'Moviéndose' : 'Quieto') : 'Leyendo estado…'}
          </p>

          <div className="mt-3 flex flex-col gap-3">
            {shell &&
              JOINTS.map((j) => (
                <JointSlider
                  key={j}
                  joint={j}
                  range={shell.joints[j]}
                  value={target?.[j]}
                  real={state?.angles[j]}
                  disabled={locked || !target}
                  onDrag={(a) => queueJoint(j, a)}
                  onCommit={(a) => commitJoint(j, a)}
                />
              ))}
          </div>

          <div className="mt-5 border-t border-white/15 pt-4">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">Rutinas</p>
            <div className="grid grid-cols-2 gap-2">
              {shell?.routines.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={locked}
                  onClick={() => dance(r)}
                  className={cn(
                    'h-10 rounded-sm border font-mono text-[12px] uppercase tracking-[0.1em] transition-colors duration-base ease-out-quint disabled:opacity-40',
                    state?.rutina === r ? 'border-accent bg-white/10 text-white' : 'border-white/20 text-white/80 hover:border-white/60'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-4 min-h-[2.5em] text-[13px] leading-snug text-white/65" role="status">
            {note}
          </p>
          </div>

        </TelemetryPanel>
      </div>

      {ended && <EndedOverlay shell={shell} reason={ended} />}
    </main>
  );
}

function JointSlider({
  joint,
  range: [lo, hi],
  value,
  real,
  disabled,
  onDrag,
  onCommit,
}: {
  joint: Joint;
  range: [number, number];
  value: number | undefined;
  real: number | undefined;
  disabled: boolean;
  onDrag: (a: number) => void;
  onCommit: (a: number) => void;
}) {
  const id = `joint-${joint}`;
  const pct = (a: number) => Math.min(100, Math.max(0, ((a - lo) / (hi - lo)) * 100));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.1em]">
        <label htmlFor={id} className="text-white/70">
          {JOINT_LABEL[joint]} <span className="text-white/35">{lo}° a {hi}°</span>
        </label>
        <span className="tabular-nums text-white/85">
          {value !== undefined ? `${Math.round(value)}°` : '·'}
          <span className="ml-2 text-white/40">real {real !== undefined ? `${Math.round(real)}°` : '·'}</span>
        </span>
      </div>
      <div className="relative">
        <input
          id={id}
          type="range"
          min={lo}
          max={hi}
          step={1}
          value={value ?? lo}
          disabled={disabled}
          onChange={(e) => onDrag(Number(e.target.value))}
          onPointerUp={(e) => onCommit(Number(e.currentTarget.value))}
          aria-valuetext={`${value ?? lo} grados`}
          className="joint-range w-full"
        />
        {real !== undefined && (
          <span aria-hidden className="pointer-events-none absolute top-1/2 h-3 w-px -translate-y-1/2 bg-white/60" style={{ left: `${pct(real)}%` }} />
        )}
      </div>
    </div>
  );
}

function EndedOverlay({ shell, reason }: { shell: Shell | undefined; reason: Ended }) {
  const name = shell?.name ?? 'El shell';
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ended-title"
      className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(0,12,41,0.86)] px-5 backdrop-blur-sm"
    >
      <div className="max-w-[40rem] text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/55">
          {reason === 'offline' ? 'El robot se desconectó' : reason === 'revoked' ? 'Token vencido' : 'Fin del bloque'}
        </p>
        <h1 id="ended-title" className="mt-4 font-display text-[clamp(2rem,4.5vw,3.5rem)] font-light leading-[1.05] text-white">
          Sesión terminada · {name} vuelve a HOME
        </h1>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Pill as="link" to={`/shells/${shell?.id ?? 'el-tucu'}`} label="Alquilar otro bloque" />
          <Pill as="link" to="/" variant="secondary" label="Volver al inicio" />
        </div>
        <Link to="/agents" className="mt-8 inline-block font-mono text-[11px] uppercase tracking-[0.16em] text-white/45 hover:text-white">
          ¿Lo querés usar desde un agente?
        </Link>
      </div>
    </div>
  );
}
