import { Eyebrow } from '@/components/Eyebrow';
import { Footer } from '@/components/Footer';
import { Pill } from '@/components/Pill';
// El ejemplo es texto para copiar: se importa crudo, el sitio no depende del cliente de pagos.
import exampleRaw from '@/content/x402-fetch.example.txt?raw';

const ENDPOINTS: { method: string; path: string; what: string; auth?: boolean }[] = [
  { method: 'GET', path: '/api/shells', what: 'Fichas: rangos, HOME, rutinas, precio, cámara y estado.' },
  { method: 'GET', path: '/api/shells/:id/state', what: 'Ángulos reales y si se está moviendo.' },
  { method: 'GET', path: '/api/shells/:id/frame', what: 'Cuadro JPEG de la cámara en este momento.' },
  { method: 'GET', path: '/api/shells/:id/queue', what: 'Sesión en curso y cuántos esperan.' },
  { method: 'POST', path: '/api/sessions/x402?shell=&blocks=', what: 'Responde 402 con el requerimiento. Con el pago firmado devuelve el token.' },
  { method: 'GET', path: '/api/session', what: 'Estado de tu sesión: inicio, vencimiento, si está activa.', auth: true },
  { method: 'POST', path: '/api/cmd', what: 'joint, dance o stop. Fuera de rango se recorta al rango seguro.', auth: true },
  { method: 'POST', path: '/api/sessions/end', what: 'Cierra la sesión y manda el robot a HOME.', auth: true },
  { method: 'GET', path: '/api/events', what: 'SSE con estado, sesiones y pagos.' },
];

const COMMANDS = `{ "cmd": "joint", "args": { "joint": "base", "angle": 130 } }
{ "cmd": "dance", "args": { "rutina": "saludo" } }
{ "cmd": "stop" }`;

const MCP_TOOLS = ['list_shells', 'rent_shell', 'send_command', 'get_frame', 'get_state', 'end_session'];

/** Guía para agentes y devs. Página de documentación: sin Lenis ni cursor. */
export default function AgentsPage() {
  const origin = window.location.origin;
  const example = exampleRaw.replace('{{ORIGIN}}', origin);

  return (
    <>
      <main className="mx-auto w-full max-w-container px-5 pb-24 pt-28 md:px-8 md:pt-32">
        <Eyebrow dark>Para agentes y devs</Eyebrow>
        <h1 className="max-w-[20ch] font-display font-light tracking-[-0.01em] text-white" style={{ fontSize: 'clamp(2.5rem, 5vw, 4.25rem)', lineHeight: 1.04 }}>
          Tu agente prueba su código en un brazo real.
        </h1>
        <p className="mt-6 max-w-[60ch] text-[1.125rem] font-light leading-[1.55] text-white/80">
          Descubre el shell, paga un bloque en USDC por x402, recibe un token y manda comandos. Todo por HTTP o por MCP, sin cuenta.
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
                  <th className="px-4 py-3 font-normal">Método</th>
                  <th className="px-4 py-3 font-normal">Ruta</th>
                  <th className="px-4 py-3 font-normal">Qué hace</th>
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

        <Section index="0.2" title="Pagar por x402">
          <ol className="mb-6 flex max-w-[64ch] list-decimal flex-col gap-2 pl-5 text-[1.0625rem] font-light leading-[1.6] text-white/80">
            <li>POST a /api/sessions/x402 con shell y bloques. La respuesta es 402 con el requerimiento de pago.</li>
            <li>Tu cliente firma el pago en USDC y reintenta con el header. Sin gas: lo paga el facilitator.</li>
            <li>Recibís token, starts_at y expires_at. Si el robot está ocupado, tu bloque arranca cuando termine el anterior.</li>
            <li>Mandás comandos con Authorization: Bearer. Al vencer, el robot vuelve solo a HOME.</li>
          </ol>
          <Code label="TypeScript · cliente fetch de x402">{example}</Code>
          <Code label="Comandos (body de POST /api/cmd)" className="mt-6">{COMMANDS}</Code>
        </Section>

        <Section index="0.3" title="MCP">
          <p className="mb-6 max-w-[60ch] text-[1.0625rem] font-light leading-[1.6] text-white/80">
            El gateway expone un servidor MCP en <span className="font-mono text-white">{origin}/mcp</span> con estas tools:
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
