import { forgers } from '@/server/hub';

export async function GET() {
  const list = await forgers();
  return Response.json({ ok: true, gateways: list.length, online: list.filter((g) => g.online).length });
}
