import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { AuthSessionProvider } from '../../lib/auth/auth-session-provider.js';
import { ToastProvider } from '../../shared/ui/toast.js';
import { createQueryClient } from './query-client.js';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthSessionProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthSessionProvider>
    </QueryClientProvider>
  );
}
