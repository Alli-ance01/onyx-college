import { documentReviewStatuses } from '@onyx/contracts';
import mongoose, { type Model, type Types } from 'mongoose';

const { model, models, Schema } = mongoose;

export interface DocumentRequirementRecord {
  acceptedMimeTypes: string[];
  active: boolean;
  code: string;
  description?: string;
  label: string;
  maximumBytes: number;
  requiredForRegistration: boolean;
}

const requirementSchema = new Schema<DocumentRequirementRecord>(
  {
    code: { type: String, required: true, trim: true, immutable: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    requiredForRegistration: { type: Boolean, required: true, default: false },
    active: { type: Boolean, required: true, default: true },
    acceptedMimeTypes: [{ type: String, required: true }],
    maximumBytes: { type: Number, required: true, min: 1 },
  },
  { collection: 'document_requirements', timestamps: true, versionKey: 'version' },
);
requirementSchema.index({ code: 1 }, { name: 'document_requirement_code_unique', unique: true });
requirementSchema.index(
  { active: 1, requiredForRegistration: 1 },
  { name: 'document_requirement_active' },
);

export interface StudentDocumentRecord {
  checksumSha256: string;
  displayName: string;
  documentRequirementId: Types.ObjectId;
  mimeType: string;
  originalFilename: string;
  ownerUserId: Types.ObjectId;
  provider: 'CLOUDINARY' | 'LOCAL';
  providerAssetId?: string;
  providerDeliveryType: 'authenticated' | 'local';
  providerFormat: string;
  providerPublicId: string;
  providerResourceType: 'image' | 'raw';
  providerVersion?: number;
  registrationId: Types.ObjectId;
  replacedDocumentId?: Types.ObjectId;
  reviewNote?: string;
  reviewStatus: (typeof documentReviewStatuses)[number];
  reviewedAt?: Date;
  reviewedByUserId?: Types.ObjectId;
  sizeBytes: number;
  status: 'ACTIVE' | 'REMOVAL_PENDING' | 'REMOVED' | 'REPLACED';
  storageDeletedAt?: Date;
  storageDeletionStatus: 'DELETED' | 'NOT_REQUESTED' | 'PENDING';
  storageKey: string;
  studentId?: Types.ObjectId;
  uploadStatus: 'AVAILABLE' | 'FAILED' | 'PENDING';
  versionNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

const studentDocumentSchema = new Schema<StudentDocumentRecord>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    registrationId: {
      type: Schema.Types.ObjectId,
      ref: 'StudentRegistration',
      required: true,
      immutable: true,
    },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    documentRequirementId: {
      type: Schema.Types.ObjectId,
      ref: 'DocumentRequirement',
      required: true,
      immutable: true,
    },
    displayName: { type: String, required: true },
    originalFilename: { type: String, required: true, immutable: true },
    mimeType: { type: String, required: true, immutable: true },
    sizeBytes: { type: Number, required: true, min: 1, immutable: true },
    checksumSha256: { type: String, required: true, immutable: true, select: false },
    storageKey: { type: String, required: true, immutable: true, select: false },
    provider: {
      type: String,
      enum: ['LOCAL', 'CLOUDINARY'],
      required: true,
      immutable: true,
    },
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
    uploadStatus: {
      type: String,
      enum: ['PENDING', 'AVAILABLE', 'FAILED'],
      required: true,
      default: 'AVAILABLE',
    },
    storageDeletionStatus: {
      type: String,
      enum: ['NOT_REQUESTED', 'PENDING', 'DELETED'],
      required: true,
      default: 'NOT_REQUESTED',
    },
    storageDeletedAt: { type: Date },
    versionNumber: { type: Number, required: true, min: 1, immutable: true },
    replacedDocumentId: { type: Schema.Types.ObjectId, ref: 'StudentDocument', immutable: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'REPLACED', 'REMOVAL_PENDING', 'REMOVED'],
      required: true,
      default: 'ACTIVE',
    },
    reviewStatus: {
      type: String,
      enum: documentReviewStatuses,
      required: true,
      default: 'PENDING_REVIEW',
    },
    reviewNote: { type: String },
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { collection: 'student_documents', timestamps: true, versionKey: 'version' },
);
studentDocumentSchema.index(
  { registrationId: 1, documentRequirementId: 1, versionNumber: 1 },
  { name: 'student_document_requirement_version_unique', unique: true },
);
studentDocumentSchema.index(
  { registrationId: 1, status: 1, createdAt: -1 },
  { name: 'student_document_registration_status' },
);
studentDocumentSchema.index(
  { studentId: 1, status: 1 },
  { name: 'student_document_student_status' },
);

export const DocumentRequirementModel =
  (models.DocumentRequirement as Model<DocumentRequirementRecord> | undefined) ??
  model<DocumentRequirementRecord>('DocumentRequirement', requirementSchema);
export const StudentDocumentModel =
  (models.StudentDocument as Model<StudentDocumentRecord> | undefined) ??
  model<StudentDocumentRecord>('StudentDocument', studentDocumentSchema);
