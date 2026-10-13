import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { LiveVideo } from '@/components/LiveVideo';
import { Button } from '@/components/Button';
import { Readout } from '@/components/Readout';
import { StatusDot } from '@/components/StatusDot';
import { Footer } from '@/components/Footer';
import { HUB, api, fmtClock, setGateway, toMs, useNow, useQueue, useShell, useShellState } from '@/lib/api';
import { JOINTS, JOINT_LABEL, routineLabel } from '@/lib/joints';
import { cn } from '@/lib/cn';

const BLOCKS = [1, 2, 3, 4, 5, 6];

/** Shell page as a datasheet: live window, ranges, cost of owning vs renting, Forger, queue, and the order block. */
export default function ShellPage() {
  const { id } = useParams();
  const { data: shell, isLoading, isError } = useShell(id);
  // with a hub, renting this shell means talking to its Forger's gateway (checkout and console included)
  useEffect(() => {
    if (HUB && shell?.gateway) setGateway(shell.gateway);
  }, [shell?.gateway]);
  const { data: state } = useShellState(id);
  const { data: queue } = useQueue(id);
  const now = useNow();
  const [blocks, setBlocks] = useState(1);

  if (isLoading)
    return (
      <Layout>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]" aria-busy>
          <div className="skeleton aspect-video w-full" />
          <div className="skeleton h-64 w-full" />
        </div>
      </Layout>
    );
  if (isError || !shell)
    return (
      <Layout>
        <h1 className="wide-106 text-h1">{isError ? 'The gateway did not answer.' : 'That shell does not exist.'}</h1>
        <p className="mt-4 max-w-prose text-body text-ink-2">{isError ? 'Try again in a few seconds. If it keeps failing, the Forger may be offline.' : 'Go back home to see the published shells.'}</p>
        <Button as="link" to="/#shells" variant="secondary" label="See shells" className="mt-8" />
      </Layout>
    );

  const total = (Number(shell.pricing.usd) * blocks).toFixed(2);
  const minutes = shell.pricing.block_minutes * blocks;
  const offline = shell.status === 'offline';
  const breakEvenHours = (shell.build.parts_usd / Number(shell.pricing.usd)) * shell.pricing.block_minutes / 60;
  const queueText = !queue
    ? '—'
    : queue.active
      ? `In use · ${fmtClock(toMs(queue.active.expires_at) - now)} left · ${queue.waiting} waiting`
      : queue.waiting
        ? `${queue.waiting} waiting`
        : 'Free now';

  return (
    <Layout>
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-rule pb-6">
        <div>
          <p className="font-mono text-mono uppercase text-ink-3">
            {shell.kind} · {shell.location} · Forger {shell.forger.name}
          </p>
          <h1 className="wide-112 mt-3 text-display">{shell.name}</h1>
        </div>
        <StatusDot status={shell.status} className="text-mono" />
      </header>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
        <div>
          <LiveVideo shell={shell} className="aspect-video w-full">
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

          {/* spec sheet */}
          <section aria-labelledby="ranges" className="mt-10">
            <h2 id="ranges" className="font-mono text-mono uppercase text-ink-3">Safe ranges</h2>
            <table className="mt-3 w-full border-collapse">
              <thead>
                <tr className="border-b border-rule font-mono text-mono-xs uppercase text-ink-3">
                  <th className="py-2 text-left font-normal">Joint</th>
                  <th className="py-2 text-right font-normal">Min</th>
                  <th className="py-2 text-right font-normal">Max</th>
                  <th className="py-2 text-right font-normal">HOME</th>
                  <th className="py-2 text-right font-normal">Now</th>
                </tr>
              </thead>
              <tbody className="tabular font-mono text-mono text-ink">
                {JOINTS.map((j) => (
                  <tr key={j} className="border-b border-rule even:bg-paper-2">
                    <td className="py-2 pr-4 text-ink-2">{JOINT_LABEL[j]}</td>
                    <td className="py-2 text-right">{shell.joints[j][0]}°</td>
                    <td className="py-2 text-right">{shell.joints[j][1]}°</td>
                    <td className="py-2 text-right text-ink-2">{shell.home[j]}°</td>
                    <td className="py-2 text-right">{state ? `${Math.round(state.angles[j])}°` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-small text-ink-3">Out-of-range commands are clamped to these limits. Routines: {shell.routines.map(routineLabel).join(', ')}. Sensors: {shell.sensors.join(', ')}.</p>
          </section>

          <section aria-labelledby="own" className="mt-10 border-t border-rule pt-6">
            <h2 id="own" className="font-mono text-mono uppercase text-ink-3">Own one vs rent it</h2>
            <div className="mt-4 grid grid-cols-2 gap-6 md:grid-cols-4">
              <Readout label="Parts" value={`$${shell.build.parts_usd}`} unit="USD" />
              <Readout label="Wait" value={shell.build.lead_days} unit="days" />
              <Readout label="Assembly" value={shell.build.build_hours} unit="h" />
              <Readout label="Here" value={`$${shell.pricing.usd}`} unit={`/ ${shell.pricing.block_minutes} min`} />
            </div>
            <p className="mt-4 max-w-prose text-body text-ink-2">
              The parts alone equal {breakEvenHours.toLocaleString('en-US', { maximumFractionDigits: 1 })} hours of use here, and you test today instead of in {shell.build.lead_days} days.
            </p>
          </section>

          <section aria-labelledby="forger" className="mt-10 border-t border-rule pt-6">
            <h2 id="forger" className="font-mono text-mono uppercase text-ink-3">Forger</h2>
            <p className="mt-3 max-w-prose text-body text-ink-2">
              {shell.forger.name} built this shell and keeps it online.
              {shell.forger.customizations && ' Takes customization requests: an extra sensor, another end effector, another mount.'}
              {shell.forger.customizations && shell.forger.contact && (
                <> <a href={shell.forger.contact} className="text-signal-deep underline-offset-4 hover:underline">Contact</a>.</>
              )}
            </p>
            {shell.forger.customizations && <CustomRequest shellId={shell.id} forger={shell.forger.name} />}
          </section>
        </div>

        {/* order block */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <fieldset className="border border-ink bg-paper-2 p-5 md:p-6">
            <legend className="px-2 font-mono text-mono uppercase text-ink">Rent</legend>
            <p className="font-mono text-mono-xs uppercase text-ink-3">How long</p>
            <div className="mt-2 grid grid-cols-6 gap-1" role="radiogroup" aria-label="Session length">
              {BLOCKS.map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={blocks === b}
                  onClick={() => setBlocks(b)}
                  className={cn(
                    'tabular h-11 rounded-sm border font-mono text-mono transition-colors duration-base ease-out',
                    blocks === b ? 'border-signal bg-signal text-ink' : 'border-rule-2 bg-paper text-ink hover:border-ink'
                  )}
                >
                  {b * shell.pricing.block_minutes}′
                </button>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-6 border-t border-rule pt-4">
              <Readout label="Time" value={minutes} unit="min" />
              <Readout label="Total" value={`$${total}`} unit="USD" />
            </div>
            <Button
              as="link"
              to={`/checkout?shell=${shell.id}&blocks=${blocks}`}
              state={{ shell: shell.id, blocks }}
              label="Go to payment"
              className={cn('mt-5 w-full', offline && 'pointer-events-none opacity-40')}
              aria-disabled={offline}
            />
            <p className="mt-3 font-mono text-mono-xs uppercase text-ink-3">Queue · {queueText}</p>
            <p className="mt-3 border-t border-rule pt-3 font-mono text-mono-xs uppercase text-ink-3">Powered by Solana · USDC</p>
            {offline && <p className="mt-3 text-small text-danger">{shell.name} is offline. Come back in a while.</p>}
          </fieldset>
        </aside>
      </div>
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto min-h-viewport w-full max-w-container px-4 pb-24 pt-24 md:px-6 md:pt-28">{children}</main>
      <Footer />
    </>
  );
}

const field = 'h-11 w-full rounded-sm border border-rule-2 bg-paper px-3 font-sans text-body text-ink placeholder:text-ink-3 focus:border-ink';

/** Customization request to the Forger (an extra sensor, another end effector, another mount). */
function CustomRequest({ shellId, forger }: { shellId: string; forger: string }) {
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const send = useMutation({
    mutationFn: () => api<{ ok: true }>(`/api/shells/${shellId}/requests`, { method: 'POST', body: JSON.stringify({ contact, message }) }),
  });

  if (send.isSuccess) return <p className="mt-4 text-body text-ok-deep">Sent. {forger} will reach out at {contact}.</p>;
  if (!open)
    return (
      <Button variant="secondary" size="sm" label="Request a customization" className="mt-4" onClick={() => setOpen(true)} />
    );
  return (
    <form
      className="mt-4 flex max-w-prose flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      <label className="flex flex-col gap-1 font-mono text-mono-xs uppercase text-ink-3">
        Contact
        <input required maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Telegram, email or X" className={field} />
      </label>
      <label className="flex flex-col gap-1 font-mono text-mono-xs uppercase text-ink-3">
        What you need
        <textarea required minLength={10} maxLength={2000} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="E.g. a distance sensor on the grip" className={cn(field, 'h-auto py-2')} />
      </label>
      <div className="flex items-center gap-4">
        <Button type="submit" label="Send to the Forger" loading={send.isPending} />
        <button type="button" onClick={() => setOpen(false)} className="font-mono text-mono-xs uppercase text-ink-3 hover:text-ink hover:underline">Cancel</button>
      </div>
      {send.isError && <p role="alert" className="text-small text-danger">Could not send: {(send.error as Error).message}. Check the fields and try again.</p>}
    </form>
  );
}
