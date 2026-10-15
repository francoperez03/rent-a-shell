import Landing from '@/views/Landing';
import { siteOrigin } from '@/server/origin';

export default async function Page() {
  return <Landing origin={await siteOrigin()} />;
}
