import { useMemo, useState, type ReactNode } from 'react';

import type { AuthSessionSnapshot, AuthenticatedPrincipal } from './auth-session.js';
import { AuthSessionContext, type AuthSessionContextValue } from './auth-session-context.js';

interface AuthSessionProviderProps {
  children: ReactNode;
}

const initialSession: AuthSessionSnapshot = {
  principal: null,
  status: 'anonymous',
};

export function AuthSessionProvider({ children }: AuthSessionProviderProps) {
  const [session, setSession] = useState<AuthSessionSnapshot>(initialSession);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      ...session,
      clearSession: () => {
        setSession(initialSession);
      },
      setAuthenticated: (principal: AuthenticatedPrincipal) => {
        setSession({ principal, status: 'authenticated' });
      },
      setChecking: () => {
        setSession((current) => ({ ...current, status: 'checking' }));
      },
    }),
    [session],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}
