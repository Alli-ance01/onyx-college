import {
  classLevelCodes,
  trackCodes,
  type RegistrationConfigurationField,
  type RegistrationCustomField,
  type RegistrationDraftInput,
  type RegistrationStatus,
} from '@onyx/contracts';
import { z } from 'zod';

import { DomainConflictError, ValidationError } from '../../../app/errors/app-error.js';

const shortText = z.string().trim().max(120).optional();
const longText = z.string().trim().max(500).optional();

export const registrationDraftSchema = z
  .object({
    version: z.number().int().min(0),
    personal: z
      .object({
        surname: shortText,
        firstName: shortText,
        middleName: shortText,
        dateOfBirth: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/u)
          .optional(),
        gender: shortText,
        nationality: shortText,
        stateOfOrigin: shortText,
        lga: shortText,
      })
      .strict(),
    contact: z
      .object({
        phone: shortText,
        email: z.email().max(254).optional().or(z.literal('')),
        residentialAddress: longText,
      })
      .strict(),
    guardian: z
      .object({
        fullName: shortText,
        relationship: shortText,
        phone: shortText,
        alternatePhone: shortText,
        email: z.email().max(254).optional().or(z.literal('')),
        occupation: shortText,
        address: longText,
        emergencyContact: z.boolean().optional(),
      })
      .strict(),
    academic: z
      .object({
        requestedClassLevelCode: z.enum(classLevelCodes).optional(),
        requestedTrackCode: z.enum(trackCodes).optional(),
      })
      .strict(),
    medical: z
      .object({
        bloodGroup: shortText,
        genotype: shortText,
        allergies: longText,
        medicalConditions: longText,
        medications: longText,
        emergencyInstructions: longText,
      })
      .strict(),
    customResponses: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
      .optional(),
  })
  .strict();

export function normalizeHumanName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-NG');
}

export function normalizePhone(value: string): string {
  const digits = value.trim().replace(/\D/gu, '');
  if (digits.startsWith('234') && digits.length === 13) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+234${digits.slice(1)}`;
  return digits.length >= 7 ? `+${digits}` : value.trim();
}

export interface DuplicateIdentityKeys {
  normalizedDateOfBirth: string;
  normalizedFirstName: string;
  normalizedGuardianPhone: string;
  normalizedSurname: string;
}

export function classifyDuplicateCandidate(
  expected: DuplicateIdentityKeys,
  candidate: Partial<DuplicateIdentityKeys>,
): { confidence: 'FUZZY' | 'STRONG'; matchedFields: string[] } | null {
  const matchedFields = Object.entries(expected)
    .filter(
      ([key, value]) => value !== '' && candidate[key as keyof DuplicateIdentityKeys] === value,
    )
    .map(([key]) => key);
  if (matchedFields.length < 2) return null;
  return {
    confidence: matchedFields.length === 4 ? 'STRONG' : 'FUZZY',
    matchedFields,
  };
}

function requiredText(
  value: string | undefined,
  path: string,
  issues: Record<string, string>[],
): void {
  if (value === undefined || value.trim() === '') {
    issues.push({ code: 'REQUIRED', message: 'This field is required.', path });
  }
}

function validateCustomField(
  field: RegistrationCustomField,
  value: unknown,
  issues: Record<string, string>[],
): void {
  const path = `customResponses.${field.key}`;
  const absent =
    value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  if (absent) {
    if (field.required) issues.push({ code: 'REQUIRED', message: 'This field is required.', path });
    return;
  }
  const stringArray =
    Array.isArray(value) && value.every((item): item is string => typeof item === 'string');
  const invalidType =
    (['TEXT', 'TEXTAREA', 'DATE', 'EMAIL', 'PHONE', 'SELECT'].includes(field.type) &&
      typeof value !== 'string') ||
    (field.type === 'NUMBER' && typeof value !== 'number') ||
    (field.type === 'BOOLEAN' && typeof value !== 'boolean') ||
    (field.type === 'MULTISELECT' && !stringArray);
  if (invalidType) {
    issues.push({ code: 'INVALID_TYPE', message: 'The value has the wrong type.', path });
    return;
  }
  if (typeof value === 'string') {
    if ((field.validation?.minimumLength ?? 0) > value.length)
      issues.push({ code: 'TOO_SHORT', message: 'The value is too short.', path });
    if ((field.validation?.maximumLength ?? Number.POSITIVE_INFINITY) < value.length)
      issues.push({ code: 'TOO_LONG', message: 'The value is too long.', path });
    if (field.type === 'EMAIL' && !z.email().safeParse(value).success)
      issues.push({ code: 'INVALID_EMAIL', message: 'Enter a valid email address.', path });
    if (field.type === 'DATE' && !z.iso.date().safeParse(value).success)
      issues.push({ code: 'INVALID_DATE', message: 'Enter a valid date.', path });
    if (field.type === 'PHONE' && normalizePhone(value).length < 8)
      issues.push({ code: 'INVALID_PHONE', message: 'Enter a valid phone number.', path });
    if (
      field.type === 'DATE' &&
      field.validation?.earliestDate !== undefined &&
      value < field.validation.earliestDate
    )
      issues.push({ code: 'DATE_TOO_EARLY', message: 'The date is earlier than allowed.', path });
    if (
      field.type === 'DATE' &&
      field.validation?.latestDate !== undefined &&
      value > field.validation.latestDate
    )
      issues.push({ code: 'DATE_TOO_LATE', message: 'The date is later than allowed.', path });
    if (field.type === 'SELECT' && !field.options?.includes(value))
      issues.push({ code: 'INVALID_OPTION', message: 'Select an allowed option.', path });
  }
  if (
    typeof value === 'number' &&
    field.validation?.minimum !== undefined &&
    value < field.validation.minimum
  )
    issues.push({ code: 'NUMBER_TOO_SMALL', message: 'The number is below the minimum.', path });
  if (
    typeof value === 'number' &&
    field.validation?.maximum !== undefined &&
    value > field.validation.maximum
  )
    issues.push({ code: 'NUMBER_TOO_LARGE', message: 'The number is above the maximum.', path });
  if (
    field.type === 'MULTISELECT' &&
    stringArray &&
    !value.every((item) => field.options?.includes(item) === true)
  )
    issues.push({ code: 'INVALID_OPTION', message: 'Select only allowed options.', path });
}

function canonicalBinding(
  data: Omit<RegistrationDraftInput, 'version'>,
  key: string,
): { path: string; value: unknown } | null {
  const bindings: Record<string, { path: string; value: unknown }> = {
    allergies: { path: 'medical.allergies', value: data.medical.allergies },
    bloodGroup: { path: 'medical.bloodGroup', value: data.medical.bloodGroup },
    dateOfBirth: { path: 'personal.dateOfBirth', value: data.personal.dateOfBirth },
    emergencyInstructions: {
      path: 'medical.emergencyInstructions',
      value: data.medical.emergencyInstructions,
    },
    firstName: { path: 'personal.firstName', value: data.personal.firstName },
    gender: { path: 'personal.gender', value: data.personal.gender },
    genotype: { path: 'medical.genotype', value: data.medical.genotype },
    guardianAddress: { path: 'guardian.address', value: data.guardian.address },
    guardianAlternatePhone: {
      path: 'guardian.alternatePhone',
      value: data.guardian.alternatePhone,
    },
    guardianEmail: { path: 'guardian.email', value: data.guardian.email },
    guardianName: { path: 'guardian.fullName', value: data.guardian.fullName },
    guardianOccupation: { path: 'guardian.occupation', value: data.guardian.occupation },
    guardianPhone: { path: 'guardian.phone', value: data.guardian.phone },
    guardianRelationship: {
      path: 'guardian.relationship',
      value: data.guardian.relationship,
    },
    lga: { path: 'personal.lga', value: data.personal.lga },
    medicalConditions: {
      path: 'medical.medicalConditions',
      value: data.medical.medicalConditions,
    },
    medications: { path: 'medical.medications', value: data.medical.medications },
    middleName: { path: 'personal.middleName', value: data.personal.middleName },
    nationality: { path: 'personal.nationality', value: data.personal.nationality },
    requestedClass: {
      path: 'academic.requestedClassLevelCode',
      value: data.academic.requestedClassLevelCode,
    },
    residentialAddress: {
      path: 'contact.residentialAddress',
      value: data.contact.residentialAddress,
    },
    seniorTrack: {
      path: 'academic.requestedTrackCode',
      value: data.academic.requestedTrackCode,
    },
    stateOfOrigin: { path: 'personal.stateOfOrigin', value: data.personal.stateOfOrigin },
    studentEmail: { path: 'contact.email', value: data.contact.email },
    studentPhone: { path: 'contact.phone', value: data.contact.phone },
    surname: { path: 'personal.surname', value: data.personal.surname },
  };
  return bindings[key] ?? null;
}

function hasConfiguredValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  return value !== undefined && value !== null;
}

export function validateRegistrationForSubmission(
  data: Omit<RegistrationDraftInput, 'version'>,
  canonicalFields: readonly RegistrationConfigurationField[],
  customFields: readonly RegistrationCustomField[],
  hasPassportPhotograph: boolean,
): void {
  const issues: Record<string, string>[] = [];
  const conditionallyRequired = new Set(['stateOfOrigin', 'lga', 'seniorTrack']);
  for (const field of canonicalFields) {
    const binding = canonicalBinding(data, field.key);
    if (binding === null) continue;
    if (!field.enabled && hasConfiguredValue(binding.value))
      issues.push({
        code: 'FIELD_DISABLED',
        message: 'This field is not enabled for this registration form.',
        path: binding.path,
      });
    if (
      field.enabled &&
      field.required &&
      !conditionallyRequired.has(field.key) &&
      !hasConfiguredValue(binding.value)
    )
      requiredText(undefined, binding.path, issues);
  }
  requiredText(data.personal.surname, 'personal.surname', issues);
  requiredText(data.personal.firstName, 'personal.firstName', issues);
  requiredText(data.personal.dateOfBirth, 'personal.dateOfBirth', issues);
  requiredText(data.personal.gender, 'personal.gender', issues);
  requiredText(data.personal.nationality, 'personal.nationality', issues);
  requiredText(data.contact.residentialAddress, 'contact.residentialAddress', issues);
  requiredText(data.guardian.fullName, 'guardian.fullName', issues);
  requiredText(data.guardian.relationship, 'guardian.relationship', issues);
  requiredText(data.guardian.phone, 'guardian.phone', issues);
  requiredText(data.academic.requestedClassLevelCode, 'academic.requestedClassLevelCode', issues);
  if (data.personal.nationality?.trim().toLocaleLowerCase('en-NG') === 'nigerian') {
    requiredText(data.personal.stateOfOrigin, 'personal.stateOfOrigin', issues);
    requiredText(data.personal.lga, 'personal.lga', issues);
  }
  const senior = data.academic.requestedClassLevelCode?.startsWith('SS') === true;
  if (senior) requiredText(data.academic.requestedTrackCode, 'academic.requestedTrackCode', issues);
  if (!senior && data.academic.requestedTrackCode !== undefined)
    issues.push({
      code: 'TRACK_NOT_APPLICABLE',
      message: 'Junior-school registration must not include a senior track.',
      path: 'academic.requestedTrackCode',
    });
  if (!hasPassportPhotograph)
    issues.push({
      code: 'REQUIRED_DOCUMENT',
      message: 'A passport photograph is required.',
      path: 'documents.passportPhotograph',
    });
  const responses = data.customResponses ?? {};
  const enabledCustomFields = customFields.filter(({ enabled }) => enabled);
  const enabledCustomKeys = new Set(enabledCustomFields.map(({ key }) => key));
  for (const key of Object.keys(responses)) {
    if (!enabledCustomKeys.has(key))
      issues.push({
        code: 'FIELD_DISABLED',
        message: 'This custom field is not enabled for this registration form.',
        path: `customResponses.${key}`,
      });
  }
  for (const field of enabledCustomFields) validateCustomField(field, responses[field.key], issues);
  if (issues.length > 0) throw new ValidationError(undefined, { issues });
}

export function assertRegistrationEditable(status: RegistrationStatus): void {
  if (!['DRAFT', 'CHANGES_REQUESTED'].includes(status))
    throw new DomainConflictError('Submitted registration data is read-only in its current state.');
}

export function assertTransition(
  status: RegistrationStatus,
  allowed: readonly RegistrationStatus[],
  action: string,
): void {
  if (!allowed.includes(status))
    throw new DomainConflictError(`The registration cannot be ${action} in its current state.`);
}

export function formatStudentId(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1)
    throw new Error('Student ID sequence must be a positive safe integer.');
  return `ONYX/${String(sequence).padStart(4, '0')}`;
}
