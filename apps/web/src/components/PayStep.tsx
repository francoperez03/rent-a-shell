'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import type { Instructions, IntentView, RailManifest } from '@ras/shell-spec';
import { Button } from '@/components/Button';
import { Readout } from '@/components/Readout';
import { fmtClock, getIntent, saveGrant, useEvents, useNow } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Intent lifecycle shared by the checkout and the modal: polls until paid or expired, listens to SSE, saves the grant when paid (and opens the console with `autoOpen`). */
export function usePayment(first: IntentView, { autoOpen = true }: { autoOpen?: boolean } = {}) {
  const router = useRouter();
  const now = useNow();
  const id = first.intent.id;
  const [seen, setSeen] = useState<{ explorerUrl?: string; tx?: string } | null>(null);

  // Poll every 3 s until paid or expired.
  const { data } = useQuery({
    queryKey: ['intent', id],
    queryFn: () => getIntent(id),
    initialData: first,
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 3_000 : false),
  });
  const view = data ?? first;
  const { intent, status, session } = view;

  // SSE tells us before polling does when the rail sees the payment.
  useEvents((e) => {
    if (e.type === 'payment_seen' && e.intentId === id) setSeen({ explorerUrl: e.explorerUrl, tx: e.tx });
  });

  useEffect(() => {
    if (status === 'paid' && session) {
      saveGrant(session);
      if (autoOpen) router.push('/session');
    }
  }, [status, session, router, autoOpen]);

  const left = intent.expiresAt - now;
  const expired = status === 'expired' || (status === 'pending' && left <= 0);
  const explorer = session?.payment?.explorerUrl ?? seen?.explorerUrl;
  const paid = status === 'paid';
  const tx = session?.payment?.tx ?? seen?.tx;
  return { intent, status, left, expired, paid, seen: !!seen, explorer, tx, session };
}

/** QR data URL for a payment link (null until rendered or on failure). */
export function useQr(url: string) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 560, errorCorrectionLevel: 'M', color: { dark: '#15110D', light: '#FFFFFF' } }).then(setQr, () => setQr(null));
  }, [url]);
  return qr;
}

export function PayStep({ view: first, rail, onRestart }: { view: IntentView; rail: RailManifest | null; onRestart: () => void }) {
  const { intent, status, left, expired, paid, seen, explorer } = usePayment(first);

  return (
    <section aria-live="polite" className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_20rem]">
      {/* the ticket */}
      <div className={cn('min-w-0 border bg-paper-2', expired ? 'border-rule' : paid ? 'border-ok' : 'border-ink')}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule px-5 py-3">
          <p className="font-mono text-mono uppercase text-ink">{rail?.label ?? intent.rail}</p>
          <p className={cn('tabular font-mono text-mono uppercase', expired ? 'text-ink-3' : paid ? 'text-ok-deep' : left < 60_000 ? 'text-danger' : 'text-ink-2')}>
            {expired ? 'Expired' : paid ? 'Paid' : `Expires in ${fmtClock(left)}`}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 px-5 py-6 md:grid-cols-[auto_1fr] md:gap-10">
          <Readout label="Amount" value={intent.amount} unit={intent.asset} size="lg" />
          <div className="min-w-0 md:border-l md:border-rule md:pl-10">
            {expired ? (
              <div>
                <p className="text-body text-ink-2">The time to pay ran out. Start a new attempt: the amount is the same.</p>
                <Button label="Choose again" className="mt-5" onClick={onRestart} />
              </div>
            ) : (
              <Instruct ins={intent.instructions} rail={rail} />
            )}
          </div>
        </div>
      </div>

      <aside className="flex flex-col gap-4 border-t border-rule pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
        <Status status={status} seen={seen} expired={expired} />
        {explorer && (
          <a href={explorer} target="_blank" rel="noopener" className="font-mono text-mono uppercase text-signal-deep underline-offset-4 hover:underline">
            View transaction ↗
          </a>
        )}
        {!expired && status === 'pending' && (
          <button type="button" onClick={onRestart} className="self-start font-mono text-mono-xs uppercase text-ink-3 hover:text-ink hover:underline">
            Change payment method
          </button>
        )}
        <p className="mt-auto text-small text-ink-3">
          With escrow, the money stays locked until your session ends. If the robot drops, it comes back to your wallet.
        </p>
      </aside>
    </section>
  );
}

function Status({ status, seen, expired }: { status: IntentView['status']; seen: boolean; expired: boolean }) {
  const text = expired ? 'No payment in time.' : status === 'paid' ? 'Payment confirmed. Opening the console…' : seen ? 'Payment seen. Confirming…' : 'Waiting for payment…';
  const color = expired ? 'bg-rule-2' : status === 'paid' ? 'bg-ok' : 'animate-status-pulse bg-signal';
  return (
    <p role="status" className="flex items-center gap-3 font-mono text-mono uppercase text-ink">
      <span aria-hidden className={cn('h-2 w-2 rounded-full', color)} />
      {text}
    </p>
  );
}

function Instruct({ ins, rail }: { ins: Instructions; rail: RailManifest | null }) {
  switch (ins.kind) {
    case 'solana-pay':
      return <SolanaPay ins={ins} network={rail?.wallet?.chains[0]?.name} />;
    case 'approval':
      return (
        <div>
          <p className="text-body text-ink-2">{ins.note}</p>
          <p className="mt-3 font-mono text-mono text-ink-3">Reference {ins.ref}</p>
        </div>
      );
    case 'x402':
      return <p className="text-body text-ink-2">This method is for agents. See the guide at /agents.</p>;
  }
}

// ---------- Solana Pay: QR to scan with the phone wallet ----------

type SolanaPayIns = Extract<Instructions, { kind: 'solana-pay' }>;

function SolanaPay({ ins, network }: { ins: SolanaPayIns; network?: string }) {
  const qr = useQr(ins.url);

  return (
    <div>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {qr ? (
          <img src={qr} alt="Solana Pay QR" width={208} height={208} className="h-[208px] w-[208px] shrink-0 border border-rule bg-white p-2" />
        ) : (
          <div className="skeleton h-[208px] w-[208px] shrink-0" aria-hidden />
        )}
        <div>
          <p className="text-body text-ink-2">
            Scan with Phantom or Solflare{network ? ` on ${network}` : ''}. The wallet builds the {ins.amount} {ins.symbol} transfer and this page updates on its own.
          </p>
          <Button as="a" href={ins.url} label="Open in wallet" className="mt-5" />
          <div className="mt-3"><CopyButton text={ins.url} label="Copy payment link" /></div>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 border-t border-rule pt-4 font-mono text-mono-xs">
        <dt className="uppercase text-ink-3">Destination</dt>
        <dd className="break-all text-ink-2">{ins.to}</dd>
        <dt className="uppercase text-ink-3">Reference</dt>
        <dd className="break-all text-ink-2">{ins.reference}</dd>
      </dl>
    </div>
  );
}

export function CopyButton({ text, label, surface = 'paper' }: { text: string; label: string; surface?: 'paper' | 'bench' }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(text).then(() => {
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      })}
      className={cn('font-mono text-mono-xs uppercase underline-offset-4 hover:underline', surface === 'bench' ? 'text-bench-ink-2 hover:text-bench-ink' : 'text-signal-deep')}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

/** Browser country (es-AR → AR). Only used to suggest a rail; all of them can be chosen. */
const browserCountry = () => (typeof navigator === 'undefined' ? undefined : navigator.language.split('-')[1]?.toUpperCase());

export function suggest(rails: RailManifest[]): string | undefined {
  const c = browserCountry();
  const usable = rails.filter((r) => r.available);
  return (usable.find((r) => c && r.countries?.includes(c)) ?? usable.find((r) => !r.countries?.length) ?? usable[0])?.id;
}
