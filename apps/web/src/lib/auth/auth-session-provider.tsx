import type { AuthTokensResponse, SuccessEnvelope } from '@onyx/contracts';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { publicEnvironment } from '../../config/public-environment.js';
import { ApiClient, ApiClientError } from '../api/api-client.js';
import type { AuthSessionSnapshot, LoginCredentials, PasswordChange } from './auth-session.js';
import { AuthSessionContext, type AuthSessionContextValue } from './auth-session-context.js';

interface AuthSessionProviderProps {
  children: ReactNode;
  fetchImplementation?: typeof fetch;
}

const initialSession: AuthSessionSnapshot = { principal: null, status: 'checking' };
const refreshLockName = 'onyx-auth-refresh';

class CredentialMemory {
  #accessToken: string | null = null;
  #csrfToken: string | null = null;

  public accept(authentication: AuthTokensResponse): void {
    this.#accessToken = authentication.accessToken;
    this.#csrfToken = authentication.csrfToken;
  }

  public clear(): void {
    this.#accessToken = null;
    this.#csrfToken = null;
  }

  public getAccessToken(): string | null {
    return this.#accessToken;
  }

  public getCsrfToken(): string | null {
    return this.#csrfToken;
  }

  public setCsrfToken(value: string): void {
    this.#csrfToken = value;
  }
}

class RefreshCoordinator {
  #inFlight: Promise<boolean> | null = null;

  public run(operation: () => Promise<boolean>): Promise<boolean> {
    if (this.#inFlight !== null) return this.#inFlight;
    const pending = operation().finally(() => {
      this.#inFlight = null;
    });
    this.#inFlight = pending;
    return pending;
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

export function AuthSessionProvider({ children, fetchImplementation }: AuthSessionProviderProps) {
  const fetcher = fetchImplementation ?? fetch;
  const [session, setSession] = useState<AuthSessionSnapshot>(initialSession);
  const [credentials] = useState(() => new CredentialMemory());
  const [refreshCoordinator] = useState(() => new RefreshCoordinator());

  const authRequest = useCallback(
    async <TResponse,>(path: string, init?: RequestInit): Promise<TResponse> => {
      const headers = new Headers(init?.headers);
      headers.set('Accept', 'application/json');
      const response = await fetcher(`${publicEnvironment.VITE_API_BASE_URL}${path}`, {
        ...init,
        credentials: 'include',
        headers,
      });
      if (!response.ok) {
        throw await ApiClientError.fromResponse(response);
      }
      if (response.status === 204) {
        return undefined as TResponse;
      }
      return (await response.json()) as TResponse;
    },
    [fetcher],
  );

  const acceptAuthentication = useCallback(
    (authentication: AuthTokensResponse) => {
      credentials.accept(authentication);
      setSession({ principal: authentication.principal, status: 'authenticated' });
    },
    [credentials],
  );

  const clearAuthentication = useCallback(
    (status: 'anonymous' | 'expired') => {
      credentials.clear();
      setSession({ principal: null, status });
    },
    [credentials],
  );

  const fetchCsrf = useCallback(async (): Promise<string> => {
    const envelope = await authRequest<SuccessEnvelope<{ csrfToken: string }>>('/auth/csrf');
    credentials.setCsrfToken(envelope.data.csrfToken);
    return envelope.data.csrfToken;
  }, [authRequest, credentials]);

  const performRefresh = useCallback(async (): Promise<boolean> => {
    try {
      const csrf = await fetchCsrf();
      try {
        const envelope = await authRequest<SuccessEnvelope<AuthTokensResponse>>('/auth/refresh', {
          method: 'POST',
          headers: { 'X-CSRF-Token': csrf },
        });
        acceptAuthentication(envelope.data);
        return true;
      } catch (error) {
        if (!(error instanceof ApiClientError) || error.code !== 'AUTH_REFRESH_RETRY') {
          throw error;
        }
        await wait(175);
        const retryCsrf = await fetchCsrf();
        const retry = await authRequest<SuccessEnvelope<AuthTokensResponse>>('/auth/refresh', {
          method: 'POST',
          headers: { 'X-CSRF-Token': retryCsrf },
        });
        acceptAuthentication(retry.data);
        return true;
      }
    } catch (error) {
      if (error instanceof ApiClientError && [401, 403].includes(error.status)) {
        clearAuthentication('expired');
        return false;
      }
      throw error;
    }
  }, [acceptAuthentication, authRequest, clearAuthentication, fetchCsrf]);

  const refreshSession = useCallback((): Promise<boolean> => {
    return refreshCoordinator.run(async () => {
      if ('locks' in navigator) {
        return navigator.locks.request(refreshLockName, performRefresh);
      }
      return performRefresh();
    });
  }, [performRefresh, refreshCoordinator]);

  const apiClient = useMemo(
    () =>
      new ApiClient({
        accessTokenProvider: credentials,
        baseUrl: publicEnvironment.VITE_API_BASE_URL,
        fetchImplementation: fetcher,
        sessionRefresher: { refreshSession },
      }),
    [credentials, fetcher, refreshSession],
  );

  const login = useCallback(
    async (input: LoginCredentials) => {
      const envelope = await authRequest<SuccessEnvelope<AuthTokensResponse>>('/auth/login', {
        body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      acceptAuthentication(envelope.data);
    },
    [acceptAuthentication, authRequest],
  );

  const changePassword = useCallback(
    async (input: PasswordChange) => {
      const csrfToken = credentials.getCsrfToken();
      if (csrfToken === null) {
        throw new Error('The authenticated browser session is missing CSRF state.');
      }
      const envelope = await apiClient.request<SuccessEnvelope<AuthTokensResponse>>(
        '/auth/change-password',
        {
          body: input,
          headers: { 'X-CSRF-Token': csrfToken },
          method: 'POST',
        },
      );
      acceptAuthentication(envelope.data);
    },
    [acceptAuthentication, apiClient, credentials],
  );

  const logout = useCallback(async () => {
    try {
      const csrfToken = credentials.getCsrfToken();
      if (csrfToken !== null) {
        await authRequest<undefined>('/auth/logout', {
          headers: { 'X-CSRF-Token': csrfToken },
          method: 'POST',
        });
      }
    } finally {
      clearAuthentication('anonymous');
    }
  }, [authRequest, clearAuthentication, credentials]);

  useEffect(() => {
    let active = true;
    void refreshSession()
      .then((restored) => {
        if (active && !restored) clearAuthentication('anonymous');
      })
      .catch(() => {
        if (active) clearAuthentication('anonymous');
      })
      .finally(() => {
        if (active) {
          setSession((current) =>
            current.status === 'checking' ? { principal: null, status: 'anonymous' } : current,
          );
        }
      });
    return () => {
      active = false;
    };
  }, [clearAuthentication, refreshSession]);

  const value = useMemo<AuthSessionContextValue>(
    () => ({ ...session, apiClient, changePassword, login, logout, refreshSession }),
    [apiClient, changePassword, login, logout, refreshSession, session],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}
