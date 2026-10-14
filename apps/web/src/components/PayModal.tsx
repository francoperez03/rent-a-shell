import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import type { IntentView, RailManifest, Shell } from '@ras/shell-spec';
import { Button } from '@/components/Button';
import { CopyButton, usePayment, useQr } from '@/components/PayStep';
import { GW_HEADERS, createIntent, fmtClock, useRails } from '@/lib/api';
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
          <Ticket view={intent.data} rail={rail ?? null} onRetry={() => { intent.reset(); start(); }} onClose={onClose} />
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

function Ticket({ view, rail, onRetry, onClose }: { view: IntentView; rail: RailManifest | null; onRetry: () => void; onClose: () => void }) {
  const { intent, left, expired, paid, seen, explorer, tx } = usePayment(view, { autoOpen: false });
  const navigate = useNavigate();
  const [walletError, setWalletError] = useState<string | null>(null);
  const ins = intent.instructions;
  const url = ins.kind === 'solana-pay' ? ins.url : null;
  const network = rail?.wallet?.chains[0]?.name;

  const phase = paid ? 'success' : expired || walletError ? 'error' : 'pending';
  const fade = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, transition: { duration: 0.15 } }, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const } };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {phase === 'success' ? (
        <motion.div key="success" {...fade} aria-live="polite" className="flex flex-col items-center text-center">
          <Mark kind="ok" />
          <p className="mt-4 font-mono text-mono uppercase text-ok-deep">Paid</p>
          <p className="tabular mt-1 font-mono text-data text-ink">
            {intent.amount} <span className="text-mono text-ink-3">{intent.asset}</span>
          </p>
          <div className="mt-6 flex w-full items-center justify-between gap-4 border-t border-rule pt-4 font-mono text-mono-xs uppercase">
            <span className="text-ink-3">Transaction</span>
            {tx ? (
              <a href={explorer ?? '#'} target="_blank" rel="noopener" className="tabular normal-case text-signal-deep underline-offset-4 hover:underline" title={tx}>
                {tx.slice(0, 6)}…{tx.slice(-6)} ↗
              </a>
            ) : (
              <span className="text-ink-2">Confirmed{network ? ` on ${network}` : ''}</span>
            )}
          </div>
          <Button label="Go to the lab" className="mt-6 w-full" onClick={() => navigate('/session')} />
          <p className="mt-3 w-full text-left text-small text-ink-3">Your session is saved. The console opens when you go in.</p>
        </motion.div>
      ) : phase === 'error' ? (
        <motion.div key="error" {...fade} aria-live="assertive" className="flex flex-col items-center text-center">
          <Mark kind="fail" />
          <p className="mt-4 font-mono text-mono uppercase text-danger">{expired ? 'No payment in time' : 'Payment failed'}</p>
          <p className="mt-2 max-w-[32ch] text-small text-ink-2">{expired ? 'The time to pay ran out. The amount is the same.' : walletError}</p>
          <Button label={expired ? 'New payment' : 'Try again'} className="mt-6 w-full" onClick={() => (expired ? onRetry() : setWalletError(null))} />
          <Button variant="ghost" label="Close" roll={false} className="mt-2 w-full" onClick={onClose} />
        </motion.div>
      ) : (
        <motion.div key="pending" {...fade} aria-live="polite" className="flex flex-col items-center text-center">
          <p className="tabular font-mono text-data text-ink">
            {intent.amount} <span className="text-mono text-ink-3">{intent.asset}</span>
          </p>
          {url ? <Qr url={url} /> : <p className="mt-6 max-w-[28ch] text-body text-ink-2">{ins.kind === 'approval' ? ins.note : 'This method is for agents. See /agents.'}</p>}
          {url && <WalletButtons url={url} network={network} chain={chainFor(network)} onError={setWalletError} />}
          <div className="mt-6 flex w-full items-center justify-between gap-4 border-t border-rule pt-4 font-mono text-mono-xs uppercase">
            <p role="status" className="flex items-center gap-2 text-ink">
              <span aria-hidden className="h-1.5 w-1.5 animate-status-pulse rounded-full bg-signal" />
              {seen ? 'Payment seen, confirming…' : 'Waiting for payment'}
            </p>
            <p className={cn('tabular', left < 60_000 ? 'text-danger' : 'text-ink-3')}>{fmtClock(left)}</p>
          </div>
          <p className="mt-3 w-full text-left text-small text-ink-3">Held in escrow until your session ends. If the robot drops, it comes back to your wallet.</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Result mark: a circle that draws itself, then a tick (ok) or a cross (fail). Reduced motion: drawn at once. */
function Mark({ kind }: { kind: 'ok' | 'fail' }) {
  const reduced = useReducedMotion();
  const draw = (delay: number, duration: number) =>
    reduced ? { initial: { pathLength: 1 }, animate: { pathLength: 1 } } : { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { delay, duration, ease: [0.22, 1, 0.36, 1] as const } };
  const color = kind === 'ok' ? 'text-ok' : 'text-danger';
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden className={cn('mt-2', color)}>
      <motion.circle cx="36" cy="36" r="33" stroke="currentColor" strokeWidth="2" {...draw(0, 0.5)} />
      {kind === 'ok' ? (
        <motion.path d="M22 37.5 L31.5 47 L50 27" stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" {...draw(0.35, 0.3)} />
      ) : (
        <>
          <motion.path d="M25 25 L47 47" stroke="currentColor" strokeWidth="3" strokeLinecap="square" {...draw(0.35, 0.2)} />
          <motion.path d="M47 25 L25 47" stroke="currentColor" strokeWidth="3" strokeLinecap="square" {...draw(0.5, 0.2)} />
        </>
      )}
    </svg>
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

// ---------- desktop: a Wallet Standard wallet (Phantom, Solflare) on the rail's chain; mobile: the solana: deep link ----------

type StdAccount = { address: string; chains: readonly string[] };
type StdWallet = {
  name: string;
  chains: readonly string[];
  accounts: readonly StdAccount[];
  features: Record<string, unknown> & {
    'standard:connect'?: { connect: () => Promise<{ accounts: readonly StdAccount[] }> };
    'solana:signAndSendTransaction'?: { signAndSendTransaction: (i: { transaction: Uint8Array; account: StdAccount; chain: string }) => Promise<{ signature: Uint8Array }[]> };
  };
};

/** Wallets registered through the Wallet Standard (no library: the app-ready event hands them over). */
function standardWallets(): StdWallet[] {
  const found: StdWallet[] = [];
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register: (...w: StdWallet[]) => { found.push(...w); return () => {}; } } }));
  return found.filter((w) => w.features['solana:signAndSendTransaction'] && w.features['standard:connect']);
}

/** Wallet Standard chain id from the rail's network label ("Solana Devnet" | "Solana"); the genesis hash stays in packages/rails. */
const chainFor = (label?: string) => (/devnet/i.test(label ?? '') ? 'solana:devnet' : 'solana:mainnet');

/** Solana Pay transaction request done by hand: POST the account, get the escrow transaction, let the wallet sign and send on `chain`. */
async function payWithWallet(wallet: StdWallet, txUrl: string, chain: string) {
  const { accounts } = await wallet.features['standard:connect']!.connect();
  const account = accounts.find((a) => a.chains.includes(chain)) ?? accounts[0];
  if (!account) throw new Error('The wallet has no account.');
  if (!wallet.chains.includes(chain)) throw new Error(`${wallet.name} does not support ${chain.replace('solana:', 'Solana ')}.`);
  const res = await fetch(txUrl, { method: 'POST', headers: { ...GW_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify({ account: account.address }) });
  const body = (await res.json().catch(() => ({}))) as { transaction?: string; error?: string; message?: string };
  if (!res.ok || !body.transaction) throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
  const transaction = Uint8Array.from(atob(body.transaction), (c) => c.charCodeAt(0));
  await wallet.features['solana:signAndSendTransaction']!.signAndSendTransaction({ transaction, account, chain });
}

function WalletButtons({ url, network, chain, onError }: { url: string; network?: string; chain: string; onError: (msg: string) => void }) {
  const [wallet] = useState(() => standardWallets()[0] ?? null);
  const txUrl = url.startsWith('solana:http') ? url.slice('solana:'.length) : null;
  const [busy, setBusy] = useState(false);
  const pay = async () => {
    if (!wallet || !txUrl) return;
    setBusy(true);
    try {
      await payWithWallet(wallet, txUrl, chain);
    } catch (e) {
      onError((e as Error).message || 'The wallet did not sign.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {wallet && txUrl ? (
        <Button label={`Pay with ${wallet.name}`} loading={busy} className="mt-6 w-full" onClick={pay} />
      ) : (
        <Button as="a" href={url} label="Open in wallet" className="mt-6 w-full" />
      )}
      <p className="mt-3 text-small text-ink-2">
        {wallet ? 'Or scan the QR with your phone' : 'Or scan with Phantom or Solflare'}
        {network ? ` on ${network}` : ''}.
      </p>
      <div className="mt-1"><CopyButton text={url} label="Copy payment link" /></div>
    </>
  );
}
