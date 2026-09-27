import { randomUUID } from 'node:crypto';

import mongoose from 'mongoose';

import { ConflictError } from '../../../app/errors/app-error.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import {
  normalizeEmail,
  normalizePhone,
  normalizeUsername,
} from '../../identity/domain/identity-normalization.js';
import { PasswordService } from '../../identity/infrastructure/password-service.js';
import { UserModel } from '../../identity/infrastructure/user-model.js';
import { OutboxEventModel } from '../../system/infrastructure/system-models.js';
import {
  RegistrationFormConfigurationModel,
  StudentRegistrationModel,
} from '../infrastructure/registration-models.js';

export interface StudentSignupInput {
  email?: string;
  password: string;
  phone?: string;
  username: string;
}

export class StudentSignupService {
  readonly #audit = new AuditWriter();
  readonly #passwords = new PasswordService();

  public async create(
    input: StudentSignupInput,
    requestId: string,
  ): Promise<{ registrationId: string; username: string }> {
    const normalizedUsername = normalizeUsername(input.username);
    const normalizedEmail = input.email === undefined ? undefined : normalizeEmail(input.email);
    const normalizedPhone = input.phone === undefined ? undefined : normalizePhone(input.phone);
    const existing = await UserModel.exists({
      $or: [
        { normalizedUsername },
        ...(normalizedEmail === undefined ? [] : [{ normalizedEmail }]),
        ...(normalizedPhone === undefined ? [] : [{ normalizedPhone }]),
      ],
    });
    if (existing !== null)
      throw new ConflictError('An account cannot be created with those details.');

    const [passwordHash, configuration] = await Promise.all([
      this.#passwords.hash(input.password),
      RegistrationFormConfigurationModel.findOne({ status: 'ACTIVE' }),
    ]);
    if (configuration === null)
      throw new ConflictError('Student registration is not currently available.');

    try {
      return await mongoose.connection.transaction(async (session) => {
        const user = new UserModel({
          accountStatus: 'ACTIVE',
          accountType: 'APPLICANT',
          normalizedUsername,
          passwordHash,
          roles: [],
          username: input.username.trim(),
          mustChangePassword: false,
          ...(input.email === undefined ? {} : { email: input.email, normalizedEmail }),
          ...(input.phone === undefined ? {} : { normalizedPhone, phone: input.phone }),
        });
        await user.save({ session });
        const registration = new StudentRegistrationModel({
          configurationVersionId: configuration._id,
          data: {},
          status: 'DRAFT',
          userId: user._id,
        });
        await registration.save({ session });
        await this.#audit.append(
          {
            action: 'STUDENT_APPLICANT_ACCOUNT_CREATED',
            actorType: 'USER',
            actorUserId: user._id,
            outcome: 'SUCCESS',
            requestId,
            targetId: registration._id.toString(),
            targetType: 'StudentRegistration',
          },
          session,
        );
        await OutboxEventModel.create(
          [
            {
              aggregateId: registration._id.toString(),
              aggregateType: 'StudentRegistration',
              eventId: randomUUID(),
              eventType: 'StudentApplicantAccountCreated',
              occurredAt: new Date(),
              payload: { registrationId: registration._id.toString(), userId: user._id.toString() },
              status: 'PENDING',
              transactionActorId: user._id,
            },
          ],
          { session },
        );
        return { registrationId: registration._id.toString(), username: user.username };
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 11000)
        throw new ConflictError('An account cannot be created with those details.');
      throw error;
    }
  }
}
