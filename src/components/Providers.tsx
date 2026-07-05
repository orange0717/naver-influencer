'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { AuthModalProvider } from '@/contexts/AuthModalContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthModalProvider>{children}</AuthModalProvider>
    </QueryClientProvider>
  );
}
