import type { SystemRoleCode } from '@onyx/contracts';

export interface CanonicalPermission {
  code: string;
  description: string;
  domain: string;
  sensitivity: 'STANDARD' | 'SENSITIVE' | 'PRIVILEGED';
}

const codesByDomain = {
  students: [
    'students.read',
    'students.read_sensitive',
    'students.approve_registration',
    'students.update',
    'students.manage_corrections',
    'students.suspend',
    'students.withdraw',
    'students.graduate',
    'students.archive',
  ],
  teachers: [
    'teachers.read',
    'teachers.invite',
    'teachers.create',
    'teachers.approve',
    'teachers.update',
    'teachers.suspend',
    'teachers.archive',
    'teachers.assign',
  ],
  academics: [
    'sessions.manage',
    'terms.manage',
    'classes.manage',
    'tracks.manage',
    'subjects.manage',
    'subject_offerings.manage',
  ],
  enrollments: ['enrollments.read', 'enrollments.manage', 'enrollments.promote'],
  assignments: [
    'assignments.create',
    'assignments.update',
    'assignments.publish',
    'assignments.archive',
    'assignments.manage_all',
  ],
  announcements: [
    'announcements.create_scoped',
    'announcements.create_schoolwide',
    'announcements.update_own',
    'announcements.manage_all',
  ],
  results: [
    'results.enter',
    'results.submit',
    'results.review',
    'results.approve',
    'results.publish',
    'results.request_correction',
    'results.approve_correction',
    'results.configure',
    'results.read_all',
  ],
  documents: ['documents.read', 'documents.review', 'documents.configure'],
  administration: [
    'admins.create',
    'admins.manage',
    'roles.manage',
    'permissions.manage',
    'users.suspend',
  ],
  system: ['audit.read', 'settings.manage'],
} as const;

const privileged = new Set([
  'students.read_sensitive',
  'roles.manage',
  'permissions.manage',
  'admins.manage',
  'users.suspend',
  'audit.read',
]);

export const canonicalPermissions: readonly CanonicalPermission[] = Object.entries(codesByDomain)
  .flatMap(([domain, codes]) =>
    codes.map((code) => ({
      code,
      description: code.replaceAll('.', ' ').replaceAll('_', ' '),
      domain,
      sensitivity: privileged.has(code) ? ('PRIVILEGED' as const) : ('STANDARD' as const),
    })),
  )
  .sort((left, right) => left.code.localeCompare(right.code));

const allPermissionCodes = canonicalPermissions.map(({ code }) => code);

const teacherPermissions = [
  'students.read',
  'enrollments.read',
  'assignments.create',
  'assignments.update',
  'assignments.publish',
  'announcements.create_scoped',
  'announcements.update_own',
  'results.enter',
  'results.submit',
  'results.request_correction',
] as const;

const principalPermissions = [
  'students.read',
  'teachers.read',
  'enrollments.read',
  'assignments.manage_all',
  'announcements.create_schoolwide',
  'announcements.manage_all',
  'results.review',
  'results.approve',
  'results.read_all',
  'documents.read',
] as const;

const schoolAdminExcluded = new Set([
  'admins.create',
  'admins.manage',
  'roles.manage',
  'permissions.manage',
]);

export interface CanonicalRole {
  code: SystemRoleCode;
  description: string;
  displayName: string;
  permissionCodes: readonly string[];
  protected: boolean;
}

export const canonicalRoles: readonly CanonicalRole[] = [
  {
    code: 'SUPER_ADMIN',
    displayName: 'Super Administrator',
    description: 'Initial unrestricted system-administration role, subject to system invariants.',
    permissionCodes: allPermissionCodes,
    protected: true,
  },
  {
    code: 'SCHOOL_ADMIN',
    displayName: 'School Administrator',
    description:
      'Broad operational school administration without protected access-control management.',
    permissionCodes: allPermissionCodes.filter((code) => !schoolAdminExcluded.has(code)),
    protected: true,
  },
  {
    code: 'PRINCIPAL',
    displayName: 'Principal',
    description: 'School-wide academic oversight and result review/approval.',
    permissionCodes: principalPermissions,
    protected: true,
  },
  {
    code: 'TEACHER',
    displayName: 'Teacher',
    description:
      'Scoped academic operations; every academic action also requires assignment scope.',
    permissionCodes: teacherPermissions,
    protected: true,
  },
  {
    code: 'STUDENT',
    displayName: 'Student',
    description: 'Ownership-based portal self-service without administrative permissions.',
    permissionCodes: [],
    protected: true,
  },
] as const;
