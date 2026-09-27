import type { RegistrationConfigurationField } from '@onyx/contracts';

import {
  ClassLevelModel,
  SchoolSettingsModel,
  TrackModel,
} from '../../academics/infrastructure/academic-models.js';
import { DocumentRequirementModel } from '../../documents/infrastructure/document-models.js';
import { RegistrationFormConfigurationModel } from '../infrastructure/registration-models.js';

const fieldDefinitions: readonly (readonly [string, string, string, boolean])[] = [
  ['surname', 'Surname', 'personal', true],
  ['firstName', 'First name', 'personal', true],
  ['middleName', 'Middle name', 'personal', false],
  ['dateOfBirth', 'Date of birth', 'personal', true],
  ['gender', 'Gender', 'personal', true],
  ['nationality', 'Nationality', 'personal', true],
  ['stateOfOrigin', 'State of origin', 'personal', false],
  ['lga', 'Local government area', 'personal', false],
  ['studentPhone', 'Student phone', 'contact', false],
  ['studentEmail', 'Student email', 'contact', false],
  ['residentialAddress', 'Residential address', 'contact', true],
  ['guardianName', 'Primary guardian name', 'guardian', true],
  ['guardianRelationship', 'Guardian relationship', 'guardian', true],
  ['guardianPhone', 'Guardian phone', 'guardian', true],
  ['guardianAlternatePhone', 'Guardian alternate phone', 'guardian', false],
  ['guardianEmail', 'Guardian email', 'guardian', false],
  ['guardianOccupation', 'Guardian occupation', 'guardian', false],
  ['guardianAddress', 'Guardian address', 'guardian', false],
  ['requestedClass', 'Requested class', 'academic', true],
  ['seniorTrack', 'Senior track', 'academic', false],
  ['bloodGroup', 'Blood group', 'medical', false],
  ['genotype', 'Genotype', 'medical', false],
  ['allergies', 'Allergies', 'medical', false],
  ['medicalConditions', 'Medical conditions', 'medical', false],
  ['medications', 'Medications', 'medical', false],
  ['emergencyInstructions', 'Emergency instructions', 'medical', false],
  ['passportPhotograph', 'Passport photograph', 'documents', true],
];

const canonicalFields: (RegistrationConfigurationField & { displayOrder: number })[] =
  fieldDefinitions.map(([key, label, section, required], displayOrder) => ({
    displayOrder,
    enabled: true,
    key,
    label,
    required,
    section,
  }));
const classLevels = [
  { code: 'JSS1', name: 'JSS1', order: 1, stage: 'JUNIOR' },
  { code: 'JSS2', name: 'JSS2', order: 2, stage: 'JUNIOR' },
  { code: 'JSS3', name: 'JSS3', order: 3, stage: 'JUNIOR' },
  { code: 'SS1', name: 'SS1', order: 4, stage: 'SENIOR' },
  { code: 'SS2', name: 'SS2', order: 5, stage: 'SENIOR' },
  { code: 'SS3', name: 'SS3', order: 6, stage: 'SENIOR' },
] as const;
const tracks = [
  { code: 'SCIENCE', name: 'Science' },
  { code: 'ARTS', name: 'Arts' },
  { code: 'COMMERCIAL', name: 'Commercial' },
] as const;

export async function ensureStudentOnboardingReferenceData(): Promise<void> {
  await Promise.all([
    ...classLevels.map((level) =>
      ClassLevelModel.updateOne(
        { code: level.code },
        { $setOnInsert: { ...level, status: 'ACTIVE' } },
        { upsert: true },
      ),
    ),
    ...tracks.map((track) =>
      TrackModel.updateOne(
        { code: track.code },
        { $setOnInsert: { ...track, status: 'ACTIVE' } },
        { upsert: true },
      ),
    ),
    DocumentRequirementModel.updateOne(
      { code: 'PASSPORT_PHOTOGRAPH' },
      {
        $setOnInsert: {
          acceptedMimeTypes: ['image/jpeg', 'image/png'],
          active: true,
          code: 'PASSPORT_PHOTOGRAPH',
          description: 'A recent, clear passport-style photograph.',
          label: 'Passport photograph',
          maximumBytes: 5_242_880,
          requiredForRegistration: true,
        },
      },
      { upsert: true },
    ),
    SchoolSettingsModel.updateOne(
      { singletonKey: 'SCHOOL' },
      { $setOnInsert: { singletonKey: 'SCHOOL' } },
      { upsert: true },
    ),
  ]);
  let configuration = await RegistrationFormConfigurationModel.findOne({ status: 'ACTIVE' });
  if (configuration === null) {
    try {
      configuration = await RegistrationFormConfigurationModel.create({
        canonicalFields,
        customFields: [],
        publishedAt: new Date(),
        status: 'ACTIVE',
        versionNumber: 1,
      });
    } catch (error) {
      const duplicateKey =
        typeof error === 'object' && error !== null && 'code' in error && error.code === 11_000;
      if (!duplicateKey) throw error;
      configuration = await RegistrationFormConfigurationModel.findOne({ status: 'ACTIVE' });
      if (configuration === null) throw error;
    }
  }
  await SchoolSettingsModel.updateOne(
    { singletonKey: 'SCHOOL' },
    { $set: { currentRegistrationConfigurationId: configuration._id } },
  );
}
