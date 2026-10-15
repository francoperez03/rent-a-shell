'use client';
import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import type { Shell } from '@ras/shell-spec';
import { LiveVideo } from '@/components/LiveVideo';
import { Button } from '@/components/Button';
import { Readout } from '@/components/Readout';
import { SectionIndex } from '@/components/SectionIndex';
import { StatusDot } from '@/components/StatusDot';
import { Footer } from '@/components/Footer';
import { INSTALL } from '@/content/install';
import { shellHref, useShells, useShellState } from '@/lib/api';
import { useReveal } from '@/lib/useReveal';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { CountUp } from '@/components/CountUp';
import { JOINTS, JOINT_LABEL } from '@/lib/joints';

const STEPS = [
  { n: '01', title: 'Rent', body: 'Pick a shell and how much time you need, from five minutes up. You see the camera, the ranges and the queue before paying.' },
  { n: '02', title: 'Pay', body: 'Powered by Solana: a Solana Pay QR for people, x402 for agents. USDC, settled in seconds, no account. With escrow, a dropped robot refunds you on its own.' },
  { n: '03', title: 'Run', body: 'Move each joint from the console, run a routine, or let your agent send the commands over HTTP or MCP.' },
  { n: '04', title: 'Measure', body: 'Read the real angles and the frames. Then fix the code and run it again.' },
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
  const { data: state } = useShellState(shell?.id, 2_000);
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
            {shell?.name ?? 'El Tucu'} is a four-axis arm in {city}, Argentina. Rent it in five-minute blocks, run your code against it, read the real angles, and watch it on camera.
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
          <dl className="grid grid-cols-2 gap-px border border-t-0 border-bench-rule bg-bench-rule sm:grid-cols-4">
            {JOINTS.map((j) => (
              <div key={j} className="bg-bench px-2 py-2 sm:px-3">
                <Readout label={JOINT_LABEL[j]} value={state ? Math.round(state.angles[j]) : '—'} unit="°" surface="bench" />
              </div>
            ))}
          </dl>
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
  return (
    <section aria-label="Key numbers" className="bg-signal text-ink">
      <dl className="mx-auto grid w-full max-w-container grid-cols-1 divide-y divide-ink/20 px-4 md:grid-cols-3 md:divide-x md:divide-y-0 md:px-6">
        <Band k="Five minutes" v={<CountUp prefix="$" value={price} />} u={`/ ${minutes} min`} note="Pay per use in USDC. Powered by Solana." />
        <Band k="Owning this arm" v={<CountUp prefix="$" value={parts} />} u="in parts" note={`Plus ${days} days of shipping and a day of assembly.`} />
        <Band k="Waiting" v={<CountUp value={0} />} u="days" note="The robot is online now. First test in the next five minutes." />
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

function HowItWorks() {
  const reveal = useReveal();
  return (
    <section id="how-it-works" className="py-section">
      <div className="mx-auto w-full max-w-container px-4 md:px-6">
        <SectionIndex index="01" title="How it works" body="Four steps, like a bench test." anim={reveal()} />
        <ol className="mt-12 grid grid-cols-1 gap-px bg-rule md:grid-cols-2 lg:grid-cols-4">
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

function Audiences({ shell, origin }: { shell: Shell | undefined; origin: string }) {
  const reveal = useReveal();
  const sentence = `Go to ${origin}, pick the shell, pay for 5 minutes, open the gripper and then ask me what to do next.`;
  const price = shell ? `USD ${shell.pricing.usd} per ${shell.pricing.block_minutes}-minute block` : 'from USD 0.05 per block';
  const human = [
    `Open the shell page and pick how long: ${price}.`,
    'Pay with Phantom or Solflare. The money sits in escrow until your session ends.',
    'Drive the arm from the console while the camera shows you every move.',
  ];
  const agent = [
    'Install the skill once (one command, below).',
    'Tell your agent the sentence. It reads llms.txt, shows you the price and asks before paying.',
    'It pays with x402, runs your commands and asks you what to do next.',
  ];

  return (
    <section id="who-its-for" className="border-t border-rule bg-paper-2 py-section">
      <div className="mx-auto w-full max-w-container px-4 md:px-6">
        <SectionIndex index="02" title="Two ways to use it" body="By hand, with a wallet. Or through your agent, with one sentence." anim={reveal()} />
        <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-12 lg:grid-cols-12">
          <motion.article {...reveal()} className="flex flex-col border-t-2 border-ink pt-5 lg:col-span-6">
            <p className="font-mono text-mono-xs uppercase text-ink-3">1 · You</p>
            <h3 className="wide-106 mt-3 text-h2">Rent it from this page and drive it yourself.</h3>
            <Steps items={human} />
            <div className="mt-6 lg:mt-auto lg:pt-6">
              <Button as="link" href={shell ? shellHref(shell) : '/shells/el-tucu'} label="Rent five minutes" />
            </div>
          </motion.article>

          <motion.article {...reveal(0.08)} className="flex min-w-0 flex-col border-t-2 border-signal pt-5 lg:col-span-6">
            <p className="font-mono text-mono-xs uppercase text-signal-deep">2 · Your agent</p>
            <h3 className="wide-106 mt-3 text-h2">Tell your agent one sentence. It pays and drives it for you.</h3>
            <Steps items={agent} />
            <figure className="mt-6">
              <figcaption className="font-mono text-mono-xs uppercase text-ink-3">Say this to Claude Code</figcaption>
              <blockquote className="mt-2 border border-ink bg-paper p-4 text-body text-ink">“{sentence}”</blockquote>
            </figure>
            <pre className="on-bench mt-4 whitespace-pre-wrap break-words border border-bench-rule bg-bench p-4 font-mono text-mono-xs leading-[1.7] text-bench-ink">
              <code>
                <span className="text-bench-ink-2"># install the skill once{'\n'}</span>
                {INSTALL}
              </code>
            </pre>
            <div className="mt-6 lg:mt-auto lg:pt-6">
              <Button as="link" href="/agents" variant="secondary" label="Agent guide" />
            </div>
          </motion.article>

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
    <section id="closing" className="border-t border-rule">
      <div className="mx-auto w-full max-w-container px-4 py-section md:px-6">
        <motion.h2 {...reveal()} className="wide-112 max-w-[18ch] text-display">
          Five minutes is enough to know if your code moves something real.
        </motion.h2>
        <motion.p {...reveal(0.08)} className="mt-6 max-w-prose text-lead text-ink-2">
          {shell ? `A ${shell.pricing.block_minutes}-minute block costs USD ${shell.pricing.usd}` : 'Blocks start from USD 0.05'}, paid in USDC on Solana; each Forger sets the price of their shell. When time runs out, {shell?.name ?? 'El Tucu'} returns to HOME on its own.
        </motion.p>
        <motion.div {...reveal(0.16)} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button as="link" href={shell ? shellHref(shell) : '/shells/el-tucu'} label="Rent five minutes" />
          <Button as="a" href="/llms.txt" variant="secondary" label="Read llms.txt" />
        </motion.div>
      </div>
      <Footer />
    </section>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="mt-5 flex flex-col gap-3">
      {items.map((t, i) => (
        <li key={i} className="grid grid-cols-[1.75rem_1fr] gap-3 text-body text-ink-2">
          <span className="tabular font-mono text-mono text-ink">{i + 1}.</span>
          <span className="max-w-[44ch]">{t}</span>
        </li>
      ))}
    </ol>
  );
}
