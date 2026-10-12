export const academicSessionStatuses = ['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED'] as const;
export type AcademicSessionStatus = (typeof academicSessionStatuses)[number];

export const termStatuses = ['PLANNED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;
export type TermStatus = (typeof termStatuses)[number];

export const enrollmentStatuses = [
  'ACTIVE',
  'COMPLETED',
  'REPEATED',
  'WITHDRAWN',
  'TRANSFERRED',
  'GRADUATED',
  'ARCHIVED',
] as const;
export type EnrollmentStatus = (typeof enrollmentStatuses)[number];

export const subjectOfferingClassifications = ['REQUIRED', 'OPTIONAL'] as const;
export type SubjectOfferingClassification = (typeof subjectOfferingClassifications)[number];

export interface TermDto {
  academicSessionId: string;
  id: string;
  name: string;
  ordinal: number;
  status: TermStatus;
  version: number;
}

export interface AcademicSessionDto {
  id: string;
  label: string;
  status: AcademicSessionStatus;
  terms: readonly TermDto[];
  version: number;
}

export interface ClassLevelDto {
  code: string;
  id: string;
  name: string;
  order: number;
  stage: 'JUNIOR' | 'SENIOR';
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface TrackDto {
  code: string;
  id: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface SubjectDto {
  code: string;
  description?: string;
  id: string;
  name: string;
  status: 'ACTIVE' | 'RETIRED';
  version: number;
}

export interface SubjectOfferingDto {
  academicSession: { id: string; label: string };
  classification: SubjectOfferingClassification;
  classLevel: Pick<ClassLevelDto, 'code' | 'id' | 'name' | 'stage'>;
  id: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'PLANNED' | 'RETIRED';
  subject: Pick<SubjectDto, 'code' | 'id' | 'name'>;
  track?: Pick<TrackDto, 'code' | 'id' | 'name'>;
  version: number;
}

export interface EnrollmentDto {
  academicSession: { id: string; label: string };
  classLevel: Pick<ClassLevelDto, 'code' | 'id' | 'name' | 'stage'>;
  enrolledAt: string;
  id: string;
  status: EnrollmentStatus;
  student: { id: string; name: string; studentId: string };
  track?: Pick<TrackDto, 'code' | 'id' | 'name'>;
  version: number;
}

export interface CurriculumSubjectDto {
  classification: SubjectOfferingClassification;
  offeringId: string;
  overrideAction?: 'ADD' | 'REMOVE';
  subject: Pick<SubjectDto, 'code' | 'id' | 'name'>;
}

export interface EnrollmentSubjectOverrideDto {
  action: 'ADD' | 'REMOVE';
  createdAt: string;
  enrollmentId: string;
  id: string;
  reason: string;
  status: 'ACTIVE' | 'REVOKED';
  subject: Pick<SubjectDto, 'code' | 'id' | 'name'>;
}

export interface SubjectChangeRequestDto {
  action: 'ADD' | 'REMOVE';
  createdAt: string;
  decisionReason?: string;
  decidedAt?: string;
  enrollment: Pick<EnrollmentDto, 'id' | 'academicSession' | 'classLevel' | 'student'> & {
    track?: Pick<TrackDto, 'code' | 'id' | 'name'>;
  };
  id: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  subject: Pick<SubjectDto, 'code' | 'id' | 'name'>;
}

export type ProgressionOutcome = 'GRADUATE' | 'PROMOTE' | 'REPEAT' | 'TRANSFER' | 'WITHDRAW';
