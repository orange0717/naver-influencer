'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { AuthModalProvider } from '@/contexts/AuthModalContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { MemberOnlyGateProvider } from '@/contexts/MemberOnlyGateContext';
import { TrialEndedGateProvider } from '@/contexts/TrialEndedGateContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthModalProvider>
        <MemberOnlyGateProvider>
          <TrialEndedGateProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </TrialEndedGateProvider>
        </MemberOnlyGateProvider>
      </AuthModalProvider>
    </QueryClientProvider>
  );
}
