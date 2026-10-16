// Admin-only diagnostic: how this Vercel instance reaches a gateway (DNS, fetch, timing). Used when the catalog marks a
// gateway offline while it answers from everywhere else. GET /api/probe?url=https://... with the admin bearer.
import { lookup } from 'node:dns/promises';
import { attempts, listTokens } from '@/server/hub';

export async function GET(req: Request) {
  const auth = (await listTokens(req.headers.get('authorization'))).status === 200;
  if (!auth) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const url = q.get('url');
  if (!url) return Response.json({ error: 'url_required' }, { status: 400 });
  const path = q.get('path') ?? '/api/health';
  const t0 = Date.now();
  const out: Record<string, unknown> = { url, path, timeoutMs: process.env.HUB_TIMEOUT_MS, attempts: attempts.map((a) => ({ ...a, at: new Date(a.at).toISOString().slice(11, 19) })), region: process.env.VERCEL_REGION, pid: process.pid, uptimeS: Math.round(process.uptime()) };
  try {
    out.dns = { ...(await lookup(new URL(url).hostname)), ms: Date.now() - t0 };
  } catch (e) {
    out.dns = { error: (e as Error).message, ms: Date.now() - t0 };
  }
  for (const [name, init] of Object.entries({ plain: {}, close: { headers: { connection: 'close' } }, nostore: { cache: 'no-store' as const } })) {
    const t = Date.now();
    try {
      const r = await fetch(`${url}${path}`, { ...init, signal: AbortSignal.timeout(25_000) });
      out[name] = { status: r.status, cfRay: r.headers.get('cf-ray'), ms: Date.now() - t, body: (await r.text()).slice(0, 80) };
    } catch (e) {
      out[name] = { error: (e as Error).message, cause: String((e as Error).cause ?? ''), ms: Date.now() - t };
    }
  }
  return Response.json(out);
}
