import { useContext } from 'react';

import { AuthSessionContext, type AuthSessionContextValue } from './auth-session-context.js';

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);

  if (context === null) {
    throw new Error('useAuthSession must be used within AuthSessionProvider.');
  }

  return context;
}
