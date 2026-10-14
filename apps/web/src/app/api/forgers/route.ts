import { forgers, register, remove } from '@/server/hub';

const json = (req: Request) => req.json().catch(() => ({}));

export async function GET() {
  return Response.json(await forgers());
}

export async function POST(req: Request) {
  const { status, body } = await register(await json(req));
  return Response.json(body, { status });
}

export async function DELETE(req: Request) {
  const { status, body } = await remove(await json(req), req.headers.get('authorization'));
  return Response.json(body, { status });
}
