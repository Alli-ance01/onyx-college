import { model, models, Schema, type Model, type Types } from 'mongoose';

export interface AssessmentComponentRecord {
  key: string;
  label: string;
  maximumHundredths: number;
}

const assessmentComponentSchema = new Schema<AssessmentComponentRecord>(
  {
    key: { type: String, required: true, trim: true, immutable: true },
    label: { type: String, required: true, trim: true, immutable: true },
    maximumHundredths: { type: Number, required: true, min: 1, immutable: true },
  },
  { _id: false },
);

export interface AssessmentSchemeRecord {
  academicSessionId: Types.ObjectId;
  code: string;
  components: AssessmentComponentRecord[];
  createdAt: Date;
  createdByUserId: Types.ObjectId;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT' | 'RETIRED';
  totalMaximumHundredths: number;
  updatedAt: Date;
  version: number;
  versionNumber: number;
}

const assessmentSchemeSchema = new Schema<AssessmentSchemeRecord>(
  {
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'AcademicSession',
      required: true,
      immutable: true,
    },
    code: { type: String, required: true, trim: true, uppercase: true, immutable: true },
    name: { type: String, required: true, trim: true },
    versionNumber: { type: Number, required: true, min: 1, immutable: true },
    components: {
      type: [assessmentComponentSchema],
      required: true,
      immutable: true,
    },
    totalMaximumHundredths: { type: Number, required: true, min: 1, immutable: true },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'RETIRED', 'ARCHIVED'],
      required: true,
      default: 'DRAFT',
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
  },
  { collection: 'assessment_schemes', timestamps: true, versionKey: 'version' },
);
assessmentSchemeSchema.index(
  { academicSessionId: 1, code: 1, versionNumber: 1 },
  { name: 'assessment_scheme_version_unique', unique: true },
);
assessmentSchemeSchema.index(
  { academicSessionId: 1, code: 1, status: 1 },
  {
    name: 'assessment_scheme_one_active_version',
    partialFilterExpression: { status: 'ACTIVE' },
    unique: true,
  },
);

export interface GradeBandRecord {
  grade: string;
  maximumPercentageHundredths: number;
  minimumPercentageHundredths: number;
  remark?: string;
}

const gradeBandSchema = new Schema<GradeBandRecord>(
  {
    grade: { type: String, required: true, trim: true, immutable: true },
    minimumPercentageHundredths: { type: Number, required: true, min: 0, immutable: true },
    maximumPercentageHundredths: {
      type: Number,
      required: true,
      min: 0,
      max: 10_000,
      immutable: true,
    },
    remark: { type: String, trim: true, immutable: true },
  },
  { _id: false },
);

export interface GradingSchemeRecord {
  academicSessionId: Types.ObjectId;
  bands: GradeBandRecord[];
  code: string;
  createdAt: Date;
  createdByUserId: Types.ObjectId;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT' | 'RETIRED';
  updatedAt: Date;
  version: number;
  versionNumber: number;
}

const gradingSchemeSchema = new Schema<GradingSchemeRecord>(
  {
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'AcademicSession',
      required: true,
      immutable: true,
    },
    code: { type: String, required: true, trim: true, uppercase: true, immutable: true },
    name: { type: String, required: true, trim: true },
    versionNumber: { type: Number, required: true, min: 1, immutable: true },
    bands: { type: [gradeBandSchema], required: true, immutable: true },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'RETIRED', 'ARCHIVED'],
      required: true,
      default: 'DRAFT',
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
  },
  { collection: 'grading_schemes', timestamps: true, versionKey: 'version' },
);
gradingSchemeSchema.index(
  { academicSessionId: 1, code: 1, versionNumber: 1 },
  { name: 'grading_scheme_version_unique', unique: true },
);
gradingSchemeSchema.index(
  { academicSessionId: 1, code: 1, status: 1 },
  {
    name: 'grading_scheme_one_active_version',
    partialFilterExpression: { status: 'ACTIVE' },
    unique: true,
  },
);

export interface ResultTransitionRecord {
  actorUserId: Types.ObjectId;
  at: Date;
  from: string;
  note?: string;
  to: string;
}

const resultTransitionSchema = new Schema<ResultTransitionRecord>(
  {
    from: { type: String, required: true, immutable: true },
    to: { type: String, required: true, immutable: true },
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    at: { type: Date, required: true, immutable: true },
    note: { type: String, trim: true, immutable: true },
  },
  { _id: false },
);

export type ResultBatchStatus =
  'APPROVED' | 'DRAFT' | 'PUBLISHED' | 'RETURNED_FOR_CORRECTION' | 'SUBMITTED' | 'UNDER_REVIEW';

export interface ResultBatchRecord {
  academicSessionId: Types.ObjectId;
  approvedAt?: Date;
  approvedByUserId?: Types.ObjectId;
  assessmentSchemeId: Types.ObjectId;
  classLevelId: Types.ObjectId;
  createdAt: Date;
  dataEntryActorUserIds: Types.ObjectId[];
  gradingSchemeId: Types.ObjectId;
  normalizedTrackKey: string;
  publishedAt?: Date;
  publishedByUserId?: Types.ObjectId;
  returnedAt?: Date;
  returnedByUserId?: Types.ObjectId;
  reviewNote?: string;
  reviewedAt?: Date;
  reviewedByUserId?: Types.ObjectId;
  status: ResultBatchStatus;
  subjectId: Types.ObjectId;
  submittedAt?: Date;
  submittedByUserId?: Types.ObjectId;
  teacherId: Types.ObjectId;
  teachingAssignmentId: Types.ObjectId;
  termId: Types.ObjectId;
  trackId?: Types.ObjectId;
  transitionHistory: ResultTransitionRecord[];
  updatedAt: Date;
  version: number;
  workflowRevision: number;
}

const resultBatchSchema = new Schema<ResultBatchRecord>(
  {
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'AcademicSession',
      required: true,
      immutable: true,
    },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true, immutable: true },
    classLevelId: {
      type: Schema.Types.ObjectId,
      ref: 'ClassLevel',
      required: true,
      immutable: true,
    },
    trackId: { type: Schema.Types.ObjectId, ref: 'Track', immutable: true },
    normalizedTrackKey: { type: String, required: true, immutable: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, immutable: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, immutable: true },
    teachingAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'TeachingAssignment',
      required: true,
      immutable: true,
    },
    assessmentSchemeId: {
      type: Schema.Types.ObjectId,
      ref: 'AssessmentScheme',
      required: true,
      immutable: true,
    },
    gradingSchemeId: {
      type: Schema.Types.ObjectId,
      ref: 'GradingScheme',
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: [
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'RETURNED_FOR_CORRECTION',
        'APPROVED',
        'PUBLISHED',
      ],
      required: true,
      default: 'DRAFT',
    },
    dataEntryActorUserIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      default: [],
    },
    submittedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    submittedAt: { type: Date },
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true },
    returnedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    returnedAt: { type: Date },
    approvedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    publishedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    publishedAt: { type: Date },
    workflowRevision: { type: Number, required: true, min: 0, default: 0 },
    transitionHistory: { type: [resultTransitionSchema], required: true, default: [] },
  },
  { collection: 'result_batches', timestamps: true, versionKey: 'version' },
);
resultBatchSchema.index(
  { academicSessionId: 1, termId: 1, classLevelId: 1, normalizedTrackKey: 1, subjectId: 1 },
  { name: 'result_batch_context_unique', unique: true },
);
resultBatchSchema.index({ status: 1, updatedAt: 1 }, { name: 'result_batch_workflow_queue' });
resultBatchSchema.index(
  { teacherId: 1, academicSessionId: 1, status: 1 },
  { name: 'result_batch_teacher_session' },
);

export interface ResultComponentRecord {
  key: string;
  scoreHundredths?: number;
  state: 'ABSENT' | 'SCORED';
}

const resultComponentSchema = new Schema<ResultComponentRecord>(
  {
    key: { type: String, required: true, immutable: true },
    state: { type: String, enum: ['SCORED', 'ABSENT'], required: true },
    scoreHundredths: { type: Number, min: 0 },
  },
  { _id: false },
);

export interface ResultEntryRecord {
  components: ResultComponentRecord[];
  correctionRevision: number;
  createdAt: Date;
  enteredByUserIds: Types.ObjectId[];
  enrollmentId: Types.ObjectId;
  exempt: boolean;
  exemptAuthorizedAt?: Date;
  exemptAuthorizedByUserId?: Types.ObjectId;
  grade?: string;
  lastEnteredAt?: Date;
  lastEnteredByUserId?: Types.ObjectId;
  percentageDisplay?: string;
  percentageExact?: string;
  resultBatchId: Types.ObjectId;
  studentId: Types.ObjectId;
  subjectMaximumHundredths?: number;
  totalHundredths?: number;
  updatedAt: Date;
  validationState: 'COMPLETE' | 'INCOMPLETE';
  version: number;
}

const resultEntrySchema = new Schema<ResultEntryRecord>(
  {
    resultBatchId: {
      type: Schema.Types.ObjectId,
      ref: 'ResultBatch',
      required: true,
      immutable: true,
    },
    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Enrollment',
      required: true,
      immutable: true,
    },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true },
    components: { type: [resultComponentSchema], required: true, default: [] },
    exempt: { type: Boolean, required: true, default: false },
    exemptAuthorizedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    exemptAuthorizedAt: { type: Date },
    subjectMaximumHundredths: { type: Number, min: 1 },
    totalHundredths: { type: Number, min: 0 },
    percentageExact: { type: String },
    percentageDisplay: { type: String },
    grade: { type: String },
    validationState: {
      type: String,
      enum: ['INCOMPLETE', 'COMPLETE'],
      required: true,
      default: 'INCOMPLETE',
    },
    enteredByUserIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      default: [],
    },
    lastEnteredByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    lastEnteredAt: { type: Date },
    correctionRevision: { type: Number, required: true, min: 0, default: 0 },
  },
  { collection: 'result_entries', timestamps: true, versionKey: 'version' },
);
resultEntrySchema.index(
  { resultBatchId: 1, enrollmentId: 1 },
  { name: 'result_entry_batch_enrollment_unique', unique: true },
);
resultEntrySchema.index({ studentId: 1, resultBatchId: 1 }, { name: 'result_entry_student_batch' });
resultEntrySchema.index(
  { resultBatchId: 1, validationState: 1 },
  { name: 'result_entry_batch_validation' },
);

export interface ReportComponentSnapshotRecord {
  key: string;
  label: string;
  maximumHundredths: number;
  scoreHundredths?: number;
  state?: 'ABSENT' | 'SCORED';
}

const reportComponentSnapshotSchema = new Schema<ReportComponentSnapshotRecord>(
  {
    key: { type: String, required: true, immutable: true },
    label: { type: String, required: true, immutable: true },
    maximumHundredths: { type: Number, required: true, immutable: true },
    state: { type: String, enum: ['SCORED', 'ABSENT'], immutable: true },
    scoreHundredths: { type: Number, min: 0, immutable: true },
  },
  { _id: false },
);

export interface ReportSubjectSnapshotRecord {
  assessmentSchemeCode: string;
  assessmentSchemeVersion: number;
  components: ReportComponentSnapshotRecord[];
  exempt: boolean;
  grade?: string;
  gradingSchemeCode: string;
  gradingSchemeVersion: number;
  percentageDisplay?: string;
  percentageExact?: string;
  resultBatchId: Types.ObjectId;
  resultEntryId: Types.ObjectId;
  subjectCode: string;
  subjectId: Types.ObjectId;
  subjectMaximumHundredths?: number;
  subjectName: string;
  totalHundredths?: number;
}

const reportSubjectSnapshotSchema = new Schema<ReportSubjectSnapshotRecord>(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, immutable: true },
    subjectCode: { type: String, required: true, immutable: true },
    subjectName: { type: String, required: true, immutable: true },
    resultBatchId: {
      type: Schema.Types.ObjectId,
      ref: 'ResultBatch',
      required: true,
      immutable: true,
    },
    resultEntryId: {
      type: Schema.Types.ObjectId,
      ref: 'ResultEntry',
      required: true,
      immutable: true,
    },
    assessmentSchemeCode: { type: String, required: true, immutable: true },
    assessmentSchemeVersion: { type: Number, required: true, immutable: true },
    gradingSchemeCode: { type: String, required: true, immutable: true },
    gradingSchemeVersion: { type: Number, required: true, immutable: true },
    components: { type: [reportComponentSnapshotSchema], required: true, immutable: true },
    exempt: { type: Boolean, required: true, immutable: true },
    subjectMaximumHundredths: { type: Number, min: 1, immutable: true },
    totalHundredths: { type: Number, min: 0, immutable: true },
    percentageExact: { type: String, immutable: true },
    percentageDisplay: { type: String, immutable: true },
    grade: { type: String, immutable: true },
  },
  { _id: false },
);

export interface TermReportRecord {
  academicSessionId: Types.ObjectId;
  classLevelId: Types.ObjectId;
  classLevelName: string;
  classPosition?: number;
  classPositionCohortSize?: number;
  classTeacherRemark?: string;
  createdAt: Date;
  current: boolean;
  eligibleSubjectCount: number;
  enrollmentId: Types.ObjectId;
  overallAverageExact: string;
  overallAverageRounded: string;
  principalRemark?: string;
  publicationVersion: number;
  publishedAt?: Date;
  publishedByUserId?: Types.ObjectId;
  schoolName: string;
  sessionLabel: string;
  status: 'INCOMPLETE' | 'PUBLISHED' | 'SUPERSEDED';
  studentDisplayName: string;
  studentId: Types.ObjectId;
  studentIdentifier: string;
  subjects: ReportSubjectSnapshotRecord[];
  termId: Types.ObjectId;
  termName: string;
  trackId?: Types.ObjectId;
  trackName?: string;
  updatedAt: Date;
  version: number;
}

const termReportSchema = new Schema<TermReportRecord>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true },
    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Enrollment',
      required: true,
      immutable: true,
    },
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'AcademicSession',
      required: true,
      immutable: true,
    },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true, immutable: true },
    classLevelId: {
      type: Schema.Types.ObjectId,
      ref: 'ClassLevel',
      required: true,
      immutable: true,
    },
    trackId: { type: Schema.Types.ObjectId, ref: 'Track', immutable: true },
    publicationVersion: { type: Number, required: true, min: 0, immutable: true },
    current: { type: Boolean, required: true, default: false },
    status: {
      type: String,
      enum: ['INCOMPLETE', 'PUBLISHED', 'SUPERSEDED'],
      required: true,
      default: 'INCOMPLETE',
    },
    schoolName: { type: String, required: true, immutable: true },
    studentDisplayName: { type: String, required: true, immutable: true },
    studentIdentifier: { type: String, required: true, immutable: true },
    sessionLabel: { type: String, required: true, immutable: true },
    termName: { type: String, required: true, immutable: true },
    classLevelName: { type: String, required: true, immutable: true },
    trackName: { type: String, immutable: true },
    subjects: { type: [reportSubjectSnapshotSchema], required: true, immutable: true },
    eligibleSubjectCount: { type: Number, required: true, min: 0, immutable: true },
    overallAverageExact: { type: String, required: true, immutable: true },
    overallAverageRounded: { type: String, required: true, immutable: true },
    classPosition: { type: Number, min: 1, immutable: true },
    classPositionCohortSize: { type: Number, min: 1, immutable: true },
    classTeacherRemark: { type: String, trim: true, immutable: true },
    principalRemark: { type: String, trim: true, immutable: true },
    publishedByUserId: { type: Schema.Types.ObjectId, ref: 'User', immutable: true },
    publishedAt: { type: Date, immutable: true },
  },
  { collection: 'term_reports', timestamps: true, versionKey: 'version' },
);
termReportSchema.index(
  { enrollmentId: 1, termId: 1, publicationVersion: 1 },
  { name: 'term_report_publication_version_unique', unique: true },
);
termReportSchema.index(
  { enrollmentId: 1, termId: 1, current: 1 },
  {
    name: 'term_report_one_current_publication',
    partialFilterExpression: { current: true },
    unique: true,
  },
);
termReportSchema.index(
  { studentId: 1, status: 1, publishedAt: -1 },
  { name: 'term_report_student_publication' },
);
termReportSchema.index(
  { academicSessionId: 1, termId: 1, classLevelId: 1, trackId: 1, status: 1 },
  { name: 'term_report_cohort' },
);

export interface ResultCorrectionSnapshotRecord {
  components: ResultComponentRecord[];
  exempt: boolean;
  grade?: string;
  percentageDisplay?: string;
  percentageExact?: string;
  subjectMaximumHundredths?: number;
  totalHundredths?: number;
}

const resultCorrectionSnapshotSchema = new Schema<ResultCorrectionSnapshotRecord>(
  {
    components: { type: [resultComponentSchema], required: true, immutable: true },
    exempt: { type: Boolean, required: true, immutable: true },
    subjectMaximumHundredths: { type: Number, min: 1, immutable: true },
    totalHundredths: { type: Number, min: 0, immutable: true },
    percentageExact: { type: String, immutable: true },
    percentageDisplay: { type: String, immutable: true },
    grade: { type: String, immutable: true },
  },
  { _id: false },
);

export type ResultCorrectionStatus =
  'APPLIED' | 'APPROVED' | 'REJECTED' | 'SUBMITTED' | 'UNDER_REVIEW';

export interface ResultCorrectionRequestRecord {
  appliedAt?: Date;
  appliedByUserId?: Types.ObjectId;
  appliedReportId?: Types.ObjectId;
  approvedAt?: Date;
  approvedByUserId?: Types.ObjectId;
  auditCorrelationId: string;
  createdAt: Date;
  existingValue: ResultCorrectionSnapshotRecord;
  proposedValue: ResultCorrectionSnapshotRecord;
  reason: string;
  rejectedAt?: Date;
  rejectedByUserId?: Types.ObjectId;
  requestId?: string;
  requestedByUserId: Types.ObjectId;
  resultBatchId: Types.ObjectId;
  resultEntryId: Types.ObjectId;
  reviewNote?: string;
  reviewedAt?: Date;
  reviewedByUserId?: Types.ObjectId;
  status: ResultCorrectionStatus;
  termReportId?: Types.ObjectId;
  updatedAt: Date;
  version: number;
}

const resultCorrectionRequestSchema = new Schema<ResultCorrectionRequestRecord>(
  {
    resultBatchId: {
      type: Schema.Types.ObjectId,
      ref: 'ResultBatch',
      required: true,
      immutable: true,
    },
    resultEntryId: {
      type: Schema.Types.ObjectId,
      ref: 'ResultEntry',
      required: true,
      immutable: true,
    },
    termReportId: { type: Schema.Types.ObjectId, ref: 'TermReport', immutable: true },
    requestedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    existingValue: { type: resultCorrectionSnapshotSchema, required: true, immutable: true },
    proposedValue: { type: resultCorrectionSnapshotSchema, required: true, immutable: true },
    reason: { type: String, required: true, trim: true, immutable: true },
    auditCorrelationId: { type: String, required: true, immutable: true },
    status: {
      type: String,
      enum: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'APPLIED'],
      required: true,
      default: 'SUBMITTED',
    },
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true },
    approvedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    appliedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    appliedAt: { type: Date },
    appliedReportId: { type: Schema.Types.ObjectId, ref: 'TermReport' },
  },
  { collection: 'result_correction_requests', timestamps: true, versionKey: 'version' },
);
resultCorrectionRequestSchema.index(
  { resultEntryId: 1, status: 1 },
  { name: 'result_correction_entry_status' },
);
resultCorrectionRequestSchema.index(
  { status: 1, createdAt: 1 },
  { name: 'result_correction_review_queue' },
);
resultCorrectionRequestSchema.index(
  { requestedByUserId: 1, createdAt: -1 },
  { name: 'result_correction_requester_time' },
);

export const AssessmentSchemeModel =
  (models.AssessmentScheme as Model<AssessmentSchemeRecord> | undefined) ??
  model<AssessmentSchemeRecord>('AssessmentScheme', assessmentSchemeSchema);
export const GradingSchemeModel =
  (models.GradingScheme as Model<GradingSchemeRecord> | undefined) ??
  model<GradingSchemeRecord>('GradingScheme', gradingSchemeSchema);
export const ResultBatchModel =
  (models.ResultBatch as Model<ResultBatchRecord> | undefined) ??
  model<ResultBatchRecord>('ResultBatch', resultBatchSchema);
export const ResultEntryModel =
  (models.ResultEntry as Model<ResultEntryRecord> | undefined) ??
  model<ResultEntryRecord>('ResultEntry', resultEntrySchema);
export const TermReportModel =
  (models.TermReport as Model<TermReportRecord> | undefined) ??
  model<TermReportRecord>('TermReport', termReportSchema);
export const ResultCorrectionRequestModel =
  (models.ResultCorrectionRequest as Model<ResultCorrectionRequestRecord> | undefined) ??
  model<ResultCorrectionRequestRecord>('ResultCorrectionRequest', resultCorrectionRequestSchema);
