import AgentsPage from '@/views/Agents';
import { siteOrigin } from '@/server/origin';
import { catalog } from '@/server/hub';

export default async function Page() {
  // the examples target a real Forger gateway: the first online shell's, or the first known one
  const shells = await catalog();
  const gateway = (shells.find((s) => s.status !== 'offline') ?? shells[0])?.gateway;
  return <AgentsPage origin={await siteOrigin()} gateway={gateway} />;
}
