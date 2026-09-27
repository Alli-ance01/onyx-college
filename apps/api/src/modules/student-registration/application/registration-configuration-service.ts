import type { RegistrationConfigurationDto, RegistrationCustomField } from '@onyx/contracts';
import mongoose from 'mongoose';

import { ConflictError, ValidationError } from '../../../app/errors/app-error.js';
import { SchoolSettingsModel } from '../../academics/infrastructure/academic-models.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import { RegistrationFormConfigurationModel } from '../infrastructure/registration-models.js';

const mandatoryKeys = new Set([
  'surname',
  'firstName',
  'dateOfBirth',
  'gender',
  'nationality',
  'residentialAddress',
  'guardianName',
  'guardianRelationship',
  'guardianPhone',
  'requestedClass',
  'passportPhotograph',
]);
const conditionallyMandatoryKeys = new Set(['stateOfOrigin', 'lga', 'seniorTrack']);
const canonicalKeys = new Set([
  ...mandatoryKeys,
  ...conditionallyMandatoryKeys,
  'middleName',
  'studentPhone',
  'studentEmail',
  'guardianAlternatePhone',
  'guardianEmail',
  'guardianOccupation',
  'guardianAddress',
  'bloodGroup',
  'genotype',
  'allergies',
  'medicalConditions',
  'medications',
  'emergencyInstructions',
]);
const customTypes = new Set([
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'DATE',
  'SELECT',
  'MULTISELECT',
  'BOOLEAN',
  'EMAIL',
  'PHONE',
]);

export class RegistrationConfigurationService {
  readonly #audit = new AuditWriter();

  public async createVersion(input: {
    actorUserId: string;
    canonicalFields: Record<string, unknown>[];
    customFields: RegistrationCustomField[];
    requestId: string;
  }): Promise<RegistrationConfigurationDto> {
    const canonicalByKey = new Map(
      input.canonicalFields.map((field) => [String(field.key), field]),
    );
    if (
      canonicalByKey.size !== input.canonicalFields.length ||
      input.canonicalFields.some((field) => !canonicalKeys.has(String(field.key)))
    )
      throw new ValidationError('Canonical registration fields are invalid or duplicated.');
    for (const key of mandatoryKeys) {
      const field = canonicalByKey.get(key);
      if (field?.enabled !== true || field.required !== true)
        throw new ValidationError(
          `The canonical field ${key} cannot be disabled or made optional.`,
        );
    }
    for (const key of conditionallyMandatoryKeys) {
      if (canonicalByKey.get(key)?.enabled !== true)
        throw new ValidationError(`The conditional canonical field ${key} cannot be disabled.`);
    }
    const customKeys = new Set<string>();
    for (const field of input.customFields) {
      if (
        !/^[a-z][a-zA-Z0-9_]{1,63}$/u.test(field.key) ||
        customKeys.has(field.key) ||
        canonicalByKey.has(field.key)
      )
        throw new ValidationError(`The custom field key ${field.key} is invalid or duplicated.`);
      if (!customTypes.has(field.type))
        throw new ValidationError(`The custom field type ${field.type} is unsupported.`);
      if (['SELECT', 'MULTISELECT'].includes(field.type) && (field.options?.length ?? 0) === 0)
        throw new ValidationError(`The field ${field.key} needs allowed options.`);
      if (
        field.options !== undefined &&
        new Set(field.options.map((option) => option.toLocaleLowerCase('en-NG'))).size !==
          field.options.length
      ) {
        throw new ValidationError(`The field ${field.key} has duplicate allowed options.`);
      }
      if (
        field.validation?.minimum !== undefined &&
        field.validation.maximum !== undefined &&
        field.validation.minimum > field.validation.maximum
      ) {
        throw new ValidationError(`The field ${field.key} has an invalid numeric range.`);
      }
      if (
        field.validation?.minimumLength !== undefined &&
        field.validation.maximumLength !== undefined &&
        field.validation.minimumLength > field.validation.maximumLength
      ) {
        throw new ValidationError(`The field ${field.key} has an invalid length range.`);
      }
      if (
        field.validation?.earliestDate !== undefined &&
        field.validation.latestDate !== undefined &&
        field.validation.earliestDate > field.validation.latestDate
      ) {
        throw new ValidationError(`The field ${field.key} has an invalid date range.`);
      }
      customKeys.add(field.key);
    }
    return mongoose.connection.transaction(async (session) => {
      const current = await RegistrationFormConfigurationModel.findOne({
        status: 'ACTIVE',
      }).session(session);
      if (current === null) throw new ConflictError('No active registration configuration exists.');
      current.status = 'SUPERSEDED';
      await current.save({ session });
      const created = new RegistrationFormConfigurationModel({
        canonicalFields: input.canonicalFields,
        createdByUserId: new mongoose.Types.ObjectId(input.actorUserId),
        customFields: input.customFields,
        publishedAt: new Date(),
        status: 'ACTIVE',
        versionNumber: current.versionNumber + 1,
      });
      await created.save({ session });
      await SchoolSettingsModel.updateOne(
        { singletonKey: 'SCHOOL' },
        { $set: { currentRegistrationConfigurationId: created._id } },
        { session },
      );
      await this.#audit.append(
        {
          action: 'REGISTRATION_CONFIGURATION_VERSION_CREATED',
          actorType: 'USER',
          actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
          changes: { versionNumber: created.versionNumber },
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: created._id.toString(),
          targetType: 'RegistrationFormConfiguration',
        },
        session,
      );
      return {
        canonicalFields:
          created.canonicalFields as unknown as RegistrationConfigurationDto['canonicalFields'],
        customFields:
          created.customFields as unknown as RegistrationConfigurationDto['customFields'],
        id: created._id.toString(),
        publishedAt: created.publishedAt.toISOString(),
        versionNumber: created.versionNumber,
      };
    });
  }
}
