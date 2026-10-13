import { useEffect, useMemo, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { IntentView, RailManifest, Shell } from '@ras/shell-spec';
import { Button } from '@/components/Button';
import { CopyButton, usePayment, useQr } from '@/components/PayStep';
import { createIntent, fmtClock, useRails } from '@/lib/api';
import { suggest } from '@/pages/Checkout';
import { cn } from '@/lib/cn';

/** Pick the rail for the modal: Solana Pay when the gateway offers it, otherwise the suggested human rail (e.g. the dev "fake" rail). */
const pickRail = (rails: RailManifest[]): RailManifest | undefined => {
  const human = rails.filter((r) => r.audience.includes('human') && r.available);
  return human.find((r) => r.id === 'solana-pay') ?? human.find((r) => r.id === suggest(human));
};

/**
 * Pay without leaving the shell page: one narrow column, amount, QR, one button, status.
 * The intent is created on open; "Other payment methods" goes to the full checkout.
 */
export function PayModal({ shell, blocks, open, onClose }: { shell: Shell; blocks: number; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const { data: rails, isError } = useRails();
  const rail = useMemo(() => (rails ? pickRail(rails) : undefined), [rails]);
  const intent = useMutation({ mutationFn: createIntent });
  const start = () => rail && intent.mutate({ shell: shell.id, blocks, rail: rail.id, asset: rail.assets[0]?.symbol });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // one intent per opening
  useEffect(() => {
    if (open && rail && intent.isIdle) start();
    if (!open && !intent.isIdle) intent.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rail]);

  const minutes = shell.pricing.block_minutes * blocks;
  const toCheckout = () => navigate(`/checkout?shell=${shell.id}&blocks=${blocks}`, { state: { shell: shell.id, blocks } });

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="pay-title"
      className="w-[min(100vw_-_2rem,26rem)] max-w-none border border-ink bg-paper p-0 text-ink shadow-none backdrop:bg-[#15110D]/75 backdrop:backdrop-blur-sm open:animate-modal-in"
    >
      <div className="flex items-center justify-between gap-4 border-b border-rule px-5 py-3">
        <h2 id="pay-title" className="font-mono text-mono uppercase">
          {shell.name} · {minutes} min
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 px-2 py-1 font-mono text-mono uppercase text-ink-3 hover:text-ink">
          Close
        </button>
      </div>
      <div className="px-5 pb-5 pt-6">
        {intent.data ? (
          <Ticket view={intent.data} rail={rail ?? null} onRetry={() => { intent.reset(); start(); }} onOther={toCheckout} />
        ) : isError || (rails && !rail) ? (
          <p role="alert" className="text-body text-danger">No payment method is available right now. Try again in a few seconds.</p>
        ) : intent.isError ? (
          <div>
            <p role="alert" className="text-body text-danger">Could not create the payment: {(intent.error as Error).message}.</p>
            <Button label="Try again" className="mt-4 w-full" onClick={() => { intent.reset(); start(); }} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4" aria-busy>
            <div className="skeleton h-8 w-32" />
            <div className="skeleton h-[224px] w-[224px]" />
            <div className="skeleton h-11 w-full" />
          </div>
        )}
      </div>
    </dialog>
  );
}

function Ticket({ view, rail, onRetry, onOther }: { view: IntentView; rail: RailManifest | null; onRetry: () => void; onOther: () => void }) {
  const { intent, left, expired, paid, seen, explorer } = usePayment(view);
  const ins = intent.instructions;
  const url = ins.kind === 'solana-pay' ? ins.url : null;
  const network = rail?.wallet?.chains[0]?.name;
  const statusText = expired ? 'No payment in time' : paid ? 'Paid. Opening the console…' : seen ? 'Payment seen, confirming…' : 'Waiting for payment';
  const dot = expired ? 'bg-rule-2' : paid ? 'bg-ok' : 'animate-status-pulse bg-signal';

  return (
    <div aria-live="polite" className="flex flex-col items-center text-center">
      <p className="tabular font-mono text-data text-ink">
        {intent.amount} <span className="text-mono text-ink-3">{intent.asset}</span>
      </p>

      {expired ? (
        <div className="mt-6 grid h-[224px] w-[224px] place-items-center border border-rule bg-paper-2">
          <p className="px-6 text-small text-ink-2">The time to pay ran out.</p>
        </div>
      ) : url ? (
        <Qr url={url} />
      ) : (
        <p className="mt-6 max-w-[28ch] text-body text-ink-2">{ins.kind === 'approval' ? ins.note : 'This method is for agents. See /agents.'}</p>
      )}

      {expired ? (
        <Button label="New payment" className="mt-6 w-full" onClick={onRetry} />
      ) : url ? (
        <>
          <Button as="a" href={url} label="Open in wallet" className="mt-6 w-full" />
          <p className="mt-3 text-small text-ink-2">Or scan with Phantom or Solflare{network ? ` on ${network}` : ''}.</p>
          <div className="mt-1"><CopyButton text={url} label="Copy payment link" /></div>
        </>
      ) : null}

      <div className="mt-6 flex w-full items-center justify-between gap-4 border-t border-rule pt-4 font-mono text-mono-xs uppercase">
        <p role="status" className={cn('flex items-center gap-2', paid ? 'text-ok-deep' : expired ? 'text-ink-3' : 'text-ink')}>
          <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', dot)} />
          {statusText}
        </p>
        {!expired && !paid && <p className={cn('tabular', left < 60_000 ? 'text-danger' : 'text-ink-3')}>{fmtClock(left)}</p>}
        {explorer && (
          <a href={explorer} target="_blank" rel="noopener" className="text-signal-deep underline-offset-4 hover:underline">View tx ↗</a>
        )}
      </div>
      <p className="mt-3 w-full text-left text-small text-ink-3">
        Held in escrow until your session ends. If the robot drops, it comes back to your wallet.{' '}
        <button type="button" onClick={onOther} className="text-signal-deep underline-offset-4 hover:underline">Other payment methods</button>
      </p>
    </div>
  );
}

function Qr({ url }: { url: string }) {
  const qr = useQr(url);
  return qr ? (
    <img src={qr} alt="Solana Pay QR" width={224} height={224} className="mt-6 h-[224px] w-[224px] border border-rule bg-white p-2" />
  ) : (
    <div className="skeleton mt-6 h-[224px] w-[224px]" aria-hidden />
  );
}
