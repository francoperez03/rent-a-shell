import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import type { Instructions, IntentView, RailManifest } from '@ras/shell-spec';
import { Button } from '@/components/Button';
import { Readout } from '@/components/Readout';
import { Footer } from '@/components/Footer';
import { createIntent, fmtClock, getIntent, saveGrant, useEvents, useNow, useRails, useShell } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Browser country (es-AR → AR). Only used to suggest a rail; all of them can be chosen. */
const browserCountry = () => navigator.language.split('-')[1]?.toUpperCase();

function suggest(rails: RailManifest[]): string | undefined {
  const c = browserCountry();
  const usable = rails.filter((r) => r.available);
  return (usable.find((r) => c && r.countries?.includes(c)) ?? usable.find((r) => !r.countries?.length) ?? usable[0])?.id;
}

/** Checkout: product register. Two steps, one column of decisions, the ticket on the right. */
export default function CheckoutPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const st = (location.state ?? {}) as { shell?: string; blocks?: number };
  const shellId = params.get('shell') ?? st.shell ?? 'el-tucu';
  const blocks = Math.min(6, Math.max(1, Number(params.get('blocks') ?? st.blocks ?? 1) || 1));

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
              {shell?.name ?? shellId} · {blocks} {blocks === 1 ? 'block' : 'blocks'}
            </h1>
            <Link to={`/shells/${shellId}`} className="mt-3 inline-block font-mono text-mono uppercase text-signal-deep underline-offset-4 hover:underline">
              Change blocks
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
              <Link to="/agents" className="mt-3 inline-block font-mono text-mono uppercase text-signal-deep underline-offset-4 hover:underline">
                Agent guide
              </Link>
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

function PayStep({ view: first, rail, onRestart }: { view: IntentView; rail: RailManifest | null; onRestart: () => void }) {
  const navigate = useNavigate();
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
      navigate('/session');
    }
  }, [status, session, navigate]);

  const left = intent.expiresAt - now;
  const expired = status === 'expired' || (status === 'pending' && left <= 0);
  const explorer = session?.payment?.explorerUrl ?? seen?.explorerUrl;
  const paid = status === 'paid';

  return (
    <section aria-live="polite" className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_20rem]">
      {/* the ticket */}
      <div className={cn('border bg-paper-2', expired ? 'border-rule' : paid ? 'border-ok' : 'border-ink')}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule px-5 py-3">
          <p className="font-mono text-mono uppercase text-ink">{rail?.label ?? intent.rail}</p>
          <p className={cn('tabular font-mono text-mono uppercase', expired ? 'text-ink-3' : paid ? 'text-ok-deep' : left < 60_000 ? 'text-danger' : 'text-ink-2')}>
            {expired ? 'Expired' : paid ? 'Paid' : `Expires in ${fmtClock(left)}`}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 px-5 py-6 md:grid-cols-[auto_1fr] md:gap-10">
          <Readout label="Amount" value={intent.amount} unit={intent.asset} size="lg" />
          <div className="md:border-l md:border-rule md:pl-10">
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
        <Status status={status} seen={!!seen} expired={expired} />
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
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(ins.url, { margin: 1, width: 560, errorCorrectionLevel: 'M', color: { dark: '#15110D', light: '#FFFFFF' } }).then(setQr, () => setQr(null));
  }, [ins.url]);

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

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(text).then(() => {
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      })}
      className="font-mono text-mono-xs uppercase text-signal-deep underline-offset-4 hover:underline"
    >
      {done ? 'Copied' : label}
    </button>
  );
}
