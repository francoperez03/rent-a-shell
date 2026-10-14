import { catalog } from '@/server/hub';

export async function GET() {
  return Response.json(await catalog());
}
