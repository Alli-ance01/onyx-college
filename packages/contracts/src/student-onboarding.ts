export const registrationStatuses = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
] as const;
export type RegistrationStatus = (typeof registrationStatuses)[number];

export const classLevelCodes = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'] as const;
export type ClassLevelCode = (typeof classLevelCodes)[number];
export const trackCodes = ['SCIENCE', 'ARTS', 'COMMERCIAL'] as const;
export type TrackCode = (typeof trackCodes)[number];
export const studentLifecycleStatuses = [
  'ACTIVE',
  'WITHDRAWN',
  'TRANSFERRED',
  'GRADUATED',
  'ARCHIVED',
] as const;
export type StudentLifecycleStatus = (typeof studentLifecycleStatuses)[number];
export const documentReviewStatuses = ['PENDING_REVIEW', 'VERIFIED', 'REJECTED'] as const;
export type DocumentReviewStatus = (typeof documentReviewStatuses)[number];

export type CustomFieldValue = boolean | number | string | readonly string[];

export interface RegistrationDraftInput {
  academic: { requestedClassLevelCode?: ClassLevelCode; requestedTrackCode?: TrackCode };
  contact: { email?: string; phone?: string; residentialAddress?: string };
  customResponses?: Readonly<Record<string, CustomFieldValue>>;
  guardian: {
    address?: string;
    alternatePhone?: string;
    email?: string;
    emergencyContact?: boolean;
    fullName?: string;
    occupation?: string;
    phone?: string;
    relationship?: string;
  };
  medical: {
    allergies?: string;
    bloodGroup?: string;
    emergencyInstructions?: string;
    genotype?: string;
    medicalConditions?: string;
    medications?: string;
  };
  personal: {
    dateOfBirth?: string;
    firstName?: string;
    gender?: string;
    lga?: string;
    middleName?: string;
    nationality?: string;
    stateOfOrigin?: string;
    surname?: string;
  };
  version: number;
}

export interface RegistrationConfigurationField {
  displayOrder: number;
  enabled: boolean;
  helpText?: string;
  key: string;
  label: string;
  placeholder?: string;
  required: boolean;
  section: string;
}

export interface RegistrationCustomField extends RegistrationConfigurationField {
  displayOrder: number;
  options?: readonly string[];
  type:
    | 'BOOLEAN'
    | 'DATE'
    | 'EMAIL'
    | 'MULTISELECT'
    | 'NUMBER'
    | 'PHONE'
    | 'SELECT'
    | 'TEXT'
    | 'TEXTAREA';
  validation?: {
    earliestDate?: string;
    latestDate?: string;
    maximum?: number;
    maximumLength?: number;
    minimum?: number;
    minimumLength?: number;
  };
}

export interface RegistrationConfigurationDto {
  canonicalFields: readonly RegistrationConfigurationField[];
  customFields: readonly RegistrationCustomField[];
  id: string;
  publishedAt: string;
  versionNumber: number;
}

export interface StudentDocumentDto {
  createdAt: string;
  displayName: string;
  documentRequirementId: string;
  id: string;
  mimeType: string;
  reviewNote?: string;
  reviewStatus: DocumentReviewStatus;
  sizeBytes: number;
  version: number;
}

export type StudentDocumentAccessDto =
  { delivery: 'PROXY' } | { delivery: 'SIGNED'; expiresAt: string; url: string };

export interface RegistrationDto {
  allowedCorrectionFields: readonly string[];
  approvedStudentId?: string;
  configuration: RegistrationConfigurationDto;
  createdAt: string;
  data: Omit<RegistrationDraftInput, 'version'>;
  decisionReason?: string;
  documents: readonly StudentDocumentDto[];
  duplicateReview: {
    candidates: readonly {
      confidence: 'FUZZY' | 'STRONG';
      matchedRegistrationId?: string;
      matchedStudentId?: string;
      status: string;
    }[];
    resolution?: 'CONFIRMED_DISTINCT' | 'DUPLICATE_REJECTED' | 'ORIGINAL_REOPENED';
    requiresReview: boolean;
  };
  id: string;
  reviewHistory: readonly { action: string; at: string; note?: string }[];
  status: RegistrationStatus;
  submittedAt?: string;
  updatedAt: string;
  version: number;
}

export interface AcademicOptionDto {
  code: string;
  id: string;
  name: string;
  stage?: 'JUNIOR' | 'SENIOR';
}

export interface AcademicSetupDto {
  activeSession?: { id: string; label: string };
  activeTerm?: { id: string; name: string; ordinal: number };
  classLevels: readonly AcademicOptionDto[];
  tracks: readonly AcademicOptionDto[];
}

export interface StudentDashboardDto {
  currentEnrollment?: {
    classLevel: AcademicOptionDto;
    session: { id: string; label: string };
    track?: AcademicOptionDto;
  };
  currentTerm?: { id: string; name: string };
  lifecycleStatus: StudentLifecycleStatus;
  passportDocumentId?: string;
  studentId: string;
  studentName: string;
}

export interface ProfileCorrectionRequestDto {
  createdAt: string;
  field: string;
  id: string;
  reason: string;
  requestedValue: string;
  reviewReason?: string;
  status: 'APPROVED' | 'REJECTED' | 'SUBMITTED' | 'UNDER_REVIEW';
}

export interface StudentProfileDto extends StudentDashboardDto {
  academicHistory: readonly {
    classLevel: AcademicOptionDto;
    id: string;
    session: { id: string; label: string };
    status: string;
    track?: AcademicOptionDto;
  }[];
  biodata: {
    dateOfBirth: string;
    firstName: string;
    gender: string;
    lga?: string;
    middleName?: string;
    nationality: string;
    residentialAddress: string;
    stateOfOrigin?: string;
    surname: string;
  };
  correctionRequests: readonly ProfileCorrectionRequestDto[];
  documents: readonly StudentDocumentDto[];
  guardians: readonly {
    emergencyContact: boolean;
    fullName: string;
    phone: string;
    primary: boolean;
    relationship: string;
  }[];
  medical?: Readonly<Record<string, string>>;
}

export interface StudentDirectoryItemDto {
  classLevel?: string;
  gender: string;
  id: string;
  lifecycleStatus: StudentLifecycleStatus;
  name: string;
  studentId: string;
  track?: string;
}
