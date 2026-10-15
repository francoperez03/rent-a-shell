'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import type { Shell } from '@ras/shell-spec';
import { LiveVideo } from '@/components/LiveVideo';
import { Button } from '@/components/Button';
import { Readout } from '@/components/Readout';
import { SectionIndex } from '@/components/SectionIndex';
import { StatusDot } from '@/components/StatusDot';
import { Footer } from '@/components/Footer';
import { INSTALL } from '@/content/install';
import { shellHref, useShells } from '@/lib/api';
import { useReveal } from '@/lib/useReveal';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { CountUp } from '@/components/CountUp';
import { dur, easeOut } from '@/lib/motion';
import { cn } from '@/lib/cn';

const STEPS = [
  { n: '01', title: 'Rent', body: 'Pick a shell and how much time you need, from five minutes up. You see the camera, the ranges and the queue before paying.' },
  { n: '02', title: 'Pay', body: 'Powered by Solana: a Solana Pay QR for people, x402 for agents. USDC, settled in seconds, no account. With escrow, a dropped robot refunds you on its own.' },
  { n: '03', title: 'Run', body: 'Move each joint from the console, run a routine, or let your agent send the commands over HTTP or MCP.' },
  { n: '04', title: 'Watch', body: 'See the arm do it on camera. Then fix the code and run it again.' },
];

/** Landing: brand register. Paper, one signal band, measurements as the hero image. */
export default function Landing({ origin }: { origin: string }) {
  const { data: shells } = useShells();
  const tucu = shells?.[0];

  return (
    <main>
      <Hero shell={tucu} />
      <Numbers shell={tucu} />
      <HowItWorks />
      <Audiences shell={tucu} origin={origin} />
      <Closing shell={tucu} />
    </main>
  );
}

function Hero({ shell }: { shell: Shell | undefined }) {
  const reveal = useReveal();
  const reduced = useReducedMotion();
  const city = shell?.location.split(',')[0] ?? 'Tucumán';
  // The live window drifts a little slower than the page (Crisol video panels): 0 to 40px over the hero scroll.
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 40]);

  return (
    <section id="hero" ref={ref} className="dot-grid relative border-b border-rule">
      <div className="mx-auto grid w-full max-w-container grid-cols-1 items-end gap-10 px-4 pb-12 pt-28 md:px-6 md:pt-36 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pb-16">
        <div>
          <motion.p {...reveal(0, 'mount')} className="flex items-center gap-3 font-mono text-mono uppercase text-ink-3">
            <StatusDot status={shell?.status} />
            <span>{shell?.name ?? 'El Tucu'} · {city}</span>
          </motion.p>
          <motion.h1 {...reveal(0.05, 'mount')} className="wide-112 mt-5 max-w-[16ch] text-display">
            Test your code on real hardware. Today.
          </motion.h1>
          <motion.p {...reveal(0.1, 'mount')} className="mt-6 max-w-[44ch] text-lead text-ink-2">
            {shell?.name ?? 'El Tucu'} is a four-axis arm in {city}, Argentina. Rent it in five-minute blocks, run your code against it and watch it on camera.
          </motion.p>
          <motion.div {...reveal(0.15, 'mount')} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button as="link" href={shell ? shellHref(shell) : '/shells/el-tucu'} label={`Rent ${shell?.name ?? 'El Tucu'}`} />
            <Button as="link" href="/agents" variant="secondary" label="For agents" />
          </motion.div>
        </div>

        <motion.div {...reveal(0.1, 'mount')} style={{ y }}>
          <LiveVideo shell={shell} className="aspect-[4/3] w-full">
            <span className="absolute right-3 top-3 border border-bench-rule bg-bench/85 px-2 py-1 font-mono text-mono-xs uppercase text-bench-ink-2">
              {shell?.location ?? 'Tucumán, AR'}
            </span>
          </LiveVideo>
        </motion.div>
      </div>
    </section>
  );
}

/** The signal band: three hard numbers, the argument in one line. */
function Numbers({ shell }: { shell: Shell | undefined }) {
  const price = shell?.pricing.usd ?? '0.05';
  const minutes = shell?.pricing.block_minutes ?? 5;
  const parts = shell?.build.parts_usd ?? 45;
  const days = shell?.build.lead_days ?? 14;
  const online = !!shell && shell.status !== 'offline';
  return (
    <section aria-label="Key numbers" className="bg-signal text-ink">
      <dl className="mx-auto grid w-full max-w-container grid-cols-1 divide-y divide-ink/20 px-4 md:grid-cols-3 md:divide-x md:divide-y-0 md:px-6">
        <Band k="Five minutes" v={<CountUp prefix="$" value={price} />} u={`/ ${minutes} min`} note="Pay per use in USDC. Powered by Solana." />
        <Band k="Owning this arm" v={<CountUp prefix="$" value={parts} />} u="in parts" note={`Plus ${days} days of shipping and a day of assembly.`} />
        <Band k="Waiting" v={<CountUp value={0} />} u="days" note={online ? 'The robot is online now. First test in the next five minutes.' : 'The robot is offline right now. No waiting list: come back in a while.'} />
      </dl>
    </section>
  );
}

function Band({ k, v, u, note }: { k: string; v: React.ReactNode; u: string; note: string }) {
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

const STEP_MS = 2800;

/** The bench test runs on its own: the active step advances every few seconds, hovering a step pins it. */
function HowItWorks() {
  const reveal = useReveal();
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (reduced || pinned) return;
    const id = setInterval(() => setActive((a) => (a + 1) % STEPS.length), STEP_MS);
    return () => clearInterval(id);
  }, [reduced, pinned]);
  return (
    <section id="how-it-works" className="py-section">
      <div className="mx-auto w-full max-w-container px-4 md:px-6">
        <SectionIndex title="How it works" body="Four steps, like a bench test." anim={reveal()} />
        <ol className="mt-12 grid grid-cols-1 gap-px bg-rule md:grid-cols-2 lg:grid-cols-4" onMouseLeave={() => setPinned(false)}>
          {STEPS.map((s, i) => {
            const on = i === active;
            return (
              <motion.li
                key={s.n}
                {...reveal(0.08 * i)}
                onMouseEnter={() => {
                  setActive(i);
                  setPinned(true);
                }}
                className="relative bg-paper py-6 md:px-8 md:first:pl-0 md:last:pr-0"
              >
                {on && !reduced && (
                  <motion.span layoutId="step-rule" aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-signal" transition={{ duration: dur.medium, ease: easeOut }} />
                )}
                <p className={cn('tabular font-mono text-mono transition-colors duration-medium', on ? 'text-signal-deep' : 'text-ink-3')}>{s.n}</p>
                <h3 className={cn('wide-106 mt-3 text-h2 transition-colors duration-medium', on ? 'text-ink' : 'text-ink-3')}>{s.title}</h3>
                <p className={cn('mt-3 max-w-[36ch] text-body transition-colors duration-medium', on ? 'text-ink-2' : 'text-ink-3')}>{s.body}</p>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// Two paths. Hovering one commits to it: its rule draws, its steps step forward one by one, the other path dims.
const PATH = {
  rest: { opacity: 1, y: 0, transition: { staggerChildren: 0.04, staggerDirection: -1 } },
  hover: { opacity: 1, y: -4, transition: { duration: dur.base, ease: easeOut, staggerChildren: 0.07, delayChildren: 0.05 } },
  dim: { opacity: 0.5, y: 0, transition: { duration: dur.base, ease: easeOut } },
};
const PATH_RULE = { rest: { scaleX: 0 }, hover: { scaleX: 1, transition: { duration: dur.medium, ease: easeOut } }, dim: { scaleX: 0 } };
const PATH_STEP = { rest: { x: 0 }, hover: { x: 8, transition: { duration: dur.base, ease: easeOut } }, dim: { x: 0 } };

function Audiences({ shell, origin }: { shell: Shell | undefined; origin: string }) {
  const reveal = useReveal();
  const reduced = useReducedMotion();
  const [chosen, setChosen] = useState<number | null>(null);
  const sentence = `Go to ${origin}, pick the shell, pay for 5 minutes, open the gripper and then ask me what to do next.`;
  const price = shell ? `USD ${shell.pricing.usd} per ${shell.pricing.block_minutes}-minute block` : 'from USD 0.05 per block';
  const human = [
    `Open the shell page and pick how long: ${price}.`,
    'Pay with Phantom or Solflare. The money sits in escrow until your session ends.',
    'Drive the arm from the console while the camera shows you every move.',
  ];
  const agent: Step[] = [
    {
      text: 'Install the skill once.',
      after: (
        <pre className="on-bench mt-3 whitespace-pre-wrap break-words border border-bench-rule bg-bench p-4 font-mono text-mono-xs leading-[1.7] text-bench-ink">
          <code>{INSTALL}</code>
        </pre>
      ),
    },
    {
      text: 'Tell your agent the sentence. It reads llms.txt, shows you the price and asks before paying.',
      after: <blockquote className="mt-3 border border-ink bg-paper-2 p-4 text-body text-ink">“{sentence}”</blockquote>,
    },
    { text: 'It pays with x402, runs your commands and asks you what to do next.' },
  ];
  const state = (i: number) => (reduced ? 'rest' : chosen === null ? 'rest' : chosen === i ? 'hover' : 'dim');
  const path = (i: number) => ({
    initial: 'rest',
    animate: state(i),
    variants: PATH,
    onHoverStart: () => setChosen(i),
    onHoverEnd: () => setChosen(null),
    onFocusCapture: () => setChosen(i),
    onBlurCapture: () => setChosen(null),
  });

  return (
    <section id="who-its-for" className="dot-grid border-t border-rule bg-paper-2 py-section">
      <div className="mx-auto w-full max-w-container px-4 md:px-6">
        <SectionIndex title="Two ways to use it" body="By hand, with a wallet. Or through your agent, with one sentence." anim={reveal()} />
        <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-8 lg:grid-cols-12 lg:items-start">
          <motion.div {...reveal()} className="lg:col-span-6">
            <motion.article {...path(0)} className="group relative flex flex-col border border-rule bg-paper p-6 transition-colors duration-base hover:border-ink md:p-8">
              <motion.span aria-hidden variants={PATH_RULE} className="absolute inset-x-0 top-0 h-0.5 origin-left bg-ink" />
              <p className="flex items-center gap-2 font-mono text-mono-xs uppercase text-ink-3">
                You <span className="arrow text-ink">→</span>
              </p>
              <h3 className="wide-106 mt-3 text-h2">Rent it from this page and drive it yourself.</h3>
              <Steps items={human} />
              <div className="mt-8">
                <Button as="link" href={shell ? shellHref(shell) : '/shells/el-tucu'} label="Rent five minutes" />
              </div>
            </motion.article>
          </motion.div>

          <motion.div {...reveal(0.08)} className="min-w-0 lg:col-span-6">
            <motion.article {...path(1)} className="group relative flex min-w-0 flex-col border border-rule bg-paper p-6 transition-colors duration-base hover:border-signal md:p-8">
              <motion.span aria-hidden variants={PATH_RULE} className="absolute inset-x-0 top-0 h-0.5 origin-left bg-signal" />
              <p className="flex items-center gap-2 font-mono text-mono-xs uppercase text-signal-deep">
                Your agent <span className="arrow">→</span>
              </p>
              <h3 className="wide-106 mt-3 text-h2">Tell your agent one sentence. It pays and drives it for you.</h3>
              <Steps items={agent} />
              <div className="mt-8">
                <Button as="link" href="/agents" variant="secondary" label="Agent guide" />
              </div>
            </motion.article>
          </motion.div>

          {/* Forgers as a full-width band, same grammar as SectionIndex: eyebrow, text, numbers to the right */}
          <motion.article {...reveal(0.16)} className="grid grid-cols-1 gap-x-8 gap-y-6 border-t border-rule pt-6 lg:col-span-12 lg:grid-cols-[6rem_1fr_auto]">
            <p className="font-mono text-mono-xs uppercase text-ink-3">Forgers</p>
            <div>
              <h3 className="text-h3">Have a robot sitting idle? Publish it.</h3>
              <p className="mt-3 max-w-prose text-body text-ink-2">
                Run the gateway next to your hardware, set the price per block, get paid in your own wallet: upfront with x402, from the escrow when the session ends with Solana Pay. Customization requests come to you.
              </p>
            </div>
            <div className="lg:justify-self-end lg:text-right">
              <dl className="grid grid-cols-2 gap-8">
                <Readout label="Your cut" value={<CountUp value={90} />} unit="%" />
                <Readout label="Setup" value="1" unit="command" />
              </dl>
              <a href="https://github.com/francoperez03/rent-a-shell/blob/main/docs/forgers.md" rel="noopener" className="mt-4 inline-block font-mono text-mono uppercase text-signal-deep underline-offset-4 hover:underline">Become a Forger</a>
            </div>
          </motion.article>
        </div>
      </div>
    </section>
  );
}


function Closing({ shell }: { shell: Shell | undefined }) {
  const reveal = useReveal();
  return (
    <section id="closing" className="on-bench dot-grid-bench border-t border-bench-rule bg-bench text-bench-ink">
      <div className="mx-auto w-full max-w-container px-4 py-section md:px-6">
        <motion.h2 {...reveal()} className="wide-112 max-w-[18ch] text-display text-bench-ink">
          Five minutes is enough to know if your code moves something real.
        </motion.h2>
        <motion.p {...reveal(0.08)} className="mt-6 max-w-prose text-lead text-bench-ink-2">
          {shell ? `A ${shell.pricing.block_minutes}-minute block costs USD ${shell.pricing.usd}` : 'Blocks start from USD 0.05'}, paid in USDC on Solana; each Forger sets the price of their shell. When time runs out, {shell?.name ?? 'El Tucu'} returns to HOME on its own.
        </motion.p>
        <motion.div {...reveal(0.16)} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button as="link" href={shell ? shellHref(shell) : '/shells/el-tucu'} label="Rent five minutes" />
          <Button as="a" href="/llms.txt" variant="secondary" surface="bench" label="Read llms.txt" />
        </motion.div>
      </div>
      <Footer surface="bench" />
    </section>
  );
}

type Step = { text: string; after?: React.ReactNode };

/** Numbered steps; a step can carry a block right under its text (a command, a sentence to copy). */
function Steps({ items }: { items: (string | Step)[] }) {
  return (
    <ol className="mt-5 flex flex-col gap-3">
      {items.map((it, i) => {
        const s = typeof it === 'string' ? { text: it } : it;
        return (
          <motion.li key={i} variants={PATH_STEP} className="grid grid-cols-[1.75rem_1fr] gap-3 text-body text-ink-2">
            <span className="tabular font-mono text-mono text-ink transition-colors duration-base group-hover:text-signal-deep">{i + 1}.</span>
            <div className="min-w-0">
              <span className="max-w-[44ch]">{s.text}</span>
              {s.after}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
