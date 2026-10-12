import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Payment, Shell } from '@ras/shell-spec';
import { Orb, Cursor, useLenis, useOrbPath, useHeroChars, type OrbColors, type OrbKey } from '@/motion-kit';
import { Chars } from '@/motion-kit/split';
import { LiveVideo } from '@/components/LiveVideo';
import { Pill } from '@/components/Pill';
import { Eyebrow } from '@/components/Eyebrow';
import { SectionHeading } from '@/components/SectionHeading';
import { StatusDot } from '@/components/StatusDot';
import { TelemetryPanel } from '@/components/TelemetryPanel';
import { Footer } from '@/components/Footer';
import { fmtClock, shellHref, toMs, useEvents, useNow, useQueue, useShells, useShellState } from '@/lib/api';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useReveal } from '@/lib/useReveal';
import { JOINTS, JOINT_LABEL } from '@/lib/joints';

// Orb en la familia navy + acento de landing2 (en lugar del amarillo/rosa de offbrand).
const ORB_COLORS: OrbColors = { a: '#007CEB', b: '#3D8FF5', c: '#9CC4F2', d: '#001B3D', e: '#0A3A78' };

// Recorrido propio: arranca detrás del video del hero y se apaga antes de "Cómo funciona".
const ORB_KEYS: OrbKey[] = [
  { p: 0, w: 0.92, cx: 0.74, cy: 0.52 },
  { p: 0.08, w: 0.7, cx: 0.82, cy: 0.35 },
  { p: 0.16, w: 0, cx: 0.9, cy: 0.2 },
  { p: 1, w: 0, cx: 0.9, cy: 0.2 },
];

const STEPS = [
  { n: '0.1', title: 'Elegí', body: 'Un shell y cuántos bloques de cinco minutos querés. Ves la cámara y la cola antes de pagar.' },
  { n: '0.2', title: 'Pagá', body: 'USDC en Solana: un QR de Solana Pay, o x402 si sos un agente. El precio queda fijo al confirmar.' },
  { n: '0.3', title: 'Controlá', body: 'Movés cada articulación, corrés rutinas y frenás cuando quieras. Al vencer, vuelve solo a HOME.' },
];

export default function Landing() {
  const reduced = useReducedMotion();
  const orb = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const [finePointer] = useState(() => matchMedia('(pointer: fine)').matches);

  useLenis();
  useOrbPath(orb, ORB_KEYS);
  useHeroChars(hero, { after: null });

  // El orb va fijo detrás de todo (z −2): el body tiene que dejarlo ver mientras dure la landing.
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = 'transparent';
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  const { data: shells } = useShells();
  const tucu = shells?.[0];

  return (
    <>
      <Orb ref={orb} colors={ORB_COLORS} rings={false} />
      {finePointer && !reduced && <Cursor className="bg-white" size={28} />}

      <main>
        <Hero refEl={hero} shell={tucu} />
        <HowItWorks />
        <Audiences />
        <Shells shells={shells} />
        <LiveNumbers shell={tucu} />
        <Closing shell={tucu} />
      </main>
    </>
  );
}

function Hero({ refEl, shell }: { refEl: React.RefObject<HTMLElement>; shell: Shell | undefined }) {
  const title = 'Mové un robot real desde el navegador.';
  const city = shell?.location.split(',')[0] ?? 'Salta';
  const status = shell?.status ?? 'offline';
  const hud = `${shell?.name ?? 'El Tucu'} · ${status === 'busy' ? 'en uso' : status} · ${city}`;

  return (
    <section ref={refEl} id="hero" className="relative min-h-viewport">
      <div className="mx-auto grid min-h-viewport w-full max-w-container grid-cols-1 items-center gap-10 px-5 pb-12 pt-28 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pb-16">
        <div>
          <p className="mb-6 flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.16em] text-white/70">
            <span aria-hidden className={status === 'offline' ? 'h-2 w-2 rounded-full bg-white/30' : 'h-2 w-2 animate-status-pulse rounded-full bg-accent'} />
            {hud}
          </p>
          <h1 className="font-display font-light tracking-[-0.015em] text-white" style={{ fontSize: 'clamp(2.75rem, 6vw, 5.25rem)', lineHeight: 1.02 }} aria-label={title}>
            <span aria-hidden>
              {title.split(' ').map((w, i) => (
                <span key={i}>
                  <span className="inline-block overflow-hidden whitespace-nowrap pb-[0.08em] align-top">
                    <Chars text={w} />
                  </span>{' '}
                </span>
              ))}
            </span>
          </h1>
          <p className="mt-6 max-w-[46ch] text-[1.125rem] font-light leading-[1.55] text-white/80 md:text-[1.25rem]">
            El Tucu es un brazo de cuatro ejes en Salta. Lo alquilás por bloques de cinco minutos, lo ves por cámara y lo controlás vos o tu agente.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Pill as="link" to={`/shells/${shell?.id ?? 'el-tucu'}`} label="Probar El Tucu" />
            <Pill as="link" to="/agents" variant="secondary" label="Para agentes" />
          </div>
        </div>

        <div className="relative">
          <LiveVideo shell={shell} className="aspect-[4/3] w-full border border-white/15">
            <span className="absolute bottom-3 right-3 bg-[rgba(0,12,41,0.8)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-white/75">
              {shell?.location ?? 'Salta, AR'}
            </span>
          </LiveVideo>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const reveal = useReveal();
  return (
    <section id="como-funciona" className="relative bg-bg py-24 md:py-32">
      <div className="mx-auto w-full max-w-container px-5 md:px-8">
        <motion.div {...reveal()}>
          <Eyebrow>Cómo funciona</Eyebrow>
        </motion.div>
        <SectionHeading title="Tres pasos, como un manual." anim={reveal} />
        <ol className="mt-16 grid grid-cols-1 border-t border-hairline md:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.li key={s.n} {...reveal(0.1 * i)} className="border-b border-hairline py-8 md:border-b-0 md:border-l md:px-8 md:first:border-l-0 md:first:pl-0">
              <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-accent">{s.n}</p>
              <h3 className="mt-4 font-display text-[clamp(1.5rem,2.4vw,2.125rem)] font-light leading-tight text-ink">{s.title}</h3>
              <p className="mt-3 max-w-[38ch] text-[1.0625rem] font-light leading-[1.6] text-ink-soft">{s.body}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Audiences() {
  const reveal = useReveal();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const curl = `curl -i -X POST \\
  "${origin}/api/sessions/x402?shell=el-tucu&blocks=1"`;
  const response = [
    'HTTP/1.1 402 Payment Required',
    'payment-required: eyJ4NDAyVmVyc2lvbiI6Miwi…',
    '',
    '# decodificado',
    '{',
    '  "x402Version": 2,',
    '  "accepts": [{',
    '    "scheme": "exact",',
    '    "network": "solana:EtWT…",',
    '    "amount": "1000000",  // 1 USDC',
    '    "description": "El Tucu · 1 bloque de 5 min"',
    '  }]',
    '}',
  ];

  return (
    <section id="para-quien" className="relative bg-[var(--panel-dark-deep)] py-24 md:py-32">
      <div className="mx-auto grid w-full max-w-container grid-cols-1 gap-16 px-5 md:px-8 lg:grid-cols-2 lg:gap-20">
        <div>
          <motion.div {...reveal()}>
            <Eyebrow dark>Para personas</Eyebrow>
          </motion.div>
          <SectionHeading
            tone="dark"
            title="Pagás como ya pagás."
            body={[
              'Escaneás un QR de Solana Pay con Phantom o Solflare y pagás en USDC. Elegís los bloques, se confirma en segundos y la consola se abre sola.',
              'La consola tiene cuatro sliders, rutinas y un STOP grande. También anda con teclado.',
            ]}
            anim={reveal}
          />
          <motion.div {...reveal(0.3)} className="mt-10">
            <Pill as="link" to="/shells/el-tucu" label="Elegir bloques" />
          </motion.div>
        </div>

        <div>
          <motion.div {...reveal()}>
            <Eyebrow dark>Para agentes</Eyebrow>
          </motion.div>
          <SectionHeading
            tone="dark"
            title="Un POST, un 402, un token."
            body="Tu agente lee llms.txt, paga en USDC por x402 y recibe un token para mandar comandos. Sin cuenta, sin formulario."
            anim={reveal}
          />
          <motion.pre
            {...reveal(0.2)}
            className="mt-10 overflow-x-auto border border-white/15 bg-[var(--panel-dark)] p-5 font-mono text-[12px] leading-[1.7] text-white/80"
          >
            <code>
              <span className="text-white/45">$ </span>
              {curl}
              {'\n\n'}
              {response.map((l, i) => (
                <motion.span key={i} className="block" {...reveal(0.4 + i * 0.05)}>
                  {i === 0 ? <span className="text-white">{l}</span> : l || ' '}
                </motion.span>
              ))}
            </code>
          </motion.pre>
          <motion.div {...reveal(0.3)} className="mt-6">
            <Link to="/agents" className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline">
              Ver la guía para agentes
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Shells({ shells }: { shells: Shell[] | undefined }) {
  const reveal = useReveal();
  return (
    <section id="shells" className="relative scroll-mt-20 bg-bg py-24 md:py-32">
      <div className="mx-auto w-full max-w-container px-5 md:px-8">
        <motion.div {...reveal()}>
          <Eyebrow>Shells disponibles</Eyebrow>
        </motion.div>
        <SectionHeading title={shells?.some((s) => s.status !== 'offline') ? 'Hoy hay uno. Está prendido.' : 'Hoy hay uno.'} anim={reveal} />
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2">
          {shells === undefined && <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-ink-mute">Cargando shells…</p>}
          {shells?.length === 0 && <p className="text-ink-soft">No hay shells publicados en este momento.</p>}
          {shells?.map((s, i) => (
            <motion.div key={s.id} {...reveal(0.1 * i)}>
              <ShellCard shell={s} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ShellCard({ shell }: { shell: Shell }) {
  const { data: state } = useShellState(shell.id, 3_000);
  const angles = state?.angles;
  return (
    <Link to={shellHref(shell)} className="group block rounded-sm bg-bg-inset p-6 shadow-[var(--shadow-hairline)] transition-shadow duration-base hover:shadow-[inset_0_0_0_1px_var(--hairline-strong)] md:p-8">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-mute">{shell.kind} · {shell.location}</p>
        <StatusDot status={shell.status} className="text-ink" />
      </div>
      <h3 className="mt-6 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-light leading-none text-ink">{shell.name}</h3>
      <dl className="mt-8 grid grid-cols-4 gap-3 border-t border-hairline pt-4">
        {JOINTS.map((j) => (
          <div key={j}>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mute">{JOINT_LABEL[j]}</dt>
            <dd className="mt-1 font-mono text-[15px] text-ink">{angles ? `${Math.round(angles[j])}°` : '·'}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex items-end justify-between border-t border-hairline pt-4">
        <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-ink-soft">
          USD {shell.pricing.usd} · {shell.pricing.block_minutes} min
        </p>
        <span className="roll-parent font-sans text-[13px] font-medium uppercase tracking-[0.08em] text-accent">
          Ver ficha <span className="arrow">→</span>
        </span>
      </div>
    </Link>
  );
}

function LiveNumbers({ shell }: { shell: Shell | undefined }) {
  const reveal = useReveal();
  const now = useNow();
  const { data: queue } = useQueue(shell?.id);
  const [sessions, setSessions] = useState(0);
  const [lastPay, setLastPay] = useState<Pick<Payment, 'rail' | 'tx' | 'explorerUrl'> & { at: number } | null>(null);
  const connected = useEvents((e) => {
    if (e.type === 'session_started') setSessions((n) => n + 1);
    if (e.type === 'payment_seen') setLastPay({ rail: e.rail, tx: e.tx, explorerUrl: e.explorerUrl, at: Date.now() });
  });

  const active = queue?.active;
  const rows = [
    { label: 'Estado', value: <StatusDot status={shell?.status} /> },
    { label: 'Sesión en curso', value: active ? `${active.rail} · quedan ${fmtClock(toMs(active.expires_at) - now)}` : 'Libre' },
    { label: 'En cola', value: queue ? String(queue.waiting) : '·' },
    { label: 'Sesiones desde que llegaste', value: String(sessions) },
    {
      label: 'Último pago',
      value: lastPay ? (
        lastPay.explorerUrl ? (
          <a href={lastPay.explorerUrl} target="_blank" rel="noopener" className="underline underline-offset-4 hover:text-white">
            {lastPay.rail} · {lastPay.tx ? `${lastPay.tx.slice(0, 10)}…` : 'ver'} ↗
          </a>
        ) : (
          lastPay.rail
        )
      ) : (
        'Esperando el próximo'
      ),
    },
  ];

  return (
    <section id="en-vivo" className="relative bg-[var(--panel-dark-deep)] py-24 md:py-32">
      <div className="mx-auto grid w-full max-w-container grid-cols-1 items-start gap-12 px-5 md:px-8 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div>
          <motion.div {...reveal()}>
            <Eyebrow dark>En vivo</Eyebrow>
          </motion.div>
          <SectionHeading
            tone="dark"
            title="Lo que pasa ahora en el gateway."
            body="Cada sesión y cada pago llegan por eventos del gateway. Si alguien está moviendo a El Tucu, lo ves acá."
            anim={reveal}
          />
        </div>
        <motion.div {...reveal(0.15)}>
          <TelemetryPanel
            label="GATEWAY · EVENTOS"
            aside={<span className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">{connected ? 'conectado' : 'reconectando'}</span>}
            live={connected}
            rows={rows}
          />
        </motion.div>
      </div>
    </section>
  );
}

function Closing({ shell }: { shell: Shell | undefined }) {
  const reveal = useReveal();
  return (
    <section id="cierre" className="relative bg-[var(--panel-dark-deep)] pt-24 md:pt-32">
      <div className="mx-auto w-full max-w-container px-5 pb-24 md:px-8 md:pb-32">
        <SectionHeading
          size="display"
          tone="dark"
          title="Cinco minutos alcanzan para saber si tu código mueve algo real."
          body={`Un bloque cuesta USD ${shell?.pricing.usd ?? '1.00'}. Al vencer, El Tucu vuelve a HOME solo.`}
          anim={reveal}
        />
        <motion.div {...reveal(0.28)} className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Pill as="link" to={`/shells/${shell?.id ?? 'el-tucu'}`} label="Alquilar un bloque" />
          <Pill as="a" href="/llms.txt" variant="secondary" label="Leer llms.txt" />
        </motion.div>
      </div>
      <Footer />
    </section>
  );
}
