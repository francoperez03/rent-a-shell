import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import type { Instructions, IntentView, RailManifest } from '@ras/shell-spec';
import { Pill } from '@/components/Pill';
import { Footer } from '@/components/Footer';
import { createIntent, fmtClock, getIntent, saveGrant, useEvents, useNow, useRails, useShell } from '@/lib/api';
import { cn } from '@/lib/cn';

/** País del navegador (es-AR → AR). Sirve solo para sugerir un riel; se pueden elegir todos. */
const browserCountry = () => navigator.language.split('-')[1]?.toUpperCase();

function suggest(rails: RailManifest[]): string | undefined {
  const c = browserCountry();
  const usable = rails.filter((r) => r.available);
  return (usable.find((r) => c && r.countries?.includes(c)) ?? usable.find((r) => !r.countries?.length) ?? usable[0])?.id;
}

export default function CheckoutPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const st = (location.state ?? {}) as { shell?: string; blocks?: number };
  const shellId = params.get('shell') ?? st.shell ?? 'el-tucu';
  const blocks = Math.min(6, Math.max(1, Number(params.get('blocks') ?? st.blocks ?? 1) || 1));

  const { data: shell } = useShell(shellId);
  const { data: rails, isError: railsError } = useRails();
  // El checkout es para personas: los rieles solo de agentes (x402) se documentan en /agents.
  const human = useMemo(() => rails?.filter((r) => r.audience.includes('human')) ?? [], [rails]);
  const suggested = useMemo(() => suggest(human), [human]);

  const intent = useMutation({ mutationFn: createIntent });
  const [rail, setRail] = useState<RailManifest | null>(null);

  const choose = (r: RailManifest) => {
    setRail(r);
    intent.mutate({ shell: shellId, blocks, rail: r.id, asset: r.assets[0]?.symbol });
  };

  const total = shell ? (Number(shell.pricing.usd) * blocks).toFixed(2) : null;

  return (
    <>
      <main className="mx-auto min-h-viewport w-full max-w-container px-5 pb-24 pt-28 md:px-8 md:pt-32">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-white/60">Checkout</p>
        <h1 className="mt-4 font-display font-light tracking-[-0.01em] text-white" style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', lineHeight: 1.04 }}>
          {shell?.name ?? shellId} · {blocks} {blocks === 1 ? 'bloque' : 'bloques'}
        </h1>
        <p className="mt-4 font-mono text-[13px] uppercase tracking-[0.12em] text-white/70">
          {shell ? `${shell.pricing.block_minutes * blocks} min · USD ${total}` : '·'}
          <Link to={`/shells/${shellId}`} className="ml-4 text-white/50 underline-offset-4 hover:text-white hover:underline">Cambiar</Link>
        </p>

        {!intent.data ? (
          <section aria-labelledby="medios" className="mt-12">
            <h2 id="medios" className="mb-5 font-sans text-[13px] font-medium uppercase tracking-[0.14em] text-white/70">Elegí cómo pagar</h2>
            {railsError && <p className="text-white/70">No pudimos cargar los medios de pago. Probá de nuevo en unos segundos.</p>}
            {!rails && !railsError && <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-white/60">Cargando medios de pago…</p>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {human.map((r) => (
                <RailCard key={r.id} rail={r} suggested={r.id === suggested} busy={intent.isPending && rail?.id === r.id} onChoose={() => choose(r)} />
              ))}
            </div>
            {intent.isError && (
              <p role="alert" className="mt-6 text-[15px] text-alert-dark">
                No se pudo crear el pago: {(intent.error as Error).message}
              </p>
            )}
            <p className="mt-8 text-[15px] text-white/55">
              ¿Sos un agente? Pagá por x402: <Link to="/agents" className="underline underline-offset-4 hover:text-white">guía para agentes</Link>.
            </p>
          </section>
        ) : (
          <PayStep view={intent.data} rail={rail} onRestart={() => intent.reset()} />
        )}
      </main>
      <Footer />
    </>
  );
}

function RailCard({ rail, suggested, busy, onChoose }: { rail: RailManifest; suggested: boolean; busy: boolean; onChoose: () => void }) {
  return (
    <button
      type="button"
      disabled={!rail.available || busy}
      onClick={onChoose}
      className={cn(
        'group flex flex-col items-start rounded-sm border p-6 text-left transition-colors duration-base ease-out-quint',
        rail.available ? 'border-white/20 hover:border-white/60 hover:bg-white/5' : 'cursor-not-allowed border-white/10 opacity-50',
        suggested && rail.available && 'border-accent'
      )}
    >
      <span className="flex w-full items-center justify-between gap-4">
        <span className="font-display text-[24px] font-light text-white">{rail.label}</span>
        {suggested && rail.available && <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/70">Sugerido</span>}
        {!rail.available && <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/60">No disponible</span>}
      </span>
      <span className="mt-3 text-[15px] leading-[1.55] text-white/70">{rail.description}</span>
      <span className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">
        {rail.assets.map((a) => a.symbol).join(' · ')}
        {rail.wallet && ` · ${rail.wallet.chains.map((c) => c.name).join(', ')}`}
      </span>
      {busy && <span className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-white/70">Preparando…</span>}
    </button>
  );
}

function PayStep({ view: first, rail, onRestart }: { view: IntentView; rail: RailManifest | null; onRestart: () => void }) {
  const navigate = useNavigate();
  const now = useNow();
  const id = first.intent.id;
  const [seen, setSeen] = useState<{ explorerUrl?: string; tx?: string } | null>(null);

  // Polling cada 3 s hasta paid o expired.
  const { data } = useQuery({
    queryKey: ['intent', id],
    queryFn: () => getIntent(id),
    initialData: first,
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 3_000 : false),
  });
  const view = data ?? first;
  const { intent, status, session } = view;

  // El SSE avisa antes que el polling cuando el riel ve el pago.
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

  return (
    <section aria-live="polite" className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_1fr]">
      <div className="rounded-sm bg-bg-inset p-6 text-ink shadow-[var(--shadow-hairline)] md:p-8">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink">{rail?.label ?? intent.rail}</p>
          <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-ink-mute">
            {expired ? 'Vencido' : status === 'paid' ? 'Pagado' : `Vence en ${fmtClock(left)}`}
          </p>
        </div>

        <p className="mb-3 mt-6 border-t border-hairline pt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-mute">Monto</p>
        <p className="break-all font-display text-[clamp(2rem,4vw,3rem)] font-light leading-none text-ink">
          {intent.amount} <span className="font-mono text-[14px] uppercase tracking-[0.12em] text-ink-mute">{intent.asset}</span>
        </p>

        <div className="mt-6 border-t border-hairline pt-6">
          {expired ? (
            <div>
              <p className="text-ink-soft">El tiempo para pagar venció. Generá otro intento.</p>
              <Pill label="Elegir de nuevo" surface="light" className="mt-4" onClick={onRestart} />
            </div>
          ) : (
            <Instruct ins={intent.instructions} rail={rail} />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Status status={status} seen={!!seen} expired={expired} />
        {explorer && (
          <a href={explorer} target="_blank" rel="noopener" className="font-mono text-[12px] uppercase tracking-[0.12em] text-white/70 underline underline-offset-4 hover:text-white">
            Ver la transacción ↗
          </a>
        )}
        {!expired && status === 'pending' && (
          <button type="button" onClick={onRestart} className="self-start font-mono text-[11px] uppercase tracking-[0.16em] text-white/50 hover:text-white">
            Cambiar medio de pago
          </button>
        )}
      </div>
    </section>
  );
}

function Status({ status, seen, expired }: { status: IntentView['status']; seen: boolean; expired: boolean }) {
  const text = expired ? 'Sin pago a tiempo.' : status === 'paid' ? 'Pago confirmado. Abriendo la consola…' : seen ? 'Vimos tu pago. Confirmando…' : 'Esperando el pago…';
  return (
    <p role="status" className="flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.12em] text-white/80">
      <span aria-hidden className={cn('h-2 w-2 rounded-full', expired ? 'bg-white/30' : 'animate-status-pulse bg-accent')} />
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
          <p className="text-ink-soft">{ins.note}</p>
          <p className="mt-3 font-mono text-[12px] text-ink-mute">Referencia {ins.ref}</p>
        </div>
      );
    case 'x402':
      return <p className="text-ink-soft">Este medio es para agentes. Mirá la guía en /agents.</p>;
  }
}

// ---------- Solana Pay: QR para escanear con la wallet del celular ----------

type SolanaPayIns = Extract<Instructions, { kind: 'solana-pay' }>;

function SolanaPay({ ins, network }: { ins: SolanaPayIns; network?: string }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(ins.url, { margin: 1, width: 560, errorCorrectionLevel: 'M' }).then(setQr, () => setQr(null));
  }, [ins.url]);

  return (
    <div>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {qr && <img src={qr} alt="QR de Solana Pay" width={220} height={220} className="h-[220px] w-[220px] shrink-0 rounded-sm bg-white p-2" />}
        <div>
          <p className="text-[15px] leading-[1.55] text-ink-soft">
            Escaneá el QR con Phantom o Solflare{network ? ` en ${network}` : ''}. La wallet arma la transferencia de {ins.amount} {ins.symbol} y esta página se actualiza sola.
          </p>
          <Pill as="a" href={ins.url} surface="light" label="Abrir en la wallet" className="mt-5" />
          <div className="mt-4"><CopyButton text={ins.url} label="Copiar link de pago" /></div>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 font-mono text-[12px]">
        <dt className="text-ink-mute">Destino</dt>
        <dd className="break-all text-ink-soft">{ins.to}</dd>
        <dt className="text-ink-mute">Referencia</dt>
        <dd className="break-all text-ink-soft">{ins.reference}</dd>
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
      className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-accent hover:underline"
    >
      {done ? 'Copiado' : label}
    </button>
  );
}
