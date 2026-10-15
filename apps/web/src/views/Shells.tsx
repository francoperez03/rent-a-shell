'use client';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Shell } from '@ras/shell-spec';
import Link from 'next/link';
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
      <main className="mx-auto w-full max-w-container px-4 pb-16 pt-24 md:px-6 md:pt-24">
        <SectionIndex
          title="Shells"
          body="Real hardware, published by the Forger who built it. One today, more on the way."
          anim={reveal(0, 'mount')}
          aside={<Readout label="Online now" value={online} unit={`/ ${n}`} />}
        />

        {/* the wheel: the centre card in front, the sides tucked behind it */}
        <div className="relative mx-auto mt-8 grid max-w-[64rem] grid-cols-1 items-center gap-6 lg:grid-cols-[1fr_1.45fr_1fr] lg:gap-0">
          <Side shell={prev} className="order-2 lg:order-1 lg:z-0 lg:[transform:translateX(16%)_scale(.88)]" />
          <div className="order-1 min-w-0 lg:order-2 lg:z-10">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={current?.id ?? 'none'} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={slide}>
                {current ? <ShellCard shell={current} /> : <Empty />}
              </motion.div>
            </AnimatePresence>
          </div>
          <Side shell={next} className="order-3 lg:z-0 lg:[transform:translateX(-16%)_scale(.88)]" />

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
  const photo = shell.image ?? SHELL_IMAGES[shell.id];
  return (
    <Link href={shellHref(shell)} className="group block border border-rule bg-paper shadow-[0_24px_60px_-30px_rgba(21,17,13,.45)] transition-[transform,border-color] duration-medium ease-out hover:scale-[1.03] hover:border-ink">
      <div className="flex items-center justify-between border-b border-rule px-5 py-3">
        <p className="font-mono text-mono-xs uppercase text-ink-3">{shell.kind} · {shell.location}</p>
        <StatusDot status={shell.status} />
      </div>
      <div className="relative aspect-square w-full overflow-hidden bg-bench">
        {photo ? (
          <img src={photo} alt={`${shell.name}, ${shell.kind} built by ${shell.forger.name}`} className="absolute inset-0 h-full w-full object-cover transition-transform duration-medium ease-out group-hover:scale-105" />
        ) : (
          <div className="dot-grid-bench grid h-full place-items-center font-mono text-mono uppercase text-bench-ink-2">{shell.name}</div>
        )}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-5 py-5">
        <div>
          <h2 className="wide-106 text-h2">{shell.name}</h2>
          <p className="mt-1 font-mono text-mono-xs uppercase text-ink-3">Forger {shell.forger.name}</p>
        </div>
        <p className="tabular font-mono text-mono text-ink">
          ${shell.pricing.usd} <span className="text-ink-3">/ {shell.pricing.block_minutes} min</span>
          <span className="roll-parent ml-4 uppercase text-signal-deep">
            Open <span className="arrow">→</span>
          </span>
        </p>
      </div>
    </Link>
  );
}

/** A side slot: a neighbour shell, small, or the "coming soon" well. */
function Side({ shell, className }: { shell?: Shell; className?: string }) {
  return (
    <div className={cn('lg:opacity-70', className)}>
      {shell ? (
        <Link href={shellHref(shell)} className="group block border border-rule bg-paper transition-[transform,border-color] duration-medium ease-out hover:scale-[1.03] hover:border-ink">
          <div className="relative aspect-square w-full overflow-hidden bg-bench">
            {shell.image ?? SHELL_IMAGES[shell.id] ? (
              <img src={shell.image ?? SHELL_IMAGES[shell.id]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="dot-grid-bench grid h-full place-items-center font-mono text-mono uppercase text-bench-ink-2">{shell.name}</div>
            )}
          </div>
          <div className="px-4 py-3">
            <p className="text-h3">{shell.name}</p>
            <p className="mt-1 font-mono text-mono-xs uppercase text-ink-3">{shell.location}</p>
          </div>
        </Link>
      ) : (
        <a href={FORGERS_DOC} rel="noopener" title="Publish your robot as a Forger" className="on-bench group block border border-bench-rule bg-bench transition-[transform,border-color] duration-medium ease-out hover:scale-[1.03] hover:border-bench-ink">
          <div className="dot-grid-bench grid aspect-square w-full place-items-center px-6 text-center">
            <div>
              <p className="font-mono text-mono uppercase text-bench-ink-2 transition-colors duration-base group-hover:text-bench-ink">Coming soon</p>
              <p className="roll-parent mt-3 font-mono text-mono-xs uppercase text-signal">
                Become a Forger <span className="arrow">→</span>
              </p>
            </div>
          </div>
        </a>
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
