import { describe, expect, it } from 'vitest';

import { applicationModels } from '../src/platform/database/application-models.js';

const expectedModelNames = [
  'AcademicSession',
  'Announcement',
  'AssessmentScheme',
  'Assignment',
  'AssignmentAttachment',
  'AuditLog',
  'AuthSession',
  'ClassLevel',
  'ClassTeacherAssignment',
  'DocumentRequirement',
  'Enrollment',
  'EnrollmentSubjectOverride',
  'GradingScheme',
  'Guardian',
  'Notification',
  'OutboxEvent',
  'Permission',
  'ProfileCorrectionRequest',
  'RegistrationFormConfiguration',
  'ResultBatch',
  'ResultCorrectionRequest',
  'ResultEntry',
  'Role',
  'SchoolSettings',
  'SequenceCounter',
  'Student',
  'StudentDocument',
  'StudentGuardian',
  'StudentMedicalProfile',
  'StudentRegistration',
  'Subject',
  'SubjectChangeRequest',
  'SubjectOffering',
  'Teacher',
  'TeacherInvitation',
  'TeacherRegistration',
  'TeachingAssignment',
  'Term',
  'TermReport',
  'Timetable',
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
