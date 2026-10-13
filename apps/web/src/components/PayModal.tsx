import { useEffect, useMemo, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { RailManifest, Shell } from '@ras/shell-spec';
import { PayStep } from '@/components/PayStep';
import { createIntent, useRails } from '@/lib/api';
import { suggest } from '@/pages/Checkout';

/** Pick the rail for the modal: Solana Pay when the gateway offers it, otherwise the suggested human rail (e.g. the dev "fake" rail). */
const pickRail = (rails: RailManifest[]): RailManifest | undefined => {
  const human = rails.filter((r) => r.audience.includes('human') && r.available);
  return human.find((r) => r.id === 'solana-pay') ?? human.find((r) => r.id === suggest(human));
};

/**
 * Pay without leaving the shell page: a native <dialog> with the payment ticket (Solana Pay QR).
 * The intent is created on open; "Change payment method" goes to the full checkout.
 */
export function PayModal({ shell, blocks, open, onClose }: { shell: Shell; blocks: number; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const { data: rails, isError } = useRails();
  const rail = useMemo(() => (rails ? pickRail(rails) : undefined), [rails]);
  const intent = useMutation({ mutationFn: createIntent });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // one intent per opening
  useEffect(() => {
    if (open && rail && intent.isIdle) intent.mutate({ shell: shell.id, blocks, rail: rail.id, asset: rail.assets[0]?.symbol });
    if (!open && !intent.isIdle) intent.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rail]);

  const minutes = shell.pricing.block_minutes * blocks;
  const total = (Number(shell.pricing.usd) * blocks).toFixed(2);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="pay-title"
      className="w-[min(100vw-2rem,56rem)] border border-ink bg-paper p-0 text-ink backdrop:bg-ink/60"
    >
      <div className="flex items-center justify-between gap-4 border-b border-rule px-5 py-3">
        <h2 id="pay-title" className="font-mono text-mono uppercase">
          Pay · {shell.name} · {minutes} min · ${total} USD
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="font-mono text-mono uppercase text-ink-3 hover:text-ink">
          Close ✕
        </button>
      </div>
      <div className="px-5 pb-6">
        {intent.data ? (
          <PayStep view={intent.data} rail={rail ?? null} onRestart={() => navigate(`/checkout?shell=${shell.id}&blocks=${blocks}`, { state: { shell: shell.id, blocks } })} />
        ) : isError || (rails && !rail) ? (
          <p role="alert" className="mt-6 text-body text-danger">
            No payment method is available right now. Try again in a few seconds.
          </p>
        ) : intent.isError ? (
          <p role="alert" className="mt-6 text-body text-danger">
            Could not create the payment: {(intent.error as Error).message}.
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-2" aria-busy>
            <div className="skeleton h-10" />
            <div className="skeleton h-56" />
          </div>
        )}
      </div>
    </dialog>
  );
}
