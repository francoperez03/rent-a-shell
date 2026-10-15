import type { Metadata } from 'next';
import ShellsView from '@/views/Shells';
import { catalog } from '@/server/hub';

export const metadata: Metadata = { title: 'Shells · Rent a Shell' };

export default async function Page() {
  return <ShellsView shells={await catalog()} />;
}
