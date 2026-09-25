export type AuthSessionStatus = 'anonymous' | 'authenticated' | 'checking';

export interface AuthenticatedPrincipal {
  displayName: string;
  userId: string;
}

export interface AuthSessionSnapshot {
  principal: AuthenticatedPrincipal | null;
  status: AuthSessionStatus;
}

export interface AccessTokenProvider {
  getAccessToken(): string | null;
}

export interface SessionRefresher {
  refreshSession(): Promise<boolean>;
}
