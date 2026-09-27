import type { AuthenticatedPrincipal, PortalExperience, SystemRoleCode } from '@onyx/contracts';

import { AuthenticationError } from '../../../app/errors/app-error.js';
import type { PrincipalResolver } from '../../identity/application/auth-records.js';
import { UserModel } from '../../identity/infrastructure/user-model.js';
import { PermissionModel } from './permission-model.js';
import { RoleModel } from './role-model.js';

function resolvePortal(roles: readonly string[], accountType: string): PortalExperience {
  if (roles.some((role) => ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL'].includes(role))) {
    return 'ADMIN';
  }
  if (roles.includes('TEACHER')) {
    return 'TEACHER';
  }
  if (roles.includes('STUDENT')) {
    return 'STUDENT';
  }
  return accountType === 'APPLICANT' ? 'ONBOARDING' : 'STUDENT';
}

export class MongoPrincipalResolver implements PrincipalResolver {
  public async resolve(userId: string, sessionId: string): Promise<AuthenticatedPrincipal> {
    const user = await UserModel.findById(userId)
      .select({ accountStatus: 1, accountType: 1, mustChangePassword: 1, roles: 1, username: 1 })
      .lean();
    if (user?.accountStatus !== 'ACTIVE') {
      throw new AuthenticationError('The account is unavailable.', 'ACCOUNT_UNAVAILABLE');
    }

    const roles = await RoleModel.find({ _id: { $in: user.roles }, status: 'ACTIVE' })
      .select({ code: 1, permissionIds: 1 })
      .lean();
    const permissionIds = [...new Set(roles.flatMap((role) => role.permissionIds.map(String)))];
    const permissions = await PermissionModel.find({
      _id: { $in: permissionIds },
      status: 'ACTIVE',
    })
      .select({ code: 1 })
      .lean();
    const roleCodes = roles.map((role) => role.code).sort() as SystemRoleCode[];

    return {
      accountStatus: user.accountStatus,
      accountType: user.accountType,
      displayName: user.username,
      mustChangePassword: user.mustChangePassword,
      permissions: permissions.map(({ code }) => code).sort(),
      portal: resolvePortal(roleCodes, user.accountType),
      roles: roleCodes,
      sessionId,
      userId: user._id.toString(),
      username: user.username,
    };
  }
}
