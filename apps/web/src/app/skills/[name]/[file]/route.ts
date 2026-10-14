import { skillFile } from '@/server/hub';

export async function GET(_req: Request, { params }: { params: Promise<{ name: string; file: string }> }) {
  const { name, file } = await params;
  const f = skillFile(name, file);
  return f ? new Response(f.body, { headers: { 'content-type': f.type } }) : Response.json({ error: 'not_found' }, { status: 404 });
}
