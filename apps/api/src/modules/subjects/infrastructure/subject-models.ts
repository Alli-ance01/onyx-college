import { model, models, Schema, type Model, type Types } from 'mongoose';

export interface SubjectRecord {
  code: string;
  description?: string;
  name: string;
  normalizedName: string;
  status: 'ACTIVE' | 'RETIRED';
  version: number;
}

const subjectSchema = new Schema<SubjectRecord>(
  {
    code: { type: String, required: true, immutable: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ['ACTIVE', 'RETIRED'], required: true, default: 'ACTIVE' },
  },
  { collection: 'subjects', timestamps: true, versionKey: 'version' },
);
subjectSchema.index({ code: 1 }, { name: 'subject_code_unique', unique: true });
subjectSchema.index({ normalizedName: 1 }, { name: 'subject_name_unique', unique: true });
subjectSchema.index({ status: 1, name: 1 }, { name: 'subject_status_name' });

export interface SubjectOfferingRecord {
  academicSessionId: Types.ObjectId;
  classification: 'OPTIONAL' | 'REQUIRED';
  classLevelId: Types.ObjectId;
  normalizedTrackKey: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'PLANNED' | 'RETIRED';
  subjectId: Types.ObjectId;
  trackId?: Types.ObjectId;
  version: number;
}

const subjectOfferingSchema = new Schema<SubjectOfferingRecord>(
  {
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'AcademicSession',
      required: true,
      immutable: true,
    },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, immutable: true },
    classLevelId: {
      type: Schema.Types.ObjectId,
      ref: 'ClassLevel',
      required: true,
      immutable: true,
    },
    trackId: { type: Schema.Types.ObjectId, ref: 'Track', immutable: true },
    normalizedTrackKey: { type: String, required: true, immutable: true },
    classification: {
      type: String,
      enum: ['REQUIRED', 'OPTIONAL'],
      required: true,
    },
    status: {
      type: String,
      enum: ['PLANNED', 'ACTIVE', 'RETIRED', 'ARCHIVED'],
      required: true,
      default: 'ACTIVE',
    },
  },
  { collection: 'subject_offerings', timestamps: true, versionKey: 'version' },
);
subjectOfferingSchema.index(
  { academicSessionId: 1, subjectId: 1, classLevelId: 1, normalizedTrackKey: 1 },
  { name: 'subject_offering_scope_unique', unique: true },
);
subjectOfferingSchema.index(
  { academicSessionId: 1, classLevelId: 1, normalizedTrackKey: 1, status: 1 },
  { name: 'subject_offering_curriculum_lookup' },
);

export interface EnrollmentSubjectOverrideRecord {
  action: 'ADD' | 'REMOVE';
  actorUserId: Types.ObjectId;
  auditCorrelationId: string;
  enrollmentId: Types.ObjectId;
  reason: string;
  revokedAt?: Date;
  revokedByUserId?: Types.ObjectId;
  status: 'ACTIVE' | 'REVOKED';
  subjectId: Types.ObjectId;
  createdAt: Date;
  version: number;
}

const enrollmentSubjectOverrideSchema = new Schema<EnrollmentSubjectOverrideRecord>(
  {
    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Enrollment',
      required: true,
      immutable: true,
    },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, immutable: true },
    action: { type: String, enum: ['ADD', 'REMOVE'], required: true },
    reason: { type: String, required: true, trim: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    auditCorrelationId: { type: String, required: true, immutable: true },
    status: { type: String, enum: ['ACTIVE', 'REVOKED'], required: true, default: 'ACTIVE' },
    revokedAt: { type: Date },
    revokedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { collection: 'enrollment_subject_overrides', timestamps: true, versionKey: 'version' },
);
enrollmentSubjectOverrideSchema.index(
  { enrollmentId: 1, subjectId: 1 },
  { name: 'enrollment_subject_override_unique', unique: true },
);
enrollmentSubjectOverrideSchema.index(
  { enrollmentId: 1, status: 1 },
  { name: 'enrollment_subject_override_lookup' },
);

export const SubjectModel =
  (models.Subject as Model<SubjectRecord> | undefined) ??
  model<SubjectRecord>('Subject', subjectSchema);
export const SubjectOfferingModel =
  (models.SubjectOffering as Model<SubjectOfferingRecord> | undefined) ??
  model<SubjectOfferingRecord>('SubjectOffering', subjectOfferingSchema);
export const EnrollmentSubjectOverrideModel =
  (models.EnrollmentSubjectOverride as Model<EnrollmentSubjectOverrideRecord> | undefined) ??
  model<EnrollmentSubjectOverrideRecord>(
    'EnrollmentSubjectOverride',
    enrollmentSubjectOverrideSchema,
  );
