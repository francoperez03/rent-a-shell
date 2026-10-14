'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import type { RailManifest } from '@ras/shell-spec';
import { Readout } from '@/components/Readout';
import { Footer } from '@/components/Footer';
import { PayStep, suggest } from '@/components/PayStep';
import { createIntent, useRails, useShell } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Checkout: product register. Two steps, one column of decisions, the ticket on the right. */
export default function CheckoutPage({ shellId, blocks }: { shellId: string; blocks: number }) {

  const { data: shell } = useShell(shellId);
  const { data: rails, isError: railsError } = useRails();
  // Checkout is for people: agent-only rails (x402) are documented at /agents.
  const human = useMemo(() => rails?.filter((r) => r.audience.includes('human')) ?? [], [rails]);
  const suggested = useMemo(() => suggest(human), [human]);

  const intent = useMutation({ mutationFn: createIntent });
  const [rail, setRail] = useState<RailManifest | null>(null);

  const choose = (r: RailManifest) => {
    setRail(r);
    intent.mutate({ shell: shellId, blocks, rail: r.id, asset: r.assets[0]?.symbol });
  };

  const total = shell ? (Number(shell.pricing.usd) * blocks).toFixed(2) : null;
  const minutes = shell ? shell.pricing.block_minutes * blocks : null;

  return (
    <>
      <main className="mx-auto min-h-viewport w-full max-w-container px-4 pb-24 pt-24 md:px-6 md:pt-28">
        <header className="grid grid-cols-1 gap-6 border-b border-rule pb-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="font-mono text-mono uppercase text-ink-3">Checkout</p>
            <h1 className="wide-106 mt-3 text-h1">
              {shell?.name ?? shellId} · {minutes ?? blocks * 5} minutes
            </h1>
            <Link href={`/shells/${shellId}`} className="mt-3 inline-block font-mono text-mono uppercase text-signal-deep underline-offset-4 hover:underline">
              Change the time
            </Link>
          </div>
          <dl className="flex gap-8">
            <Readout label="Time" value={minutes ?? '—'} unit="min" />
            <Readout label="Total" value={total ? `$${total}` : '—'} unit="USD" />
          </dl>
        </header>

        {!intent.data ? (
          <section aria-labelledby="methods" className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_20rem]">
            <div>
              <h2 id="methods" className="text-h2">How do you want to pay?</h2>
              {railsError && <p className="mt-4 text-body text-danger">Could not load the payment methods. Try again in a few seconds.</p>}
              {!rails && !railsError && (
                <div className="mt-6 flex flex-col gap-2" aria-busy>
                  <div className="skeleton h-20" />
                  <div className="skeleton h-20" />
                </div>
              )}
              {rails && (
                <div role="radiogroup" aria-label="Payment method" className="mt-6 border-t border-rule">
                  {human.map((r) => (
                    <RailRow key={r.id} rail={r} suggested={r.id === suggested} busy={intent.isPending && rail?.id === r.id} onChoose={() => choose(r)} />
                  ))}
                  {human.length === 0 && <p className="py-6 text-body text-ink-2">No payment method for people is active on this gateway.</p>}
                </div>
              )}
              {intent.isError && (
                <p role="alert" className="mt-6 text-body text-danger">
                  Could not create the payment: {(intent.error as Error).message}. Pick a method again.
                </p>
              )}
            </div>
            <aside className="border-t border-rule pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <p className="font-mono text-mono-xs uppercase text-ink-3">Agents</p>
              <p className="mt-2 text-small text-ink-2">
                Running this from a script? Pay with x402 and skip the checkout.
              </p>
              <Link href="/agents" className="mt-3 inline-block font-mono text-mono uppercase text-signal-deep underline-offset-4 hover:underline">
                Agent guide
              </Link>
              <p className="mt-6 border-t border-rule pt-4 text-small text-ink-2">
                By paying you accept the <Link href="/terms" className="text-signal-deep underline-offset-4 hover:underline">terms</Link>.
              </p>
            </aside>
          </section>
        ) : (
          <PayStep view={intent.data} rail={rail} onRestart={() => intent.reset()} />
        )}
      </main>
      <Footer />
    </>
  );
}

function RailRow({ rail, suggested, busy, onChoose }: { rail: RailManifest; suggested: boolean; busy: boolean; onChoose: () => void }) {
  const chains = rail.wallet?.chains.map((c) => c.name).join(', ');
  return (
    <button
      type="button"
      role="radio"
      aria-checked={false}
      disabled={!rail.available || busy}
      onClick={onChoose}
      className={cn(
        'group grid w-full grid-cols-[1.25rem_1fr] items-start gap-4 border-b border-rule py-5 text-left transition-colors duration-base ease-out',
        rail.available ? 'hover:bg-paper-2' : 'cursor-not-allowed opacity-50'
      )}
    >
      <span aria-hidden className={cn('mt-1 h-4 w-4 rounded-full border transition-colors duration-base', rail.available ? 'border-ink group-hover:bg-signal' : 'border-rule-2')} />
      <span>
        <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-h3 text-ink">{rail.label}</span>
          <span className="font-mono text-mono-xs uppercase text-ink-3">
            {busy ? 'Preparing…' : !rail.available ? 'Unavailable' : suggested ? 'Suggested' : ''}
          </span>
        </span>
        <span className="mt-1 block max-w-prose text-small text-ink-2">{rail.description}</span>
        <span className="mt-2 block font-mono text-mono-xs uppercase text-ink-3">
          {rail.assets.map((a) => a.symbol).join(' · ')}
          {chains && ` · ${chains}`}
        </span>
      </span>
    </button>
  );
}
