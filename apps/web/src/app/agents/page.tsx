import AgentsPage from '@/views/Agents';
import { siteOrigin } from '@/server/origin';

export default async function Page() {
  return <AgentsPage origin={await siteOrigin()} />;
}
