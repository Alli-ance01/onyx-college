export const systemRoleCodes = [
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'PRINCIPAL',
  'TEACHER',
  'STUDENT',
] as const;

export type SystemRoleCode = (typeof systemRoleCodes)[number];

export const accountTypes = ['APPLICANT', 'STUDENT', 'TEACHER', 'ADMINISTRATOR'] as const;
export type AccountType = (typeof accountTypes)[number];

export const accountStatuses = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'DISABLED',
  'ARCHIVED',
] as const;
export type AccountStatus = (typeof accountStatuses)[number];

export type PortalExperience = 'ADMIN' | 'ONBOARDING' | 'STUDENT' | 'TEACHER';

export interface AuthenticatedPrincipal {
  accountStatus: AccountStatus;
  accountType: AccountType;
  displayName: string;
  mustChangePassword: boolean;
  permissions: readonly string[];
  portal: PortalExperience;
  roles: readonly SystemRoleCode[];
  sessionId: string;
  userId: string;
  username: string;
}

export interface AuthTokensResponse {
  accessToken: string;
  csrfToken: string;
  expiresInSeconds: number;
  principal: AuthenticatedPrincipal;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface AuthSessionSummary {
  createdAt: string;
  current: boolean;
  deviceLabel: string;
  expiresAt: string;
  id: string;
  lastUsedAt: string;
}
