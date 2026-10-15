'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/Button';
import { SectionIndex } from '@/components/SectionIndex';
// The example is copyable text: imported raw, so the site does not depend on the payment client.
import { useReveal, useRows } from '@/lib/useReveal';
import { X402_EXAMPLE } from '@/content/x402-fetch.example';
import { INSTALL } from '@/content/install';

const ENDPOINTS: { method: string; path: string; what: string; auth?: boolean }[] = [
  { method: 'GET', path: '/api/shells', what: 'Shell specs: ranges, HOME, routines, sensors, price, camera and status.' },
  { method: 'GET', path: '/api/shells/:id/state', what: 'Real angles and whether it is moving (current in mA when the shell has the sensor).' },
  { method: 'GET', path: '/api/shells/:id/frame', what: 'Current JPEG camera frame.' },
  { method: 'GET', path: '/api/shells/:id/queue', what: 'Current session and how many are waiting.' },
  { method: 'POST', path: '/api/sessions/x402?shell=&blocks=', what: 'Answers 402 with the requirement. With the signed payment it returns the token.' },
  { method: 'GET', path: '/api/session', what: 'Your session status: start, expiry, whether it is active.', auth: true },
  { method: 'POST', path: '/api/cmd', what: 'joint, dance or stop. Out-of-range values are clamped to the safe range.', auth: true },
  { method: 'POST', path: '/api/sessions/end', what: 'Ends the session and sends the robot to HOME.', auth: true },
  { method: 'GET', path: '/api/events', what: 'SSE with status, sessions and payments.' },
];

const COMMANDS = `{ "cmd": "joint", "args": { "joint": "base", "angle": 130 } }
{ "cmd": "dance", "args": { "rutina": "saludo" } }
{ "cmd": "stop" }`;

const MCP_TOOLS = ['list_shells', 'rent_shell', 'send_command', 'get_frame', 'get_state', 'end_session'];

/** Agent guide as a technical datasheet: endpoints table, payment flow, MCP. */
/** `origin` is this site (catalog); `gateway` is a Forger's gateway, where payment and commands go. */
export default function AgentsPage({ origin, gateway }: { origin: string; gateway?: string }) {
  const gw = gateway ?? 'https://<gateway>';
  const example = X402_EXAMPLE.replace('{{ORIGIN}}', gw);
  const reveal = useReveal();
  const row = useRows();

  return (
    <>
      <main className="mx-auto w-full max-w-container px-4 pb-24 pt-24 md:px-6 md:pt-28">
        <motion.header {...reveal(0, 'mount')} className="grid grid-cols-1 gap-8 border-b border-rule pb-10 lg:grid-cols-[1fr_22rem]">
          <div>
            <p className="font-mono text-mono uppercase text-ink-3">For agents and the devs behind them</p>
            <h1 className="wide-106 mt-3 max-w-[22ch] text-h1">Your agent tests its code on a real arm.</h1>
            <p className="mt-5 max-w-prose text-lead text-ink-2">
              It discovers the shell, pays for a few minutes in USDC with x402, gets a token and sends commands. All over HTTP or MCP, no account.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button as="a" href="/llms.txt" label="llms.txt" />
              <Button as="a" href="/.well-known/agent.json" variant="secondary" label="agent.json" />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-6 self-end lg:grid-cols-1">
            <Spec k="Payment" v="x402 · USDC on Solana" />
            <Spec k="Gas" v="none, facilitator pays" />
            <Spec k="Rate limit" v="10 commands / s" />
            <Spec k="Skill" v={<a href="https://github.com/francoperez03/rent-a-shell/tree/main/skills/rent-a-shell" className="text-signal-deep underline-offset-4 hover:underline" rel="noopener">rent-a-shell (SKILL.md)</a>} />
          </dl>
        </motion.header>

        <motion.section {...reveal(0.1, 'mount')} className="mt-section grid grid-cols-1 gap-8 lg:grid-cols-[22rem_1fr]">
          <div>
            <h2 className="text-h2">Give your agent this</h2>
            <p className="mt-3 max-w-prose text-body text-ink-2">
              One sentence is enough. The site publishes <code className="font-mono text-[0.9em]">llms.txt</code> with the live gateway and a client that pays once, then takes one command at a time.
            </p>
          </div>
          <div className="min-w-0">
            <Code label="Say" wrap>{`Go to ${origin}, pick the shell, pay for 5 minutes, open the gripper and then ask me what to do next.`}</Code>
            <Code label="Install the skill once" wrap className="mt-6">{INSTALL}</Code>
          </div>
        </motion.section>

        <section className="mt-section">
          <SectionIndex index="01" title="Endpoints" body={`Every Forger runs a gateway next to their robot, and every gateway exposes the same API. This site only lists them: ${origin}/api/catalog gives each shell's gateway${gateway ? ` (today ${gateway})` : ''}.`} anim={reveal()} />
          <div className="mt-8">
            <table className="w-full border-collapse text-left">
              <thead className="hidden md:table-header-group">
                <tr className="border-b border-rule font-mono text-mono-xs uppercase text-ink-3">
                  <th className="py-3 pr-4 font-normal">Method</th>
                  <th className="py-3 pr-4 font-normal">Path</th>
                  <th className="py-3 font-normal">What it does</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map((e, i) => (
                  <motion.tr key={e.method + e.path} {...row(i)} className="grid grid-cols-[4.5rem_1fr] gap-x-4 border-b border-rule py-3 align-top even:bg-paper-2 md:table-row md:py-0">
                    <td className="font-mono text-mono text-ink-2 md:py-3 md:pr-4">{e.method}</td>
                    <td className="min-w-0 break-all font-mono text-mono text-ink md:py-3 md:pr-4">
                      {e.path}
                      {e.auth && <span className="ml-2 text-ink-3">Bearer</span>}
                    </td>
                    <td className="col-span-2 mt-1 text-small text-ink-2 md:col-span-1 md:mt-0 md:py-3">{e.what}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-section">
          <SectionIndex index="02" title="Pay with x402" anim={reveal()} />
          <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[22rem_1fr]">
            <ol className="flex list-none flex-col gap-4">
              {[
                'POST to /api/sessions/x402 with the shell and the time you want (blocks of five minutes). The response is a 402 with the payment requirement.',
                'Your client signs the USDC payment and retries with the header. No gas: the facilitator pays it.',
                'You get token, starts_at and expires_at. If the robot is busy, your time starts when the previous session ends.',
                'Send commands with Authorization: Bearer. When time runs out, the robot returns to HOME on its own.',
              ].map((t, i) => (
                <motion.li key={i} {...row(i)} className="grid grid-cols-[2.5rem_1fr] gap-3 border-t border-rule pt-3">
                  <span className="tabular font-mono text-mono text-ink-3">0{i + 1}</span>
                  <span className="text-body text-ink-2">{t}</span>
                </motion.li>
              ))}
            </ol>
            <motion.div {...reveal(0.1)} className="min-w-0">
              <Code label="TypeScript · x402 fetch client">{example}</Code>
              <Code label="Commands · POST /api/cmd body" wrap className="mt-6">{COMMANDS}</Code>
            </motion.div>
          </div>
        </section>

        <section className="mt-section">
          <SectionIndex index="03" title="MCP" body={`Two servers. The catalog at ${origin}/mcp (list_shells, get_shell) and each gateway's own at <gateway>/mcp, where renting and commands happen.`} anim={reveal()} />
          <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[22rem_1fr]">
            <ul className="flex flex-wrap gap-2 self-start">
              {MCP_TOOLS.map((t, i) => (
                <motion.li key={t} {...row(i)} className="border border-rule-2 px-3 py-1.5 font-mono text-mono text-ink">{t}</motion.li>
              ))}
            </ul>
            <Code label="MCP config" wrap>{`{ "mcpServers": { "rent-a-shell": { "type": "http", "url": "${origin}/mcp" }, "el-tucu": { "type": "http", "url": "${gw}/mcp" } } }`}</Code>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Spec({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="border-t border-rule pt-2">
      <dt className="font-mono text-mono-xs uppercase text-ink-3">{k}</dt>
      <dd className="mt-1 font-mono text-mono text-ink">{v}</dd>
    </div>
  );
}

function Code({ label, children, className, wrap = false }: { label: string; children: string; className?: string; wrap?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <figure className={className}>
      <figcaption className="flex items-center justify-between gap-4 border border-b-0 border-bench-rule bg-bench-2 px-4 py-2 font-mono text-mono-xs uppercase text-bench-ink-2">
        <span>{label}</span>
        <button type="button" onClick={copy} aria-live="polite" className="on-bench -my-2 -mr-2 px-2 py-2 text-mono-xs uppercase text-bench-ink-2 transition-colors duration-fast hover:text-bench-ink">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </figcaption>
      <pre className={cn('on-bench border border-bench-rule bg-bench p-5 font-mono text-mono leading-[1.7] text-bench-ink', wrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-auto')}>
        <code>{children}</code>
      </pre>
    </figure>
  );
}
