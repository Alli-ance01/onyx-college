import { describe, expect, it } from 'vitest';

import { applicationModels } from '../src/platform/database/application-models.js';

const expectedModelNames = [
  'AcademicSession',
  'AuditLog',
  'AuthSession',
  'ClassLevel',
  'DocumentRequirement',
  'Enrollment',
  'Guardian',
  'OutboxEvent',
  'Permission',
  'ProfileCorrectionRequest',
  'RegistrationFormConfiguration',
  'Role',
  'SchoolSettings',
  'SequenceCounter',
  'Student',
  'StudentDocument',
  'StudentGuardian',
  'StudentMedicalProfile',
  'StudentRegistration',
  'Term',
  'Track',
  'User',
];

describe('application model index registry', () => {
  it('contains every current persisted model exactly once', () => {
    const names = applicationModels.map((model) => model.modelName).sort();

    expect(names).toEqual(expectedModelNames);
    expect(new Set(names).size).toBe(names.length);
  });

  it('requires each registered model to declare at least one release-managed index', () => {
    for (const model of applicationModels) {
      expect(model.schema.indexes(), model.modelName).not.toHaveLength(0);
    }
  });
});
