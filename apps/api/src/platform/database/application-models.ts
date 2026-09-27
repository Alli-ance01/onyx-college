import { PermissionModel } from '../../modules/access-control/infrastructure/permission-model.js';
import { RoleModel } from '../../modules/access-control/infrastructure/role-model.js';
import {
  AcademicSessionModel,
  ClassLevelModel,
  SchoolSettingsModel,
  TermModel,
  TrackModel,
} from '../../modules/academics/infrastructure/academic-models.js';
import { AuditLogModel } from '../../modules/audit/infrastructure/audit-log-model.js';
import {
  DocumentRequirementModel,
  StudentDocumentModel,
} from '../../modules/documents/infrastructure/document-models.js';
import { EnrollmentModel } from '../../modules/enrollments/infrastructure/enrollment-model.js';
import {
  GuardianModel,
  StudentGuardianModel,
} from '../../modules/guardians/infrastructure/guardian-models.js';
import { AuthSessionModel } from '../../modules/identity/infrastructure/auth-session-model.js';
import { UserModel } from '../../modules/identity/infrastructure/user-model.js';
import {
  RegistrationFormConfigurationModel,
  StudentRegistrationModel,
} from '../../modules/student-registration/infrastructure/registration-models.js';
import {
  ProfileCorrectionRequestModel,
  StudentMedicalProfileModel,
  StudentModel,
} from '../../modules/students/infrastructure/student-models.js';
import {
  OutboxEventModel,
  SequenceCounterModel,
} from '../../modules/system/infrastructure/system-models.js';

export interface IndexableApplicationModel {
  createIndexes(): Promise<void>;
  readonly modelName: string;
  readonly schema: {
    indexes(): unknown[];
  };
}

/**
 * Explicit registry for release-time index creation.
 *
 * Production startup deliberately disables Mongoose auto-indexing. Any new
 * persisted model must be added here in the same change that introduces it.
 */
export const applicationModels: readonly IndexableApplicationModel[] = [
  AcademicSessionModel,
  AuditLogModel,
  AuthSessionModel,
  ClassLevelModel,
  DocumentRequirementModel,
  EnrollmentModel,
  GuardianModel,
  OutboxEventModel,
  PermissionModel,
  ProfileCorrectionRequestModel,
  RegistrationFormConfigurationModel,
  RoleModel,
  SchoolSettingsModel,
  SequenceCounterModel,
  StudentDocumentModel,
  StudentGuardianModel,
  StudentMedicalProfileModel,
  StudentModel,
  StudentRegistrationModel,
  TermModel,
  TrackModel,
  UserModel,
];
