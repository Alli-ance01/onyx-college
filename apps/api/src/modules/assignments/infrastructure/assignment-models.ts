import mongoose, { type Model, type Types } from 'mongoose';

const { model, models, Schema } = mongoose;

export interface AssignmentRecord {
  academicSessionId: Types.ObjectId;
  classLevelId: Types.ObjectId;
  createdByUserId: Types.ObjectId;
  dueAt: Date;
  instructions: string;
  publishedAt?: Date;
  status: 'ARCHIVED' | 'DRAFT' | 'PUBLISHED';
  subjectId: Types.ObjectId;
  teacherId: Types.ObjectId;
  teachingAssignmentId: Types.ObjectId;
  title: string;
  trackId?: Types.ObjectId;
  createdAt: Date;
  version: number;
}

const assignmentSchema = new Schema<AssignmentRecord>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, immutable: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    teachingAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'TeachingAssignment',
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
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'AcademicSession',
      required: true,
      immutable: true,
    },
    title: { type: String, required: true, trim: true },
    instructions: { type: String, required: true, trim: true },
    dueAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
      required: true,
      default: 'DRAFT',
    },
    publishedAt: { type: Date },
  },
  { collection: 'assignments', timestamps: true, versionKey: 'version' },
);
assignmentSchema.index(
  { academicSessionId: 1, classLevelId: 1, trackId: 1, status: 1, publishedAt: -1 },
  { name: 'assignment_audience_publication' },
);
assignmentSchema.index({ teacherId: 1, status: 1, dueAt: 1 }, { name: 'assignment_teacher_due' });

export interface AssignmentAttachmentRecord {
  assignmentId: Types.ObjectId;
  checksumSha256: string;
  displayName: string;
  mimeType: string;
  provider: 'CLOUDINARY' | 'LOCAL';
  providerAssetId?: string;
  providerDeliveryType: 'authenticated' | 'local';
  providerFormat: string;
  providerPublicId: string;
  providerResourceType: 'image' | 'raw';
  providerVersion?: number;
  sizeBytes: number;
  status: 'ACTIVE' | 'REMOVED';
  uploadedByUserId: Types.ObjectId;
}

const attachmentSchema = new Schema<AssignmentAttachmentRecord>(
  {
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Assignment',
      required: true,
      immutable: true,
    },
    uploadedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    displayName: { type: String, required: true, immutable: true },
    mimeType: { type: String, required: true, immutable: true },
    sizeBytes: { type: Number, required: true, min: 1, immutable: true },
    checksumSha256: { type: String, required: true, immutable: true, select: false },
    provider: { type: String, enum: ['LOCAL', 'CLOUDINARY'], required: true, immutable: true },
    providerAssetId: { type: String, immutable: true, select: false },
    providerPublicId: { type: String, required: true, immutable: true, select: false },
    providerResourceType: {
      type: String,
      enum: ['image', 'raw'],
      required: true,
      immutable: true,
    },
    providerDeliveryType: {
      type: String,
      enum: ['local', 'authenticated'],
      required: true,
      immutable: true,
    },
    providerFormat: { type: String, required: true, immutable: true },
    providerVersion: { type: Number, immutable: true },
    status: { type: String, enum: ['ACTIVE', 'REMOVED'], required: true, default: 'ACTIVE' },
  },
  { collection: 'assignment_attachments', timestamps: true, versionKey: false },
);
attachmentSchema.index(
  { assignmentId: 1, status: 1 },
  { name: 'assignment_attachment_assignment_status' },
);

export const AssignmentModel =
  (models.Assignment as Model<AssignmentRecord> | undefined) ??
  model<AssignmentRecord>('Assignment', assignmentSchema);
export const AssignmentAttachmentModel =
  (models.AssignmentAttachment as Model<AssignmentAttachmentRecord> | undefined) ??
  model<AssignmentAttachmentRecord>('AssignmentAttachment', attachmentSchema);
