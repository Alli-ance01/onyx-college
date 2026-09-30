import type { ClientSession, Types } from 'mongoose';

import { AuthorizationError, ConflictError } from '../../../app/errors/app-error.js';
import { RoleModel } from '../../access-control/infrastructure/role-model.js';
import { UserModel } from '../../identity/infrastructure/user-model.js';

export async function activeRoleCodesForUser(
  userId: string | Types.ObjectId,
  session?: ClientSession,
): Promise<readonly string[]> {
  const user = await UserModel.findById(userId)
    .select({ accountStatus: 1, roles: 1 })
    .session(session ?? null)
    .lean();
  if (user?.accountStatus !== 'ACTIVE') {
    throw new AuthorizationError();
  }
  const roles = await RoleModel.find({ _id: { $in: user.roles }, status: 'ACTIVE' })
    .select({ code: 1 })
    .session(session ?? null)
    .lean();
  return roles.map(({ code }) => code);
}

export async function requireSuperAdminActor(
  actorUserId: string | Types.ObjectId,
  session?: ClientSession,
): Promise<void> {
  const roleCodes = await activeRoleCodesForUser(actorUserId, session);
  if (!roleCodes.includes('SUPER_ADMIN')) {
    throw new AuthorizationError('Only a current SUPER_ADMIN may change SUPER_ADMIN access.');
  }
}

export async function ensureAnotherActiveSuperAdmin(
  excludedUserId: string | Types.ObjectId,
  session?: ClientSession,
): Promise<void> {
  const superAdminRole = await RoleModel.findOne({ code: 'SUPER_ADMIN', status: 'ACTIVE' })
    .select({ _id: 1 })
    .session(session ?? null)
    .lean();
  if (superAdminRole === null) {
    throw new ConflictError('The protected SUPER_ADMIN role is unavailable.');
  }
  await RoleModel.updateOne(
    { _id: superAdminRole._id },
    { $inc: { version: 1 } },
    session === undefined ? {} : { session },
  );
  const replacementExists = await UserModel.exists({
    _id: { $ne: excludedUserId },
    accountStatus: 'ACTIVE',
    accountType: 'ADMINISTRATOR',
    roles: superAdminRole._id,
  }).session(session ?? null);
  if (replacementExists === null) {
    throw new ConflictError('The last active SUPER_ADMIN cannot be removed or suspended.');
  }
}

export async function lockSuperAdminMembership(session: ClientSession): Promise<void> {
  const superAdminRole = await RoleModel.findOne({ code: 'SUPER_ADMIN', status: 'ACTIVE' })
    .select({ _id: 1 })
    .session(session)
    .lean();
  if (superAdminRole === null) {
    throw new ConflictError('The protected SUPER_ADMIN role is unavailable.');
  }
  await RoleModel.updateOne({ _id: superAdminRole._id }, { $inc: { version: 1 } }, { session });
}
