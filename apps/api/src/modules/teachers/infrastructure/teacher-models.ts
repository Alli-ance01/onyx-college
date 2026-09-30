import mongoose, { type Model, type Types } from 'mongoose';

const { model, models, Schema } = mongoose;

export interface TeacherRecord {
  approvedAt?: Date;
  approvedByUserId?: Types.ObjectId;
  email?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  phone?: string;
  sourceInvitationId?: Types.ObjectId;
  sourceRegistrationId: Types.ObjectId;
  staffId?: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'INACTIVE' | 'PENDING_APPROVAL' | 'SUSPENDED';
  userId: Types.ObjectId;
  version: number;
}

const teacherSchema = new Schema<TeacherRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    sourceRegistrationId: {
      type: Schema.Types.ObjectId,
      ref: 'TeacherRegistration',
      required: true,
      immutable: true,
    },
    sourceInvitationId: { type: Schema.Types.ObjectId, ref: 'TeacherInvitation', immutable: true },
    staffId: { type: String, trim: true, immutable: true },
    firstName: { type: String, required: true, trim: true },
    middleName: { type: String, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    status: {
      type: String,
      enum: ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'ARCHIVED'],
      required: true,
      default: 'PENDING_APPROVAL',
    },
    approvedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
  },
  { collection: 'teachers', timestamps: true, versionKey: 'version' },
);
teacherSchema.index({ userId: 1 }, { name: 'teacher_user_unique', unique: true });
teacherSchema.index(
  { sourceRegistrationId: 1 },
  { name: 'teacher_registration_unique', unique: true },
);
teacherSchema.index(
  { staffId: 1 },
  {
    name: 'teacher_staff_id_unique_when_present',
    partialFilterExpression: { staffId: { $type: 'string' } },
    unique: true,
  },
);
teacherSchema.index({ status: 1, lastName: 1, firstName: 1 }, { name: 'teacher_directory' });

export interface TeacherInvitationRecord {
  acceptedAt?: Date;
  createdAt: Date;
  email: string;
  expiresAt: Date;
  invitedName: string;
  issuedByUserId: Types.ObjectId;
  resultingTeacherId?: Types.ObjectId;
  resultingUserId?: Types.ObjectId;
  revokedAt?: Date;
  status: 'ACCEPTED' | 'EXPIRED' | 'PENDING' | 'REVOKED';
  tokenHash: string;
  version: number;
}

const teacherInvitationSchema = new Schema<TeacherInvitationRecord>(
  {
    email: { type: String, required: true, trim: true },
    invitedName: { type: String, required: true, trim: true },
    tokenHash: { type: String, required: true, immutable: true, select: false },
    issuedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    expiresAt: { type: Date, required: true, immutable: true },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'],
      required: true,
      default: 'PENDING',
    },
    acceptedAt: { type: Date },
    revokedAt: { type: Date },
    resultingUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    resultingTeacherId: { type: Schema.Types.ObjectId, ref: 'Teacher' },
  },
  { collection: 'teacher_invitations', timestamps: true, versionKey: 'version' },
);
teacherInvitationSchema.index(
  { tokenHash: 1 },
  { name: 'teacher_invitation_token_unique', unique: true },
);
teacherInvitationSchema.index({ email: 1, status: 1 }, { name: 'teacher_invitation_email_status' });
teacherInvitationSchema.index({ expiresAt: 1, status: 1 }, { name: 'teacher_invitation_expiry' });

export interface TeacherRegistrationRecord {
  address?: string;
  firstName: string;
  invitationId?: Types.ObjectId;
  lastName: string;
  middleName?: string;
  phone?: string;
  qualifications?: string;
  reviewedAt?: Date;
  reviewedByUserId?: Types.ObjectId;
  reviewNote?: string;
  resultingTeacherId?: Types.ObjectId;
  status: 'APPROVED' | 'CHANGES_REQUESTED' | 'DRAFT' | 'REJECTED' | 'SUBMITTED' | 'UNDER_REVIEW';
  submittedAt?: Date;
  userId: Types.ObjectId;
  version: number;
}

const teacherRegistrationSchema = new Schema<TeacherRegistrationRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    invitationId: { type: Schema.Types.ObjectId, ref: 'TeacherInvitation', immutable: true },
    firstName: { type: String, required: true, trim: true },
    middleName: { type: String, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    qualifications: { type: String, trim: true },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'],
      required: true,
      default: 'SUBMITTED',
    },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewNote: { type: String },
    resultingTeacherId: { type: Schema.Types.ObjectId, ref: 'Teacher' },
  },
  { collection: 'teacher_registrations', timestamps: true, versionKey: 'version' },
);
teacherRegistrationSchema.index(
  { userId: 1 },
  { name: 'teacher_registration_user_unique', unique: true },
);
teacherRegistrationSchema.index(
  { status: 1, submittedAt: 1 },
  { name: 'teacher_registration_review_queue' },
);

export interface TeachingAssignmentRecord {
  academicSessionId: Types.ObjectId;
  assignedByUserId: Types.ObjectId;
  classLevelId: Types.ObjectId;
  normalizedTrackKey: string;
  revokedAt?: Date;
  revokedByUserId?: Types.ObjectId;
  revocationReason?: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED' | 'PLANNED' | 'REVOKED';
  subjectId: Types.ObjectId;
  teacherId: Types.ObjectId;
  trackId?: Types.ObjectId;
  version: number;
}

const teachingAssignmentSchema = new Schema<TeachingAssignmentRecord>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, immutable: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, immutable: true },
    classLevelId: {
      type: Schema.Types.ObjectId,
      ref: 'ClassLevel',
      required: true,
      immutable: true,
    },
    trackId: { type: Schema.Types.ObjectId, ref: 'Track', immutable: true },
    normalizedTrackKey: { type: String, required: true, immutable: true },
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'AcademicSession',
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ['PLANNED', 'ACTIVE', 'REVOKED', 'COMPLETED', 'ARCHIVED'],
      required: true,
      default: 'ACTIVE',
    },
    assignedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    revokedAt: { type: Date },
    revokedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    revocationReason: { type: String },
  },
  { collection: 'teaching_assignments', timestamps: true, versionKey: 'version' },
);
teachingAssignmentSchema.index(
  {
    teacherId: 1,
    academicSessionId: 1,
    classLevelId: 1,
    normalizedTrackKey: 1,
    subjectId: 1,
  },
  { name: 'teaching_assignment_scope_unique', unique: true },
);
teachingAssignmentSchema.index(
  { academicSessionId: 1, classLevelId: 1, normalizedTrackKey: 1, subjectId: 1, status: 1 },
  { name: 'teaching_assignment_staffing_lookup' },
);

export interface ClassTeacherAssignmentRecord {
  academicSessionId: Types.ObjectId;
  assignedByUserId: Types.ObjectId;
  classLevelId: Types.ObjectId;
  normalizedTrackKey: string;
  revokedAt?: Date;
  revokedByUserId?: Types.ObjectId;
  revocationReason?: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED' | 'PLANNED' | 'REVOKED';
  teacherId: Types.ObjectId;
  trackId?: Types.ObjectId;
  version: number;
}

const classTeacherAssignmentSchema = new Schema<ClassTeacherAssignmentRecord>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, immutable: true },
    classLevelId: {
      type: Schema.Types.ObjectId,
      ref: 'ClassLevel',
      required: true,
      immutable: true,
    },
    trackId: { type: Schema.Types.ObjectId, ref: 'Track', immutable: true },
    normalizedTrackKey: { type: String, required: true, immutable: true },
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'AcademicSession',
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ['PLANNED', 'ACTIVE', 'REVOKED', 'COMPLETED', 'ARCHIVED'],
      required: true,
      default: 'ACTIVE',
    },
    assignedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    revokedAt: { type: Date },
    revokedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    revocationReason: { type: String },
  },
  { collection: 'class_teacher_assignments', timestamps: true, versionKey: 'version' },
);
classTeacherAssignmentSchema.index(
  { academicSessionId: 1, classLevelId: 1, normalizedTrackKey: 1 },
  {
    name: 'one_active_class_teacher_per_scope',
    partialFilterExpression: { status: 'ACTIVE' },
    unique: true,
  },
);
classTeacherAssignmentSchema.index(
  { teacherId: 1, academicSessionId: 1, status: 1 },
  { name: 'class_teacher_assignment_teacher_lookup' },
);

export const TeacherModel =
  (models.Teacher as Model<TeacherRecord> | undefined) ??
  model<TeacherRecord>('Teacher', teacherSchema);
export const TeacherInvitationModel =
  (models.TeacherInvitation as Model<TeacherInvitationRecord> | undefined) ??
  model<TeacherInvitationRecord>('TeacherInvitation', teacherInvitationSchema);
export const TeacherRegistrationModel =
  (models.TeacherRegistration as Model<TeacherRegistrationRecord> | undefined) ??
  model<TeacherRegistrationRecord>('TeacherRegistration', teacherRegistrationSchema);
export const TeachingAssignmentModel =
  (models.TeachingAssignment as Model<TeachingAssignmentRecord> | undefined) ??
  model<TeachingAssignmentRecord>('TeachingAssignment', teachingAssignmentSchema);
export const ClassTeacherAssignmentModel =
  (models.ClassTeacherAssignment as Model<ClassTeacherAssignmentRecord> | undefined) ??
  model<ClassTeacherAssignmentRecord>('ClassTeacherAssignment', classTeacherAssignmentSchema);
