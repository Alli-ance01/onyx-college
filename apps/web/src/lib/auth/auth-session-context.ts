import { createContext } from 'react';

import type { AuthSessionSnapshot, AuthenticatedPrincipal } from './auth-session.js';

export interface AuthSessionContextValue extends AuthSessionSnapshot {
  clearSession(): void;
  setAuthenticated(principal: AuthenticatedPrincipal): void;
  setChecking(): void;
}

export const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);
