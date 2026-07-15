'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { AuthModalProvider } from '@/contexts/AuthModalContext';
import { SidebarProvider } from '@/contexts/SidebarContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthModalProvider>
        <SidebarProvider>{children}</SidebarProvider>
      </AuthModalProvider>
    </QueryClientProvider>
  );
}
