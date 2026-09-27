import { createContext } from 'react';

import type { ApiClient } from '../api/api-client.js';
import type { AuthSessionSnapshot, LoginCredentials, PasswordChange } from './auth-session.js';

export type AuthSessionContextValue = AuthSessionSnapshot & {
  apiClient: ApiClient;
  changePassword(input: PasswordChange): Promise<void>;
  login(input: LoginCredentials): Promise<void>;
  logout(): Promise<void>;
  refreshSession(): Promise<boolean>;
};

export const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);
