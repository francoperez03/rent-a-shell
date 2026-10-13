import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Payment, Shell } from '@ras/shell-spec';
import { LiveVideo } from '@/components/LiveVideo';
import { Button } from '@/components/Button';
import { Readout } from '@/components/Readout';
import { SectionIndex } from '@/components/SectionIndex';
import { StatusDot } from '@/components/StatusDot';
import { Panel } from '@/components/Panel';
import { Footer } from '@/components/Footer';
import { fmtClock, shellHref, toMs, useEvents, useNow, useQueue, useShells, useShellState } from '@/lib/api';
import { useReveal } from '@/lib/useReveal';
import { JOINTS, JOINT_LABEL } from '@/lib/joints';
import { cn } from '@/lib/cn';

const STEPS = [
  { n: '01', title: 'Rent', body: 'Pick a shell and how many five-minute blocks you need. You see the camera, the ranges and the queue before paying.' },
  { n: '02', title: 'Run', body: 'Move each joint from the console, run a routine, or let your agent send the commands over HTTP or MCP.' },
  { n: '03', title: 'Measure', body: 'Read the real angles, the current each move draws and the frames. Then fix the code and run it again.' },
];

/** Landing: brand register. Paper, one signal band, measurements as the hero image. */
export default function Landing() {
  const { data: shells } = useShells();
  const tucu = shells?.[0];

  return (
    <main>
      <Hero shell={tucu} />
      <Numbers shell={tucu} />
      <HowItWorks />
      <Audiences shell={tucu} />
      <Shells shells={shells} />
      <LiveNumbers shell={tucu} />
      <Closing shell={tucu} />
    </main>
  );
}

function Hero({ shell }: { shell: Shell | undefined }) {
  const reveal = useReveal();
  const { data: state } = useShellState(shell?.id, 2_000);
  const city = shell?.location.split(',')[0] ?? 'Tucumán';

  return (
    <section id="hero" className="dot-grid relative border-b border-rule">
      <div className="mx-auto grid w-full max-w-container grid-cols-1 items-end gap-10 px-4 pb-12 pt-28 md:px-6 md:pt-36 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pb-16">
        <div>
          <motion.p {...reveal()} className="flex items-center gap-3 font-mono text-mono uppercase text-ink-3">
            <StatusDot status={shell?.status} />
            <span>{shell?.name ?? 'El Tucu'} · {city}</span>
          </motion.p>
          <motion.h1 {...reveal(0.05)} className="wide-112 mt-5 max-w-[16ch] text-display">
            Test your code on real hardware. Today.
          </motion.h1>
          <motion.p {...reveal(0.1)} className="mt-6 max-w-[44ch] text-lead text-ink-2">
            {shell?.name ?? 'El Tucu'} is a four-axis arm in {city}, Argentina. Rent it in five-minute blocks, run your code against it, read the real angles and current, and watch it on camera.
          </motion.p>
          <motion.div {...reveal(0.15)} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button as="link" to={shell ? shellHref(shell) : '/shells/el-tucu'} label={`Rent ${shell?.name ?? 'El Tucu'}`} />
            <Button as="link" to="/agents" variant="secondary" label="For agents" />
          </motion.div>
        </div>

        <motion.div {...reveal(0.1)}>
          <LiveVideo shell={shell} className="aspect-[4/3] w-full">
            <span className="absolute right-3 top-3 border border-bench-rule bg-bench/85 px-2 py-1 font-mono text-mono-xs uppercase text-bench-ink-2">
              {shell?.location ?? 'Tucumán, AR'}
            </span>
          </LiveVideo>
          <dl className="grid grid-cols-3 gap-px border border-t-0 border-bench-rule bg-bench-rule sm:grid-cols-5">
            {JOINTS.map((j) => (
              <div key={j} className="bg-bench px-3 py-2">
                <Readout label={JOINT_LABEL[j]} value={state ? Math.round(state.angles[j]) : '—'} unit="°" surface="bench" />
              </div>
            ))}
            <div className="bg-bench px-3 py-2">
              <Readout label="Current" value={typeof state?.current_ma === 'number' ? state.current_ma : '—'} unit="mA" surface="bench" live={typeof state?.current_ma === 'number'} />
            </div>
          </dl>
        </motion.div>
      </div>
    </section>
  );
}

/** The signal band: three hard numbers, the argument in one line. */
function Numbers({ shell }: { shell: Shell | undefined }) {
  const price = shell?.pricing.usd ?? '1.00';
  const minutes = shell?.pricing.block_minutes ?? 5;
  const parts = shell?.build.parts_usd ?? 45;
  const days = shell?.build.lead_days ?? 14;
  return (
    <section aria-label="Key numbers" className="bg-signal text-ink">
      <dl className="mx-auto grid w-full max-w-container grid-cols-1 divide-y divide-ink/20 px-4 md:grid-cols-3 md:divide-x md:divide-y-0 md:px-6">
        <Band k="A block" v={`$${price}`} u={`/ ${minutes} min`} note="Pay per use, in USDC on Solana." />
        <Band k="Owning this arm" v={`$${parts}`} u="in parts" note={`Plus ${days} days of shipping and a day of assembly.`} />
        <Band k="Waiting" v="0" u="days" note="The robot is online now. First test in the next five minutes." />
      </dl>
    </section>
  );
}

function Band({ k, v, u, note }: { k: string; v: string; u: string; note: string }) {
  return (
    <div className="py-6 md:px-6 md:first:pl-0 md:last:pr-0">
      <dt className="font-mono text-mono-xs uppercase text-ink/70">{k}</dt>
      <dd className="mt-1">
        <span className="tabular font-mono text-data-lg">{v}</span>
        <span className="ml-2 font-mono text-mono text-ink/70">{u}</span>
      </dd>
      <dd className="mt-2 max-w-[32ch] text-small text-ink/80">{note}</dd>
    </div>
  );
}

function HowItWorks() {
  const reveal = useReveal();
  return (
    <section id="how-it-works" className="py-section">
      <div className="mx-auto w-full max-w-container px-4 md:px-6">
        <SectionIndex index="01" title="Three steps, like a bench test." anim={reveal()} />
        <ol className="mt-12 grid grid-cols-1 gap-px bg-rule md:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.li key={s.n} {...reveal(0.08 * i)} className="bg-paper py-6 md:px-8 md:first:pl-0 md:last:pr-0">
              <p className="tabular font-mono text-mono text-signal-deep">{s.n}</p>
              <h3 className="wide-106 mt-3 text-h2">{s.title}</h3>
              <p className="mt-3 max-w-[36ch] text-body text-ink-2">{s.body}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Audiences({ shell }: { shell: Shell | undefined }) {
  const reveal = useReveal();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const response = [
    'HTTP/1.1 402 Payment Required',
    'payment-required: eyJ4NDAyVmVyc2lvbiI6Miwi…',
    '',
    '# decoded',
    '{ "accepts": [{ "scheme": "exact",',
    '    "network": "solana:EtWT…",',
    '    "amount": "1000000",   // 1 USDC',
    '    "description": "El Tucu · 1 block of 5 min" }] }',
  ];

  return (
    <section id="who-its-for" className="border-t border-rule bg-paper-2 py-section">
      <div className="mx-auto w-full max-w-container px-4 md:px-6">
        <SectionIndex index="02" title="Who it is for" anim={reveal()} />
        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[1.3fr_1fr_1fr] lg:gap-8">
          <motion.article {...reveal()} className="border-t-2 border-ink pt-5">
            <p className="font-mono text-mono-xs uppercase text-ink-3">Small hardware teams</p>
            <h3 className="wide-106 mt-3 text-h2">You wrote the firmware with AI. Now run it on something real.</h3>
            <p className="mt-4 max-w-prose text-body text-ink-2">
              A simulator never shows the servo that lands two degrees short or the current spike when a joint stalls. Rent the arm, run your sequence, read the measurements, fix the code. Five minutes, one dollar, no equipment to buy.
            </p>
            <Button as="link" to={shell ? shellHref(shell) : '/shells/el-tucu'} label="Rent a block" className="mt-6" />
          </motion.article>

          <motion.article {...reveal(0.08)} className="min-w-0 border-t border-rule pt-5">
            <p className="font-mono text-mono-xs uppercase text-ink-3">AI agents</p>
            <h3 className="mt-3 text-h3">One POST, one 402, one token.</h3>
            <p className="mt-3 text-small text-ink-2">Your agent reads llms.txt, pays with x402 and sends commands. No account, no form.</p>
            <pre className="on-bench mt-5 overflow-x-auto border border-bench-rule bg-bench p-4 font-mono text-mono-xs leading-[1.7] text-bench-ink">
              <code>
                <span className="text-bench-ink-2">$ </span>curl -X POST {origin}/api/sessions/x402?shell=el-tucu&blocks=1{'\n'}
                {response.map((l, i) => (
                  <span key={i} className={cn('block', i === 0 && 'text-signal')}>{l || ' '}</span>
                ))}
              </code>
            </pre>
            <Link to="/agents" className="mt-4 inline-block font-mono text-mono uppercase text-signal-deep underline-offset-4 hover:underline">Agent guide</Link>
          </motion.article>

          <motion.article {...reveal(0.16)} className="min-w-0 border-t border-rule pt-5">
            <p className="font-mono text-mono-xs uppercase text-ink-3">Forgers</p>
            <h3 className="mt-3 text-h3">Have a robot sitting idle? Publish it.</h3>
            <p className="mt-3 text-small text-ink-2">
              Run the gateway next to your hardware, set the price, get paid per minute in your own wallet. Customization requests come to you.
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-rule pt-4">
              <Readout label="Your cut" value="90" unit="%" />
              <Readout label="Setup" value="1" unit="command" />
            </dl>
            <a href="https://github.com/francoperez03/rent-a-shell/blob/main/docs/forgers.md" rel="noopener" className="mt-4 inline-block font-mono text-mono uppercase text-signal-deep underline-offset-4 hover:underline">Become a Forger</a>
          </motion.article>
        </div>
      </div>
    </section>
  );
}

function Shells({ shells }: { shells: Shell[] | undefined }) {
  const reveal = useReveal();
  const online = shells?.filter((s) => s.status !== 'offline').length ?? 0;
  return (
    <section id="shells" className="scroll-mt-16 border-t border-rule py-section">
      <div className="mx-auto w-full max-w-container px-4 md:px-6">
        <SectionIndex
          index="03"
          title="Shells"
          anim={reveal()}
          aside={shells && <Readout label="Online now" value={online} unit={`/ ${shells.length}`} />}
        />
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
          {shells === undefined && (
            <>
              <div className="skeleton h-56" aria-hidden />
              <div className="skeleton h-56" aria-hidden />
            </>
          )}
          {shells?.length === 0 && <p className="text-body text-ink-2">No shells are published right now. Forgers add them from their own gateway.</p>}
          {shells?.map((s, i) => (
            <motion.div key={s.id} {...reveal(0.08 * i)}>
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
    <Link to={shellHref(shell)} className="group block border border-rule bg-paper transition-colors duration-base hover:border-ink">
      <div className="flex items-center justify-between border-b border-rule px-5 py-3">
        <p className="font-mono text-mono-xs uppercase text-ink-3">{shell.kind} · {shell.location}</p>
        <StatusDot status={shell.status} />
      </div>
      <div className="px-5 py-5">
        <h3 className="wide-106 text-h2">{shell.name}</h3>
        <p className="mt-1 font-mono text-mono-xs uppercase text-ink-3">Forger {shell.forger.name}</p>
        <dl className="mt-6 grid grid-cols-4 gap-3 border-t border-rule pt-4">
          {JOINTS.map((j) => (
            <Readout key={j} label={JOINT_LABEL[j]} value={angles ? Math.round(angles[j]) : '—'} unit="°" />
          ))}
        </dl>
      </div>
      <div className="flex items-end justify-between border-t border-rule px-5 py-4">
        <p className="tabular font-mono text-mono text-ink">
          ${shell.pricing.usd} <span className="text-ink-3">/ {shell.pricing.block_minutes} min</span>
        </p>
        <span className="roll-parent font-mono text-mono uppercase text-signal-deep">
          Open <span className="arrow">→</span>
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
    { label: 'Current session', value: active ? `${fmtClock(toMs(active.expires_at) - now)} left` : 'Free' },
    { label: 'In queue', value: queue ? String(queue.waiting) : '—' },
    { label: 'Sessions since you arrived', value: String(sessions) },
    {
      label: 'Last payment',
      value: lastPay ? (
        lastPay.explorerUrl ? (
          <a href={lastPay.explorerUrl} target="_blank" rel="noopener" className="text-signal underline-offset-4 hover:underline">
            {lastPay.tx ? `${lastPay.tx.slice(0, 8)}…` : lastPay.rail} ↗
          </a>
        ) : (
          lastPay.rail
        )
      ) : (
        '—'
      ),
    },
  ];

  return (
    <section id="live" className="on-bench dot-grid-bench border-t border-bench-rule bg-bench py-section text-bench-ink">
      <div className="mx-auto grid w-full max-w-container grid-cols-1 items-start gap-10 px-4 md:px-6 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
        <SectionIndex
          index="04"
          title="What the gateway is doing right now."
          body="Every session and every payment arrives as an event. If someone is moving the arm, you see it here."
          surface="bench"
          anim={reveal()}
        />
        <motion.div {...reveal(0.1)}>
          <Panel
            label="Gateway · events"
            aside={<span className={cn('font-mono text-mono-xs uppercase', connected ? 'text-bench-ink-2' : 'text-warn')}>{connected ? 'connected' : 'reconnecting'}</span>}
            live={connected}
            rows={rows}
          >
            <div className="flex items-center justify-between">
              <StatusDot status={shell?.status} surface="bench" />
              <Link to="/agents" className="font-mono text-mono-xs uppercase text-bench-ink-2 hover:text-bench-ink hover:underline">Subscribe via /api/events</Link>
            </div>
          </Panel>
        </motion.div>
      </div>
    </section>
  );
}

function Closing({ shell }: { shell: Shell | undefined }) {
  const reveal = useReveal();
  return (
    <section id="closing" className="border-t border-rule">
      <div className="mx-auto w-full max-w-container px-4 py-section md:px-6">
        <motion.h2 {...reveal()} className="wide-112 max-w-[18ch] text-display">
          Five minutes is enough to know if your code moves something real.
        </motion.h2>
        <motion.p {...reveal(0.08)} className="mt-6 max-w-prose text-lead text-ink-2">
          A block costs ${shell?.pricing.usd ?? '1.00'}. When time runs out, {shell?.name ?? 'El Tucu'} returns to HOME on its own.
        </motion.p>
        <motion.div {...reveal(0.16)} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button as="link" to={shell ? shellHref(shell) : '/shells/el-tucu'} label="Rent a block" />
          <Button as="a" href="/llms.txt" variant="secondary" label="Read llms.txt" />
        </motion.div>
      </div>
      <Footer />
    </section>
  );
}
