import { issueToken, listTokens, revokeToken } from '@/server/hub';

const json = (req: Request) => req.json().catch(() => ({}));

export async function GET(req: Request) {
  const { status, body } = await listTokens(req.headers.get('authorization'));
  return Response.json(body, { status });
}

export async function POST(req: Request) {
  const { status, body } = await issueToken(await json(req), req.headers.get('authorization'));
  return Response.json(body, { status });
}

export async function DELETE(req: Request) {
  const { status, body } = await revokeToken(await json(req), req.headers.get('authorization'));
  return Response.json(body, { status });
}
