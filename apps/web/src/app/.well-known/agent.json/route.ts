import { agentCard } from '@/server/hub';
import { siteOrigin } from '@/server/origin';

export async function GET() {
  return Response.json(await agentCard(await siteOrigin()));
}
