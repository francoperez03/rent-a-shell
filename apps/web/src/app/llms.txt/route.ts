import { llms } from '@/server/hub';
import { siteOrigin } from '@/server/origin';

export async function GET() {
  return new Response(await llms(await siteOrigin()), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
