export const resultBatchStatuses = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'RETURNED_FOR_CORRECTION',
  'APPROVED',
  'PUBLISHED',
] as const;
export type ResultBatchStatus = (typeof resultBatchStatuses)[number];

export interface AssessmentComponentDto {
  key: string;
  label: string;
  maximum: string;
}

export interface AssessmentSchemeDto {
  academicSessionId: string;
  code: string;
  components: readonly AssessmentComponentDto[];
  id: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT' | 'RETIRED';
  totalMaximum: string;
  versionNumber: number;
}

export interface GradeBandDto {
  grade: string;
  maximumPercentage: string;
  minimumPercentage: string;
  remark?: string;
}

export interface GradingSchemeDto {
  academicSessionId: string;
  bands: readonly GradeBandDto[];
  code: string;
  id: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT' | 'RETIRED';
  versionNumber: number;
}

export interface ResultComponentDto {
  key: string;
  score?: string;
  state: 'ABSENT' | 'SCORED';
}

export interface ResultEntryDto {
  components: readonly ResultComponentDto[];
  enrollmentId: string;
  exempt: boolean;
  grade?: string;
  id: string;
  percentage?: string;
  student: { id: string; name: string; studentId: string };
  total?: string;
}

export interface ResultBatchDto {
  academicSession: { id: string; label: string };
  assessmentScheme: AssessmentSchemeDto;
  classLevel: { code: string; id: string; name: string };
  entries: readonly ResultEntryDto[];
  gradingScheme: GradingSchemeDto;
  id: string;
  status: ResultBatchStatus;
  subject: { code: string; id: string; name: string };
  teacher: { id: string; name: string };
  term: { id: string; name: string; ordinal: number };
  track?: { code: string; id: string; name: string };
  transitionNote?: string;
  version: number;
}

export interface TermReportSubjectDto {
  components: readonly (AssessmentComponentDto & {
    score?: string;
    state?: 'ABSENT' | 'SCORED';
  })[];
  exempt: boolean;
  grade?: string;
  percentage?: string;
  subjectCode: string;
  subjectName: string;
  total?: string;
}

export interface TermReportDto {
  classLevel: string;
  classPosition?: number;
  id: string;
  overallAverage: string;
  publishedAt: string;
  schoolName: string;
  sessionLabel: string;
  studentId: string;
  studentName: string;
  subjects: readonly TermReportSubjectDto[];
  termName: string;
  track?: string;
  versionNumber: number;
}

export interface ResultCorrectionRequestDto {
  createdAt: string;
  id: string;
  proposedComponents: readonly ResultComponentDto[];
  reason: string;
  resultEntryId: string;
  status: 'APPLIED' | 'APPROVED' | 'REJECTED' | 'SUBMITTED' | 'UNDER_REVIEW';
}
