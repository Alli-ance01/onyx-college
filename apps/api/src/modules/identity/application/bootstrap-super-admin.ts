import mongoose from 'mongoose';
import { z } from 'zod';

import { AppError } from '../../../app/errors/app-error.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import { AuditLogModel } from '../../audit/infrastructure/audit-log-model.js';
import type { SyncAccessControlService } from '../../access-control/application/sync-access-control.js';
import { RoleModel } from '../../access-control/infrastructure/role-model.js';
import { normalizeEmail, normalizeUsername } from '../domain/identity-normalization.js';
import type { CredentialCrypto } from '../infrastructure/credential-crypto.js';
import { AuthSessionModel } from '../infrastructure/auth-session-model.js';
import { PasswordService } from '../infrastructure/password-service.js';
import { UserModel } from '../infrastructure/user-model.js';

const bootstrapKey = 'INITIAL_SUPER_ADMIN';

const bootstrapInputSchema = z.object({
  email: z.email().max(254).optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(
      /^[A-Za-z0-9._-]+$/u,
      'Username may use letters, numbers, dots, underscores, and hyphens.',
    ),
});

interface BootstrapInput {
  email?: string;
  username: string;
}

export interface BootstrapResult {
  temporaryPassword: string;
  userId: string;
  username: string;
}

export class BootstrapSuperAdminService {
  readonly #accessSync: SyncAccessControlService;
  readonly #auditWriter: AuditWriter;
  readonly #credentialCrypto: CredentialCrypto;
  readonly #passwordService: PasswordService;

  public constructor(
    accessSync: SyncAccessControlService,
    credentialCrypto: CredentialCrypto,
    passwordService = new PasswordService(),
    auditWriter = new AuditWriter(),
  ) {
    this.#accessSync = accessSync;
    this.#credentialCrypto = credentialCrypto;
    this.#passwordService = passwordService;
    this.#auditWriter = auditWriter;
  }

  public async execute(input: BootstrapInput): Promise<BootstrapResult> {
    const validatedInput = bootstrapInputSchema.parse(input);
    await this.#accessSync.execute();
    await Promise.all([
      AuditLogModel.createIndexes(),
      AuthSessionModel.createIndexes(),
      UserModel.createIndexes(),
    ]);

    const temporaryPassword = this.#credentialCrypto.createOpaqueValue(24);
    const passwordHash = await this.#passwordService.hash(temporaryPassword);
    const normalizedUsername = normalizeUsername(validatedInput.username);

    try {
      const created = await mongoose.connection.transaction(async (session) => {
        const role = await RoleModel.findOne({ code: 'SUPER_ADMIN', status: 'ACTIVE' })
          .session(session)
          .lean();
        if (role === null) {
          throw new Error('The canonical SUPER_ADMIN role is unavailable.');
        }

        const existing = await UserModel.exists({
          $or: [{ bootstrapKey }, { roles: role._id }],
        }).session(session);
        if (existing !== null) {
          throw new AppError('The initial SUPER_ADMIN has already been bootstrapped.', {
            code: 'BOOTSTRAP_ALREADY_COMPLETED',
            statusCode: 409,
          });
        }

        const user = new UserModel({
          accountStatus: 'ACTIVE' as const,
          accountType: 'ADMINISTRATOR' as const,
          bootstrapKey,
          normalizedUsername,
          mustChangePassword: true,
          passwordHash,
          roles: [role._id],
          username: validatedInput.username,
          ...(validatedInput.email === undefined
            ? {}
            : {
                email: validatedInput.email,
                normalizedEmail: normalizeEmail(validatedInput.email),
              }),
        });
        await user.save({ session });

        await this.#auditWriter.append(
          {
            action: 'INITIAL_SUPER_ADMIN_BOOTSTRAPPED',
            actorType: 'SYSTEM',
            outcome: 'SUCCESS',
            targetId: user._id.toString(),
            targetType: 'User',
          },
          session,
        );
        return { userId: user._id.toString(), username: user.username };
      });

      return { ...created, temporaryPassword };
    } catch (error) {
      if (
        error instanceof AppError ||
        (typeof error === 'object' && error !== null && 'code' in error && error.code === 11_000)
      ) {
        throw error instanceof AppError
          ? error
          : new AppError('The initial SUPER_ADMIN has already been bootstrapped.', {
              code: 'BOOTSTRAP_ALREADY_COMPLETED',
              statusCode: 409,
            });
      }
      throw error;
    }
  }
}
