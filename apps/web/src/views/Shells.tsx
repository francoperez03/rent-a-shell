'use client';
import { useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import type { Shell } from '@ras/shell-spec';
import { Button } from '@/components/Button';
import { Footer } from '@/components/Footer';
import { Readout } from '@/components/Readout';
import { SectionIndex } from '@/components/SectionIndex';
import { StatusDot } from '@/components/StatusDot';
import { SHELL_IMAGES } from '@/content/shell-images';
import { shellHref } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dur, easeOut } from '@/lib/motion';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useReveal } from '@/lib/useReveal';

const FORGERS_DOC = 'https://github.com/francoperez03/rent-a-shell/blob/main/docs/forgers.md';

/** The shells as a wheel: the current one large at the centre, its neighbours (or "coming soon") small at the sides. */
export default function ShellsView({ shells }: { shells: Shell[] }) {
  const reveal = useReveal();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const n = shells.length;
  const at = (i: number) => (n ? shells[((i % n) + n) % n] : undefined);
  const current = at(index);
  // neighbours only when they are a different shell; otherwise the slot says "coming soon"
  const prev = n > 1 ? at(index - 1) : undefined;
  const next = n > 2 ? at(index + 1) : undefined;
  const online = shells.filter((s) => s.status !== 'offline').length;
  const slide = reduced ? { duration: 0 } : { duration: dur.medium, ease: easeOut };

  return (
    <>
      <main className="mx-auto w-full max-w-container px-4 pb-24 pt-24 md:px-6 md:pt-28">
        <SectionIndex
          size="h1"
          title="Shells"
          body="Real hardware, published by the Forger who built it. One today, more on the way."
          anim={reveal(0, 'mount')}
          aside={<Readout label="Online now" value={online} unit={`/ ${n}`} />}
        />

        <div className="relative mt-12 grid grid-cols-1 items-center gap-6 lg:grid-cols-[1fr_1.6fr_1fr] lg:gap-8">
          <Side shell={prev} className="order-2 lg:order-1" />
          <div className="order-1 min-w-0 lg:order-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={current?.id ?? 'none'} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={slide}>
                {current ? <ShellCard shell={current} /> : <Empty />}
              </motion.div>
            </AnimatePresence>
          </div>
          <Side shell={next} className="order-3" />

          {n > 1 && (
            <div className="order-4 flex justify-center gap-3 lg:absolute lg:-top-14 lg:right-0">
              <button type="button" aria-label="Previous shell" onClick={() => setIndex((i) => i - 1)} className="h-11 w-11 rounded-sm border border-rule-2 font-mono text-mono text-ink transition-colors duration-base hover:border-ink">
                ‹
              </button>
              <button type="button" aria-label="Next shell" onClick={() => setIndex((i) => i + 1)} className="h-11 w-11 rounded-sm border border-rule-2 font-mono text-mono text-ink transition-colors duration-base hover:border-ink">
                ›
              </button>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

/** The centre card: photo, nameplate, price and the way in. */
function ShellCard({ shell }: { shell: Shell }) {
  const photo = SHELL_IMAGES[shell.id];
  return (
    <article className="border border-rule bg-paper transition-colors duration-base hover:border-ink">
      <div className="flex items-center justify-between border-b border-rule px-5 py-3">
        <p className="font-mono text-mono-xs uppercase text-ink-3">{shell.kind} · {shell.location}</p>
        <StatusDot status={shell.status} />
      </div>
      <div className="relative aspect-square w-full overflow-hidden bg-bench">
        {photo ? (
          <Image src={photo} alt={`${shell.name}, ${shell.kind} built by ${shell.forger.name}`} fill priority sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
        ) : (
          <div className="dot-grid-bench grid h-full place-items-center font-mono text-mono uppercase text-bench-ink-2">{shell.name}</div>
        )}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-5 py-5">
        <div>
          <h2 className="wide-106 text-h2">{shell.name}</h2>
          <p className="mt-1 font-mono text-mono-xs uppercase text-ink-3">Forger {shell.forger.name}</p>
          <p className="tabular mt-3 font-mono text-mono text-ink">
            ${shell.pricing.usd} <span className="text-ink-3">/ {shell.pricing.block_minutes} min</span>
          </p>
        </div>
        <Button as="link" href={shellHref(shell)} label={`Open ${shell.name}`} />
      </div>
    </article>
  );
}

/** A side slot: a neighbour shell, small, or the "coming soon" well. */
function Side({ shell, className }: { shell?: Shell; className?: string }) {
  return (
    <div className={cn('lg:scale-[.85] lg:opacity-70', className)}>
      {shell ? (
        <article className="border border-rule bg-paper">
          <div className="relative aspect-square w-full overflow-hidden bg-bench">
            {SHELL_IMAGES[shell.id] ? (
              <Image src={SHELL_IMAGES[shell.id]} alt="" fill sizes="(min-width: 1024px) 320px, 50vw" className="object-cover" />
            ) : (
              <div className="dot-grid-bench grid h-full place-items-center font-mono text-mono uppercase text-bench-ink-2">{shell.name}</div>
            )}
          </div>
          <div className="px-4 py-3">
            <p className="text-h3">{shell.name}</p>
            <p className="mt-1 font-mono text-mono-xs uppercase text-ink-3">{shell.location}</p>
          </div>
        </article>
      ) : (
        <article className="on-bench border border-bench-rule bg-bench">
          <div className="dot-grid-bench grid aspect-square w-full place-items-center">
            <p className="font-mono text-mono uppercase text-bench-ink-2">Coming soon</p>
          </div>
          <div className="border-t border-bench-rule px-4 py-3">
            <p className="text-small text-bench-ink-2">
              Have a robot sitting idle?{' '}
              <a href={FORGERS_DOC} rel="noopener" className="text-signal underline-offset-4 hover:underline">Publish it</a>.
            </p>
          </div>
        </article>
      )}
    </div>
  );
}

function Empty() {
  return (
    <article className="on-bench border border-bench-rule bg-bench">
      <div className="dot-grid-bench grid aspect-square w-full place-items-center px-6 text-center">
        <p className="font-mono text-mono uppercase text-bench-ink-2">No shells published right now</p>
      </div>
    </article>
  );
}
