import { Footer } from '@/components/Footer';
import { Button } from '@/components/Button';
import { SectionIndex } from '@/components/SectionIndex';
// The example is copyable text: imported raw, so the site does not depend on the payment client.
import exampleRaw from '@/content/x402-fetch.example.txt?raw';

const ENDPOINTS: { method: string; path: string; what: string; auth?: boolean }[] = [
  { method: 'GET', path: '/api/shells', what: 'Shell specs: ranges, HOME, routines, sensors, price, camera and status.' },
  { method: 'GET', path: '/api/shells/:id/state', what: 'Real angles, current in mA and whether it is moving.' },
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
export default function AgentsPage() {
  const origin = window.location.origin;
  const example = exampleRaw.replace('{{ORIGIN}}', origin);

  return (
    <>
      <main className="mx-auto w-full max-w-container px-4 pb-24 pt-24 md:px-6 md:pt-28">
        <header className="grid grid-cols-1 gap-8 border-b border-rule pb-10 lg:grid-cols-[1fr_22rem]">
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
            <Spec k="Skill" v={<a href="https://github.com/francoperez03/rent-a-shell/tree/main/skills/rent-a-shell" className="text-signal-deep underline-offset-4 hover:underline" rel="noopener">rent-a-shell for Claude Code</a>} />
          </dl>
        </header>

        <section className="mt-section">
          <SectionIndex index="01" title="Endpoints" body="Every gateway exposes the same API. The hub lists the gateways." />
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-rule font-mono text-mono-xs uppercase text-ink-3">
                  <th className="py-3 pr-4 font-normal">Method</th>
                  <th className="py-3 pr-4 font-normal">Path</th>
                  <th className="py-3 font-normal">What it does</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map((e) => (
                  <tr key={e.method + e.path} className="border-b border-rule align-top even:bg-paper-2">
                    <td className="py-3 pr-4 font-mono text-mono text-ink-2">{e.method}</td>
                    <td className="py-3 pr-4 font-mono text-mono text-ink">
                      {e.path}
                      {e.auth && <span className="ml-2 text-ink-3">Bearer</span>}
                    </td>
                    <td className="py-3 text-small text-ink-2">{e.what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-section">
          <SectionIndex index="02" title="Pay with x402" />
          <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[22rem_1fr]">
            <ol className="flex list-none flex-col gap-4">
              {[
                'POST to /api/sessions/x402 with the shell and the time you want (blocks of five minutes). The response is a 402 with the payment requirement.',
                'Your client signs the USDC payment and retries with the header. No gas: the facilitator pays it.',
                'You get token, starts_at and expires_at. If the robot is busy, your time starts when the previous session ends.',
                'Send commands with Authorization: Bearer. When time runs out, the robot returns to HOME on its own.',
              ].map((t, i) => (
                <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-3 border-t border-rule pt-3">
                  <span className="tabular font-mono text-mono text-ink-3">0{i + 1}</span>
                  <span className="text-body text-ink-2">{t}</span>
                </li>
              ))}
            </ol>
            <div className="min-w-0">
              <Code label="TypeScript · x402 fetch client">{example}</Code>
              <Code label="Commands · POST /api/cmd body" className="mt-6">{COMMANDS}</Code>
            </div>
          </div>
        </section>

        <section className="mt-section">
          <SectionIndex index="03" title="MCP" body={`The gateway exposes an MCP server at ${origin}/mcp.`} />
          <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[22rem_1fr]">
            <ul className="flex flex-wrap gap-2 self-start">
              {MCP_TOOLS.map((t) => (
                <li key={t} className="border border-rule-2 px-3 py-1.5 font-mono text-mono text-ink">{t}</li>
              ))}
            </ul>
            <Code label="Claude Code">{`claude mcp add --transport http rent-a-shell ${origin}/mcp`}</Code>
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

function Code({ label, children, className }: { label: string; children: string; className?: string }) {
  return (
    <figure className={className}>
      <figcaption className="flex items-center justify-between border border-b-0 border-bench-rule bg-bench-2 px-4 py-2 font-mono text-mono-xs uppercase text-bench-ink-2">
        {label}
      </figcaption>
      <pre className="on-bench overflow-x-auto border border-bench-rule bg-bench p-5 font-mono text-mono leading-[1.7] text-bench-ink">
        <code>{children}</code>
      </pre>
    </figure>
  );
}
