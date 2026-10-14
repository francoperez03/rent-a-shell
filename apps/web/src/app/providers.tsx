'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Shell } from '@ras/shell-spec';
import { MotionPrefProvider } from '@/lib/useReducedMotion';

/** Query client seeded with the catalog the layout fetched on the server: no skeleton, same HTML on both sides. */
export function Providers({ shells, children }: { shells: Shell[]; children: React.ReactNode }) {
  const [client] = useState(() => {
    const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });
    qc.setQueryData(['shells'], shells);
    return qc;
  });
  return (
    <QueryClientProvider client={client}>
      <MotionPrefProvider>{children}</MotionPrefProvider>
    </QueryClientProvider>
  );
}
