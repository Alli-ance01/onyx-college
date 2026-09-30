import { registrationStatuses } from '@onyx/contracts';
import { model, models, Schema, type Model, type Types } from 'mongoose';

const canonicalFieldSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    helpText: { type: String },
    placeholder: { type: String },
    section: { type: String, required: true },
    displayOrder: { type: Number, required: true },
    enabled: { type: Boolean, required: true },
    required: { type: Boolean, required: true },
  },
  { _id: false },
);

const customFieldSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    helpText: { type: String },
    placeholder: { type: String },
    section: { type: String, required: true },
    displayOrder: { type: Number, required: true },
    enabled: { type: Boolean, required: true },
    required: { type: Boolean, required: true },
    type: {
      type: String,
      enum: [
        'TEXT',
        'TEXTAREA',
        'NUMBER',
        'DATE',
        'SELECT',
        'MULTISELECT',
        'BOOLEAN',
        'EMAIL',
        'PHONE',
      ],
      required: true,
    },
    options: [{ type: String }],
    validation: {
      minimumLength: { type: Number },
      maximumLength: { type: Number },
      minimum: { type: Number },
      maximum: { type: Number },
      earliestDate: { type: String },
      latestDate: { type: String },
    },
  },
  { _id: false },
);

interface ConfigurationFieldRecord {
  displayOrder: number;
  enabled: boolean;
  helpText?: string;
  key: string;
  label: string;
  placeholder?: string;
  required: boolean;
  section: string;
}

interface CustomConfigurationFieldRecord extends ConfigurationFieldRecord {
  options?: string[];
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
  validation?: Record<string, string | number>;
}

export interface RegistrationFormConfigurationRecord {
  canonicalFields: ConfigurationFieldRecord[];
  createdByUserId?: Types.ObjectId;
  customFields: CustomConfigurationFieldRecord[];
  immutableSince?: Date;
  publishedAt: Date;
  status: 'ACTIVE' | 'SUPERSEDED';
  versionNumber: number;
}

export interface RegistrationDuplicateCandidateRecord {
  confidence: 'FUZZY' | 'STRONG';
  matchedFields: string[];
  matchedRegistrationId?: Types.ObjectId;
  matchedStudentId?: Types.ObjectId;
  status: string;
}

export interface RegistrationReviewEventRecord {
  action: string;
  actorUserId: Types.ObjectId;
  at: Date;
  fields?: string[];
  note?: string;
}

const registrationConfigurationSchema = new Schema<RegistrationFormConfigurationRecord>(
  {
    versionNumber: { type: Number, required: true, min: 1, immutable: true },
    status: { type: String, enum: ['ACTIVE', 'SUPERSEDED'], required: true, default: 'ACTIVE' },
    canonicalFields: { type: [canonicalFieldSchema], required: true },
    customFields: { type: [customFieldSchema], required: true, default: [] },
    publishedAt: { type: Date, required: true, immutable: true },
    immutableSince: { type: Date, immutable: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', immutable: true },
  },
  { collection: 'registration_form_configurations', timestamps: true, versionKey: 'version' },
);
registrationConfigurationSchema.index(
  { versionNumber: 1 },
  { name: 'registration_configuration_version_unique', unique: true },
);
registrationConfigurationSchema.index(
  { status: 1 },
  {
    name: 'registration_configuration_one_active',
    partialFilterExpression: { status: 'ACTIVE' },
    unique: true,
  },
);

const registrationDataSchema = new Schema(
  {
    personal: {
      surname: { type: String, trim: true },
      firstName: { type: String, trim: true },
      middleName: { type: String, trim: true },
      dateOfBirth: { type: String },
      gender: { type: String, trim: true },
      nationality: { type: String, trim: true },
      stateOfOrigin: { type: String, trim: true },
      lga: { type: String, trim: true },
    },
    contact: {
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
      residentialAddress: { type: String, trim: true },
    },
    guardian: {
      fullName: { type: String, trim: true },
      relationship: { type: String, trim: true },
      phone: { type: String, trim: true },
      alternatePhone: { type: String, trim: true },
      email: { type: String, trim: true },
      occupation: { type: String, trim: true },
      address: { type: String, trim: true },
      emergencyContact: { type: Boolean },
    },
    academic: {
      requestedClassLevelCode: { type: String },
      requestedTrackCode: { type: String },
    },
    medical: {
      bloodGroup: { type: String, trim: true },
      genotype: { type: String, trim: true },
      allergies: { type: String, trim: true },
      medicalConditions: { type: String, trim: true },
      medications: { type: String, trim: true },
      emergencyInstructions: { type: String, trim: true },
    },
    customResponses: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false, minimize: false },
);

const duplicateCandidateSchema = new Schema(
  {
    confidence: { type: String, enum: ['STRONG', 'FUZZY'], required: true },
    matchedRegistrationId: { type: Schema.Types.ObjectId, ref: 'StudentRegistration' },
    matchedStudentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    status: { type: String, required: true },
    matchedFields: [{ type: String, required: true }],
  },
  { _id: false },
);

const reviewEventSchema = new Schema(
  {
    action: { type: String, required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, required: true },
    note: { type: String },
    fields: [{ type: String }],
  },
  { _id: false },
);

export interface StudentRegistrationRecord {
  allowedCorrectionFields: string[];
  approvalIdempotencyKey?: string;
  approvedEnrollmentId?: Types.ObjectId;
  approvedStudentId?: Types.ObjectId;
  configurationVersionId: Types.ObjectId;
  data: Record<string, unknown>;
  decisionReason?: string;
  duplicateCandidates: RegistrationDuplicateCandidateRecord[];
  duplicateResolution?: 'CONFIRMED_DISTINCT' | 'DUPLICATE_REJECTED' | 'ORIGINAL_REOPENED';
  duplicateResolutionReason?: string;
  duplicateResolvedAt?: Date;
  duplicateResolvedByUserId?: Types.ObjectId;
  normalizedDateOfBirth?: string;
  normalizedFirstName?: string;
  normalizedGuardianPhone?: string;
  normalizedSurname?: string;
  reviewHistory: RegistrationReviewEventRecord[];
  status: (typeof registrationStatuses)[number];
  submittedAt?: Date;
  submittedData?: Record<string, unknown>;
  userId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const studentRegistrationSchema = new Schema<StudentRegistrationRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    configurationVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'RegistrationFormConfiguration',
      required: true,
      immutable: true,
    },
    status: { type: String, enum: registrationStatuses, required: true, default: 'DRAFT' },
    data: { type: registrationDataSchema, required: true, default: () => ({}) },
    submittedData: { type: registrationDataSchema },
    submittedAt: { type: Date },
    normalizedFirstName: { type: String, select: false },
    normalizedSurname: { type: String, select: false },
    normalizedDateOfBirth: { type: String, select: false },
    normalizedGuardianPhone: { type: String, select: false },
    duplicateCandidates: { type: [duplicateCandidateSchema], required: true, default: [] },
    duplicateResolution: {
      type: String,
      enum: ['CONFIRMED_DISTINCT', 'DUPLICATE_REJECTED', 'ORIGINAL_REOPENED'],
    },
    duplicateResolutionReason: { type: String },
    duplicateResolvedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    duplicateResolvedAt: { type: Date },
    allowedCorrectionFields: { type: [String], required: true, default: [] },
    decisionReason: { type: String },
    reviewHistory: { type: [reviewEventSchema], required: true, default: [] },
    approvedStudentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    approvedEnrollmentId: { type: Schema.Types.ObjectId, ref: 'Enrollment' },
    approvalIdempotencyKey: { type: String },
  },
  {
    collection: 'student_registrations',
    minimize: false,
    timestamps: true,
    versionKey: 'version',
  },
);
studentRegistrationSchema.index(
  { userId: 1 },
  { name: 'student_registration_user_unique', unique: true },
);
studentRegistrationSchema.index(
  { status: 1, submittedAt: 1, _id: 1 },
  { name: 'student_registration_review_queue' },
);
studentRegistrationSchema.index(
  {
    normalizedFirstName: 1,
    normalizedSurname: 1,
    normalizedDateOfBirth: 1,
    normalizedGuardianPhone: 1,
  },
  { name: 'student_registration_strong_duplicate_lookup' },
);
studentRegistrationSchema.index(
  { approvalIdempotencyKey: 1 },
  {
    name: 'student_registration_approval_idempotency_unique',
    unique: true,
    partialFilterExpression: { approvalIdempotencyKey: { $type: 'string' } },
  },
);

export const RegistrationFormConfigurationModel =
  (models.RegistrationFormConfiguration as
    Model<RegistrationFormConfigurationRecord> | undefined) ??
  model<RegistrationFormConfigurationRecord>(
    'RegistrationFormConfiguration',
    registrationConfigurationSchema,
  );
export const StudentRegistrationModel =
  (models.StudentRegistration as Model<StudentRegistrationRecord> | undefined) ??
  model<StudentRegistrationRecord>('StudentRegistration', studentRegistrationSchema);
