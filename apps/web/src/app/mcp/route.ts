import { mcp } from '@/server/hub';

const handle = (req: Request) => mcp(req);
export { handle as GET, handle as POST, handle as DELETE };
