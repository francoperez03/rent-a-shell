import ShellPage from '@/views/Shell';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  const { gw } = await searchParams;
  return <ShellPage id={id} gw={typeof gw === 'string' ? gw : undefined} />;
}
