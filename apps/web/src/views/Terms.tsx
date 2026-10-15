'use client';
import { motion } from 'framer-motion';
import { Footer } from '@/components/Footer';
import { useReveal } from '@/lib/useReveal';

const PARTIES: { who: string; what: string }[] = [
  { who: 'Renter', what: 'Uses the shell within the spec sheet’s limits and the gateway’s command allowlist. Does not try to film or identify people. Accepts that a block ends on time and the robot returns to HOME. Refunds happen only when the shell goes offline during the session (escrow payments) or never (x402 direct payments). Devnet sessions have no monetary value.' },
  { who: 'Forger', what: 'Keeps the hardware safe for remote use: joint limits and safe cutoff in the firmware, nothing fragile or alive within reach, a fixed camera framing on the robot with a visible notice at the place, no third parties in frame. Answers for their equipment and the place where it runs. May ask for a damage deposit per shell.' },
  { who: 'Platform', what: 'Runs the escrow with public rules: 90 % to the Forger and 10 % to the platform on settle, refund when the shell goes down, reclaim by anyone after expires_at + 1 h. Never holds funds outside the program. May remove a shell or a renter that breaks these terms.' },
];

const SECTIONS: { title: string; body: string[] }[] = [
  { title: 'Payments', body: [
    'With Solana Pay, the USDC is held in the escrow program until the session ends, then settled 90/10. If the shell goes offline for longer than the gateway’s offline limit, the session is cut and the deposit is refunded.',
    'With x402, the agent pays upfront and the payment is final.',
    'Prices are per block, set by each Forger and shown on the shell’s spec sheet, in llms.txt and at checkout before paying.',
  ] },
  { title: 'Camera', body: [
    'The camera points at the robot and its work area only, from a fixed mount. A sign at the place says the robot is operated remotely and filmed. If a person walks into frame, the Forger stops the stream; sessions in flight are refunded by the offline rule.',
    'Renters do not record, redistribute or try to identify anyone who appears on camera.',
  ] },
  { title: 'Devnet notice', body: [
    'Today Rent a Shell runs on Solana devnet. Devnet USDC has no monetary value, sessions paid on devnet are tests, and nothing here is an offer to sell a service for real money until mainnet is announced.',
  ] },
  { title: 'Liability', body: [
    'Each party answers for what it controls: the renter for the commands it sends, the Forger for the hardware and the place, the platform for the escrow program and the catalog. No party is liable to another for indirect losses or for the result of a renter’s test. Hardware wears and sometimes breaks; the Forger decides whether a shell stays published.',
  ] },
  { title: 'Changes', body: [
    'These terms may change; the date at the top says when. Continuing to rent or publish after a change means accepting it.',
  ] },
];

/** Terms as a datasheet: who commits to what, then the short rules. Same register as the agent guide. */
export default function TermsPage() {
  const reveal = useReveal();
  return (
    <>
      <main className="mx-auto w-full max-w-container px-4 pb-24 pt-24 md:px-6 md:pt-28">
        <motion.header {...reveal(0, 'mount')} className="border-b border-rule pb-10">
          <p className="font-mono text-mono uppercase text-ink-3">Terms of use · updated 2026-10-14</p>
          <h1 className="wide-106 mt-3 max-w-[22ch] text-h1">Who commits to what.</h1>
          <p className="mt-5 max-w-prose text-lead text-ink-2">
            A renter (a person or an agent) uses a shell published by a Forger for a paid, timed session. This page is short on purpose and it is public. It is not legal advice.
          </p>
        </motion.header>

        <section className="mt-section">
          <h2 className="text-h2">Three parties</h2>
          <dl className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
            {PARTIES.map((p, i) => (
              <motion.div key={p.who} {...reveal(0.06 * i)} className="border-t border-rule pt-4">
                <dt className="font-mono text-mono uppercase text-ink-3">{p.who}</dt>
                <dd className="mt-3 text-body text-ink-2">{p.what}</dd>
              </motion.div>
            ))}
          </dl>
        </section>

        {SECTIONS.map((s) => (
          <motion.section key={s.title} {...reveal()} className="mt-section grid grid-cols-1 gap-6 border-t border-rule pt-6 lg:grid-cols-[22rem_1fr]">
            <h2 className="text-h3">{s.title}</h2>
            <div className="flex max-w-prose flex-col gap-4">
              {s.body.map((b) => <p key={b} className="text-body text-ink-2">{b}</p>)}
            </div>
          </motion.section>
        ))}

        <p className="mt-section border-t border-rule pt-6 font-mono text-mono-xs uppercase text-ink-3">Not legal advice · a lawyer reviews this before mainnet</p>
      </main>
      <Footer />
    </>
  );
}
