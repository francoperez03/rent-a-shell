import { Eyebrow } from '@/components/Eyebrow';
import { Footer } from '@/components/Footer';
import { Pill } from '@/components/Pill';
// The example is copyable text: imported raw, so the site does not depend on the payment client.
import exampleRaw from '@/content/x402-fetch.example.txt?raw';

const ENDPOINTS: { method: string; path: string; what: string; auth?: boolean }[] = [
  { method: 'GET', path: '/api/shells', what: 'Shell specs: ranges, HOME, routines, price, camera and status.' },
  { method: 'GET', path: '/api/shells/:id/state', what: 'Real angles and whether it is moving.' },
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

/** Guide for agents and devs. Documentation page: no Lenis, no cursor. */
export default function AgentsPage() {
  const origin = window.location.origin;
  const example = exampleRaw.replace('{{ORIGIN}}', origin);

  return (
    <>
      <main className="mx-auto w-full max-w-container px-5 pb-24 pt-28 md:px-8 md:pt-32">
        <Eyebrow dark>For agents and devs</Eyebrow>
        <h1 className="max-w-[20ch] font-display font-light tracking-[-0.01em] text-white" style={{ fontSize: 'clamp(2.5rem, 5vw, 4.25rem)', lineHeight: 1.04 }}>
          Your agent tests its code on a real arm.
        </h1>
        <p className="mt-6 max-w-[60ch] text-[1.125rem] font-light leading-[1.55] text-white/80">
          It discovers the shell, pays for a block in USDC with x402, gets a token and sends commands. All over HTTP or MCP, no account.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Pill as="a" href="/llms.txt" label="llms.txt" />
          <Pill as="a" href="/.well-known/agent.json" variant="secondary" label="agent.json" />
        </div>

        <Section index="0.1" title="Endpoints">
          <div className="overflow-x-auto border border-white/15">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/15 font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">
                  <th className="px-4 py-3 font-normal">Method</th>
                  <th className="px-4 py-3 font-normal">Path</th>
                  <th className="px-4 py-3 font-normal">What it does</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map((e) => (
                  <tr key={e.method + e.path} className="border-b border-white/10 last:border-b-0">
                    <td className="px-4 py-3 font-mono text-[12px] text-white/70">{e.method}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-white">
                      {e.path}
                      {e.auth && <span className="ml-2 text-white/45">Bearer</span>}
                    </td>
                    <td className="px-4 py-3 text-[15px] text-white/75">{e.what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section index="0.2" title="Pay with x402">
          <ol className="mb-6 flex max-w-[64ch] list-decimal flex-col gap-2 pl-5 text-[1.0625rem] font-light leading-[1.6] text-white/80">
            <li>POST to /api/sessions/x402 with shell and blocks. The response is a 402 with the payment requirement.</li>
            <li>Your client signs the USDC payment and retries with the header. No gas: the facilitator pays it.</li>
            <li>You get token, starts_at and expires_at. If the robot is busy, your block starts when the previous one ends.</li>
            <li>Send commands with Authorization: Bearer. When time runs out, the robot returns to HOME on its own.</li>
          </ol>
          <Code label="TypeScript · x402 fetch client">{example}</Code>
          <Code label="Commands (POST /api/cmd body)" className="mt-6">{COMMANDS}</Code>
        </Section>

        <Section index="0.3" title="MCP">
          <p className="mb-6 max-w-[60ch] text-[1.0625rem] font-light leading-[1.6] text-white/80">
            The gateway exposes an MCP server at <span className="font-mono text-white">{origin}/mcp</span> with these tools:
          </p>
          <ul className="flex flex-wrap gap-2">
            {MCP_TOOLS.map((t) => (
              <li key={t} className="border border-white/15 px-3 py-1.5 font-mono text-[12px] text-white/80">{t}</li>
            ))}
          </ul>
          <Code label="Claude Code" className="mt-6">{`claude mcp add --transport http rent-a-shell ${origin}/mcp`}</Code>
        </Section>
      </main>
      <Footer />
    </>
  );
}

function Section({ index, title, children }: { index: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-20 border-t border-white/15 pt-10 md:mt-28">
      <Eyebrow dark index={index}>{title}</Eyebrow>
      {children}
    </section>
  );
}

function Code({ label, children, className }: { label: string; children: string; className?: string }) {
  return (
    <figure className={className}>
      <figcaption className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">{label}</figcaption>
      <pre className="overflow-x-auto border border-white/15 bg-[var(--panel-dark)] p-5 font-mono text-[12px] leading-[1.7] text-white/85">
        <code>{children}</code>
      </pre>
    </figure>
  );
}
