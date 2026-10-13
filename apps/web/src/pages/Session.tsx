import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Angles, Command, Joint, SessionGrant, Shell } from '@ras/shell-spec';
import { LiveVideo } from '@/components/LiveVideo';
import { Panel } from '@/components/Panel';
import { Button } from '@/components/Button';
import { Readout } from '@/components/Readout';
import { ApiError, api, clearGrant, fmtClock, loadGrant, toMs, useEvents, useNow, useShell, useShellState, type SessionInfo } from '@/lib/api';
import { JOINTS, JOINT_LABEL, routineLabel } from '@/lib/joints';
import { cn } from '@/lib/cn';

const STEP = 5;
const COALESCE_MS = 100;

// Keyboard: arrows for base and shoulder, W/S elbow, A/D grip, space STOP.
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

/** Session console: the only full-bench surface. Product register, 150 to 250 ms motion, keyboard first. */
export default function SessionPage() {
  const [grant] = useState(loadGrant);
  if (!grant) {
    return (
      <main className="on-bench grid min-h-viewport place-items-center bg-bench px-4 pt-16 text-center text-bench-ink">
        <div className="max-w-prose">
          <Readout label="Session" value="— —" surface="bench" className="items-center" />
          <h1 className="wide-106 mt-6 text-h1 text-bench-ink">There is no active session in this tab.</h1>
          <p className="mt-4 text-body text-bench-ink-2">Rent some time from a shell page and the console opens here.</p>
          <Button as="link" to="/#shells" label="Pick a shell" className="mt-8" />
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

  // If the robot was busy, the block starts later: until then the controls wait.
  const waiting = now < startsAt;
  const left = waiting ? startsAt - now : expiresAt - now;
  const locked = !!ended || waiting;

  // The gateway confirms the token is still alive (another tab may have ended it).
  const check = useQuery({
    queryKey: ['session', grant.sid],
    queryFn: () => api<SessionInfo>('/api/session', { token: grant.token }),
    refetchInterval: 15_000,
    retry: false,
  });
  useEffect(() => {
    if (check.data?.ended) setEnded(check.data.ended);
    // A token for a queued block is not valid yet (nbf): it does not count as expired.
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

  // Sliders start (and resync after STOP or a routine) at the real angles.
  useEffect(() => {
    // While a routine runs the sliders follow the robot; when it ends they stay at the final pose.
    if (state && (resync.current || state.rutina)) {
      resync.current = !!state.rutina;
      setTarget(state.angles);
    }
  }, [state]);

  const send = useCallback(
    async (cmd: Command) => {
      try {
        const res = await api<{ clamped?: boolean; error?: string }>('/api/cmd', { method: 'POST', token: grant.token, body: JSON.stringify(cmd) });
        setNote(res.clamped ? 'The robot clamped the angle to its safe range.' : null);
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        const code = err instanceof ApiError ? err.code : '';
        if (code === 'session_not_started') setNote('Your time has not started yet.');
        else if (code === 'session_expired') setEnded('expired');
        else if (code.startsWith('session_')) setEnded((code.slice(8) as Ended) || 'ended');
        else if (status === 401 || status === 403) setEnded('revoked');
        else if (status === 409) setNote('A routine is running. Wait for it to finish or press STOP.');
        else if (status === 429) setNote('Slow down: the robot takes one command at a time.');
        else setNote(`The command did not go through: ${(err as Error).message}`);
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

  /** While dragging: collect values and send the latest every 100 ms. */
  const queueJoint = useCallback(
    (joint: Joint, angle: number) => {
      setTarget((t) => (t ? { ...t, [joint]: angle } : t));
      pending.current[joint] = angle;
      if (!timer.current) timer.current = setTimeout(flush, COALESCE_MS);
    },
    [flush]
  );

  /** On release: send the final value right away. */
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

  // Global keyboard. If focus is on a slider, the slider handles the arrows.
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

  const urgent = !waiting && left < 60_000;
  const activity = waiting
    ? 'Robot busy. Your time starts on its own when the previous session ends.'
    : state
      ? state.rutina
        ? `Routine: ${routineLabel(state.rutina)}`
        : state.moving
          ? 'Moving'
          : 'Idle'
      : 'Reading state…';

  return (
    <main className="on-bench min-h-viewport bg-bench px-4 pb-28 pt-20 text-bench-ink md:px-6 lg:pb-6">
      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-4 lg:grid-cols-[1fr_420px] lg:gap-5">
        <LiveVideo shell={shell} className="aspect-video w-full lg:aspect-auto lg:h-[calc(100dvh-6.5rem)]">
          {state && (
            <div className="absolute bottom-0 left-0 right-0 z-10 grid grid-cols-2 gap-px border-t border-bench-rule bg-bench-rule sm:grid-cols-5">
              {JOINTS.map((j) => (
                <div key={j} className="bg-bench/90 px-3 py-2">
                  <p className="font-mono text-mono-xs uppercase text-bench-ink-2">{JOINT_LABEL[j]}</p>
                  <p className="tabular font-mono text-data text-bench-ink">{Math.round(state.angles[j])}<span className="text-mono text-bench-ink-2">°</span></p>
                </div>
              ))}
              <div className="bg-bench/90 px-3 py-2">
                <p className="font-mono text-mono-xs uppercase text-bench-ink-2">Current</p>
                <p className="tabular font-mono text-data text-bench-ink">
                  {typeof state.current_ma === 'number' ? state.current_ma : '—'}
                  <span className="text-mono text-bench-ink-2"> mA</span>
                </p>
              </div>
            </div>
          )}
        </LiveVideo>

        <Panel
          label={`Session · ${shell?.name ?? grant.shell}`}
          live={!ended}
          aside={
            <span className={cn('tabular font-mono text-data', urgent ? 'text-warn' : 'text-bench-ink')} aria-label={`${waiting ? 'Starts in' : 'Time left'} ${fmtClock(left)}`}>
              {waiting && <span className="mr-2 text-mono-xs uppercase text-bench-ink-2">starts in</span>}
              {fmtClock(left)}
            </span>
          }
          className="lg:h-[calc(100dvh-6.5rem)]"
          footer={
            <div>
              <p className="mb-3 hidden font-mono text-mono-xs uppercase leading-relaxed text-bench-ink-2 md:block">
                ← → base · ↑ ↓ shoulder · W S elbow · A D grip · space STOP
              </p>
              <Button
                variant="danger"
                size="lg"
                roll={false}
                label="STOP"
                onClick={stop}
                disabled={locked}
                className="fixed inset-x-4 bottom-4 z-40 w-auto shadow-[0_4px_0_var(--bench)] lg:static lg:w-full lg:shadow-none"
              />
              <button type="button" onClick={end} disabled={!!ended} className="mt-3 w-full text-center font-mono text-mono-xs uppercase text-bench-ink-2 transition-colors duration-fast hover:text-bench-ink hover:underline disabled:opacity-40">
                End session
              </button>
            </div>
          }
        >
          <div className="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden pr-1 [scrollbar-color:var(--bench-rule)_transparent] [scrollbar-width:thin]">
            <p className={cn('font-mono text-mono uppercase', waiting ? 'text-warn' : 'text-bench-ink-2')} aria-live="polite">
              {activity}
            </p>

            <div className="mt-4 flex flex-col gap-4">
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

            <div className="mt-6 border-t border-bench-rule pt-4">
              <p className="mb-3 font-mono text-mono-xs uppercase text-bench-ink-2">Routines</p>
              <div className="grid grid-cols-2 gap-2">
                {shell?.routines.map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={locked}
                    onClick={() => dance(r)}
                    aria-pressed={state?.rutina === r}
                    className={cn(
                      'h-10 rounded-sm border font-mono text-mono uppercase transition-colors duration-base ease-out disabled:opacity-40',
                      state?.rutina === r ? 'border-signal bg-signal text-ink' : 'border-bench-rule text-bench-ink hover:border-bench-ink'
                    )}
                  >
                    {routineLabel(r)}
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-4 min-h-[2.5em] text-small text-bench-ink-2" role="status">
              {note}
            </p>
          </div>
        </Panel>
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
      <div className="mb-1 flex items-baseline justify-between font-mono text-mono-xs uppercase">
        <label htmlFor={id} className="text-bench-ink">
          {JOINT_LABEL[joint]} <span className="text-bench-ink-2">{lo}° to {hi}°</span>
        </label>
        <span className="tabular text-bench-ink">
          {value !== undefined ? `${Math.round(value)}°` : '·'}
          <span className="ml-2 text-bench-ink-2">real {real !== undefined ? `${Math.round(real)}°` : '·'}</span>
        </span>
      </div>
      <div className="relative">
        {/* range ticks: the slider reads as an instrument scale */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-[2px]">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className={cn('w-px bg-bench-rule', i % 4 === 0 ? 'h-4' : 'h-2')} />
          ))}
        </div>
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
          aria-valuetext={`${value ?? lo} degrees`}
          className="joint-range relative w-full"
        />
        {real !== undefined && (
          <span aria-hidden className="pointer-events-none absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-signal" style={{ left: `${pct(real)}%` }} />
        )}
      </div>
    </div>
  );
}

function EndedOverlay({ shell, reason }: { shell: Shell | undefined; reason: Ended }) {
  const name = shell?.name ?? 'The shell';
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const kicker = reason === 'offline' ? 'Robot disconnected' : reason === 'revoked' ? 'Token expired' : 'Time is up';
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ended-title"
      className="on-bench fixed inset-0 z-[60] grid place-items-center bg-bench/90 px-4"
    >
      <div className="w-full max-w-[40rem] border border-bench-rule bg-bench-2 p-6 text-center md:p-10">
        <p className="font-mono text-mono-xs uppercase text-bench-ink-2">{kicker}</p>
        <h1 id="ended-title" className="wide-106 mt-4 text-h1 text-bench-ink">
          Session ended. {name} returns to HOME.
        </h1>
        {reason === 'offline' && <p className="mt-4 text-body text-bench-ink-2">Paid with escrow? The gateway refunds this session on its own.</p>}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button as="link" to={`/shells/${shell?.id ?? 'el-tucu'}`} label="Rent more time" />
          <Button as="link" to="/" variant="secondary" surface="bench" label="Back to home" />
        </div>
        <Link to="/agents" className="mt-6 inline-block font-mono text-mono-xs uppercase text-bench-ink-2 hover:text-bench-ink hover:underline">
          Use it from an agent instead
        </Link>
      </div>
    </div>
  );
}
