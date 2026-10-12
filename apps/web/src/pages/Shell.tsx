import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { LiveVideo } from '@/components/LiveVideo';
import { Pill } from '@/components/Pill';
import { StatusDot } from '@/components/StatusDot';
import { Footer } from '@/components/Footer';
import { HUB, api, fmtClock, setGateway, toMs, useNow, useQueue, useShell, useShellState } from '@/lib/api';
import { JOINTS, JOINT_LABEL } from '@/lib/joints';
import { cn } from '@/lib/cn';

const BLOCKS = [1, 2, 3, 4, 5, 6];

/** Ficha del shell: video, rangos, rutinas, precio, cola y selector de bloques. */
export default function ShellPage() {
  const { id } = useParams();
  const { data: shell, isLoading, isError } = useShell(id);
  // con hub, alquilar este shell es hablar con el gateway de su Forger (checkout y consola incluidos)
  useEffect(() => {
    if (HUB && shell?.gateway) setGateway(shell.gateway);
  }, [shell?.gateway]);
  const { data: state } = useShellState(id);
  const { data: queue } = useQueue(id);
  const now = useNow();
  const [blocks, setBlocks] = useState(1);

  if (isLoading) return <Layout><p className="font-mono text-[12px] uppercase tracking-[0.12em] text-white/60">Cargando ficha…</p></Layout>;
  if (isError || !shell)
    return (
      <Layout>
        <h1 className="font-display text-[40px] font-light text-white">{isError ? 'No pudimos hablar con el gateway.' : 'Ese shell no existe.'}</h1>
        <p className="mt-4 text-white/70">{isError ? 'Probá de nuevo en unos segundos.' : 'Volvé al inicio para ver los disponibles.'}</p>
      </Layout>
    );

  const total = (Number(shell.pricing.usd) * blocks).toFixed(2);
  const minutes = shell.pricing.block_minutes * blocks;
  const offline = shell.status === 'offline';

  return (
    <Layout>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
        <div>
          <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-white/60">{shell.kind} · {shell.location}</p>
            <StatusDot status={shell.status} className="text-white/85" />
          </div>
          <h1 className="font-display font-light tracking-[-0.01em] text-white" style={{ fontSize: 'clamp(2.5rem, 5vw, 4.25rem)', lineHeight: 1.02 }}>
            {shell.name}
          </h1>
          <LiveVideo shell={shell} className="mt-8 aspect-video w-full border border-white/15">
            {state && (
              <span className="absolute bottom-3 left-3 bg-[rgba(0,12,41,0.8)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-white/80">
                {JOINTS.map((j) => `${JOINT_LABEL[j]} ${Math.round(state.angles[j])}°`).join(' · ')}
              </span>
            )}
          </LiveVideo>
        </div>

        <aside className="flex flex-col gap-6 lg:pt-[1.75rem]">
          <fieldset className="rounded-sm border border-white/15 p-6 md:p-8">
            <legend className="px-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">Bloques</legend>
            <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Cantidad de bloques">
              {BLOCKS.map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={blocks === b}
                  onClick={() => setBlocks(b)}
                  className={cn(
                    'h-11 rounded-sm border font-mono text-[14px] transition-colors duration-base ease-out-quint',
                    blocks === b ? 'border-accent bg-accent text-accent-ink' : 'border-white/25 text-white/80 hover:border-white/60'
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
            <p className="mt-5 font-mono text-[12px] uppercase tracking-[0.12em] text-white/70">
              {minutes} min · USD {total}
            </p>
            <Pill
              as="link"
              to={`/checkout?shell=${shell.id}&blocks=${blocks}`}
              state={{ shell: shell.id, blocks }}
              label="Ir a pagar"
              className={cn('mt-6 w-full', offline && 'pointer-events-none opacity-40')}
              aria-disabled={offline}
            />
            {offline && <p className="mt-3 text-[15px] text-white/60">{shell.name} está offline. Volvé en un rato.</p>}
          </fieldset>
          <div className="rounded-sm bg-bg-inset p-6 shadow-[var(--shadow-hairline)] md:p-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink">Ficha</p>

            <Label>Rangos</Label>
            <dl className="flex flex-col gap-2">
              {JOINTS.map((j) => (
                <div key={j} className="grid grid-cols-[6rem_1fr_auto] items-baseline gap-3 font-mono text-[12px] md:text-[13px]">
                  <dt className="text-ink-mute">{JOINT_LABEL[j]}</dt>
                  <dd className="text-ink-soft">{shell.joints[j][0]}° a {shell.joints[j][1]}°</dd>
                  <dd className="text-[11px] text-ink-mute">HOME {shell.home[j]}°</dd>
                </div>
              ))}
            </dl>

            <Label>Rutinas</Label>
            <p className="font-mono text-[12px] text-ink-soft md:text-[13px]">{shell.routines.join(' · ')}</p>

            <Label>Precio</Label>
            <p className="font-display text-[40px] font-light leading-none text-ink">
              USD {shell.pricing.usd}
              <span className="ml-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-mute">por {shell.pricing.block_minutes} min</span>
            </p>

            <Label>Tenerlo propio</Label>
            <p className="text-[15px] leading-[1.55] text-ink-soft">
              Unos USD {shell.build.parts_usd} en partes, {shell.build.lead_days} días de espera y {shell.build.build_hours} h de armado antes de la primera prueba.
              Acá probás hoy: {((shell.build.parts_usd / Number(shell.pricing.usd)) * shell.pricing.block_minutes / 60).toLocaleString('es-AR', { maximumFractionDigits: 2 })} h de uso cuestan lo mismo que las partes.
            </p>

            <Label>Forger</Label>
            <p className="text-[15px] leading-[1.55] text-ink-soft">
              {shell.forger.name} lo armó y lo mantiene.{shell.forger.customizations && ' Acepta pedidos de personalización'}
              {shell.forger.customizations && (shell.forger.contact ? <>: <a href={shell.forger.contact} className="underline underline-offset-4">contacto</a>.</> : '.')}
            </p>

            {shell.forger.customizations && <CustomRequest shellId={shell.id} forger={shell.forger.name} />}

            <Label>Cola</Label>
            <p className="font-mono text-[12px] text-ink-soft md:text-[13px]">
              {!queue
                ? '·'
                : queue.active
                  ? `En uso, quedan ${fmtClock(toMs(queue.active.expires_at) - now)}. ${queue.waiting} esperando.`
                  : queue.waiting
                    ? `${queue.waiting} esperando.`
                    : 'Libre ahora.'}
            </p>
          </div>

        </aside>
      </div>
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto min-h-viewport w-full max-w-container px-5 pb-24 pt-28 md:px-8 md:pt-32">{children}</main>
      <Footer />
    </>
  );
}

function Label({ children }: { children: string }) {
  return <p className="mb-3 mt-6 border-t border-hairline pt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-mute">{children}</p>;
}

/** Pedido de personalización al Forger (un sensor extra, otro efector, otro montaje). */
function CustomRequest({ shellId, forger }: { shellId: string; forger: string }) {
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const send = useMutation({
    mutationFn: () => api<{ ok: true }>(`/api/shells/${shellId}/requests`, { method: 'POST', body: JSON.stringify({ contact, message }) }),
  });

  if (send.isSuccess) return <p className="mt-4 text-[15px] text-ink-soft">Listo. {forger} te va a escribir a {contact}.</p>;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-accent hover:underline">
        Pedir una personalización
      </button>
    );
  return (
    <form
      className="mt-4 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      <label className="flex flex-col gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute">
        Contacto
        <input required maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Telegram, mail o X" className="rounded-sm border border-hairline bg-white px-3 py-2 font-sans text-[15px] normal-case tracking-normal text-ink" />
      </label>
      <label className="flex flex-col gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute">
        Qué necesitás
        <textarea required minLength={10} maxLength={2000} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ej: un sensor de distancia en la pinza" className="rounded-sm border border-hairline bg-white px-3 py-2 font-sans text-[15px] normal-case tracking-normal text-ink" />
      </label>
      <Pill type="submit" surface="light" label={send.isPending ? 'Enviando…' : 'Enviar al Forger'} disabled={send.isPending} />
      {send.isError && <p role="alert" className="text-[15px] text-alert">{(send.error as Error).message}</p>}
    </form>
  );
}
