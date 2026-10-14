import CheckoutPage from '@/views/Checkout';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const shellId = typeof sp.shell === 'string' ? sp.shell : 'el-tucu';
  const blocks = Math.min(6, Math.max(1, Number(sp.blocks ?? 1) || 1));
  return <CheckoutPage shellId={shellId} blocks={blocks} />;
}
