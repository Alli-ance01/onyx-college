import type { AccountStatus, AccountType } from '@onyx/contracts';

export interface PermissionSummary {
  code: string;
  description: string;
  domain: string;
  id: string;
  sensitivity: 'PRIVILEGED' | 'SENSITIVE' | 'STANDARD';
  status: 'ACTIVE' | 'RETIRED';
  systemManaged: boolean;
}

export interface RoleSummary {
  code: string;
  description: string;
  displayName: string;
  id: string;
  permissions: readonly PermissionSummary[];
  protected: boolean;
  status: 'ACTIVE' | 'RETIRED';
  systemManaged: boolean;
  version: number;
}

export interface UserAccessSummary {
  accountStatus: AccountStatus;
  accountType: AccountType;
  createdAt: string;
  email?: string;
  id: string;
  lastLoginAt?: string;
  mustChangePassword: boolean;
  phone?: string;
  roles: readonly Pick<RoleSummary, 'code' | 'displayName' | 'id'>[];
  updatedAt: string;
  username: string;
  version: number;
}

export interface UserAccessPage {
  items: readonly UserAccessSummary[];
  nextCursor?: string;
}
