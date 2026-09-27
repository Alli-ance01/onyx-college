import { describe, expect, it } from 'vitest';

import {
  canonicalPermissions,
  canonicalRoles,
} from '../src/modules/access-control/domain/permission-catalogue.js';

describe('canonical access-control catalogue', () => {
  it('has unique permission codes and exact protected system roles', () => {
    const permissionCodes = canonicalPermissions.map(({ code }) => code);
    expect(new Set(permissionCodes).size).toBe(permissionCodes.length);
    expect(canonicalRoles.map(({ code }) => code)).toEqual([
      'SUPER_ADMIN',
      'SCHOOL_ADMIN',
      'PRINCIPAL',
      'TEACHER',
      'STUDENT',
    ]);
    expect(canonicalRoles.every((role) => role.protected)).toBe(true);
  });

  it('grants all permissions only to SUPER_ADMIN and none to STUDENT', () => {
    const superAdmin = canonicalRoles.find(({ code }) => code === 'SUPER_ADMIN');
    const student = canonicalRoles.find(({ code }) => code === 'STUDENT');
    expect(superAdmin?.permissionCodes).toHaveLength(canonicalPermissions.length);
    expect(student?.permissionCodes).toEqual([]);
  });

  it('keeps teacher defaults scoped and excludes administrative powers', () => {
    const teacher = canonicalRoles.find(({ code }) => code === 'TEACHER');
    expect(teacher?.permissionCodes).toContain('results.enter');
    expect(teacher?.permissionCodes).not.toContain('results.approve');
    expect(teacher?.permissionCodes).not.toContain('roles.manage');
  });
});
