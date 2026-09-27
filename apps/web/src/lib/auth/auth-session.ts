import type { AuthenticatedPrincipal } from '@onyx/contracts';

export type AuthSessionStatus = 'anonymous' | 'authenticated' | 'checking' | 'expired';

export type AuthSessionSnapshot =
  | { principal: AuthenticatedPrincipal; status: 'authenticated' }
  | { principal: null; status: Exclude<AuthSessionStatus, 'authenticated'> };

export interface AccessTokenProvider {
  getAccessToken(): string | null;
}

export interface SessionRefresher {
  refreshSession(): Promise<boolean>;
}

export interface LoginCredentials {
  identifier: string;
  password: string;
}

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
}
