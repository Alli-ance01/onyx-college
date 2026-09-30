import { studentLifecycleStatuses } from '@onyx/contracts';
import mongoose, { type Model, type Types } from 'mongoose';

const { model, models, Schema } = mongoose;

export interface StudentRecord {
  dateOfBirth: string;
  firstName: string;
  gender: string;
  lga?: string;
  lifecycleStatus: (typeof studentLifecycleStatuses)[number];
  middleName?: string;
  nationality: string;
  passportDocumentId: Types.ObjectId;
  residentialAddress: string;
  sourceRegistrationId: Types.ObjectId;
  stateOfOrigin?: string;
  studentId: string;
  surname: string;
  userId: Types.ObjectId;
}

const studentSchema = new Schema<StudentRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    sourceRegistrationId: {
      type: Schema.Types.ObjectId,
      ref: 'StudentRegistration',
      required: true,
      immutable: true,
    },
    studentId: { type: String, required: true, immutable: true },
    surname: { type: String, required: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    middleName: { type: String, trim: true },
    dateOfBirth: { type: String, required: true },
    gender: { type: String, required: true, trim: true },
    nationality: { type: String, required: true, trim: true },
    stateOfOrigin: { type: String, trim: true },
    lga: { type: String, trim: true },
    residentialAddress: { type: String, required: true, trim: true },
    passportDocumentId: {
      type: Schema.Types.ObjectId,
      ref: 'StudentDocument',
      required: true,
    },
    lifecycleStatus: {
      type: String,
      enum: studentLifecycleStatuses,
      required: true,
      default: 'ACTIVE',
    },
  },
  { collection: 'students', timestamps: true, versionKey: 'version' },
);
studentSchema.index({ studentId: 1 }, { name: 'student_identifier_unique', unique: true });
studentSchema.index({ userId: 1 }, { name: 'student_user_unique', unique: true });
studentSchema.index(
  { sourceRegistrationId: 1 },
  { name: 'student_source_registration_unique', unique: true },
);
studentSchema.index({ surname: 1, firstName: 1, studentId: 1 }, { name: 'student_name_search' });
studentSchema.index({ lifecycleStatus: 1 }, { name: 'student_lifecycle' });

export interface StudentMedicalProfileRecord {
  allergies?: string;
  bloodGroup?: string;
  emergencyInstructions?: string;
  genotype?: string;
  medicalConditions?: string;
  medications?: string;
  studentId: Types.ObjectId;
}

const medicalSchema = new Schema<StudentMedicalProfileRecord>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true },
    bloodGroup: { type: String, trim: true },
    genotype: { type: String, trim: true },
    allergies: { type: String, trim: true },
    medicalConditions: { type: String, trim: true },
    medications: { type: String, trim: true },
    emergencyInstructions: { type: String, trim: true },
  },
  { collection: 'student_medical_profiles', timestamps: true, versionKey: 'version' },
);
medicalSchema.index({ studentId: 1 }, { name: 'student_medical_profile_unique', unique: true });

export interface ProfileCorrectionRecord {
  appliedAt?: Date;
  beforeValue: string;
  createdAt: Date;
  field: string;
  reason: string;
  requestedValue: string;
  requesterUserId: Types.ObjectId;
  reviewedAt?: Date;
  reviewerUserId?: Types.ObjectId;
  reviewReason?: string;
  status: 'APPROVED' | 'REJECTED' | 'SUBMITTED' | 'UNDER_REVIEW';
  studentId: Types.ObjectId;
  updatedAt: Date;
}

const correctionSchema = new Schema<ProfileCorrectionRecord>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true },
    requesterUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    field: { type: String, required: true, immutable: true },
    beforeValue: { type: String, required: true, immutable: true },
    requestedValue: { type: String, required: true, immutable: true },
    reason: { type: String, required: true, immutable: true },
    status: {
      type: String,
      enum: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'],
      required: true,
      default: 'SUBMITTED',
    },
    reviewerUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewReason: { type: String },
    appliedAt: { type: Date },
  },
  { collection: 'profile_correction_requests', timestamps: true, versionKey: 'version' },
);
correctionSchema.index({ studentId: 1, createdAt: -1 }, { name: 'correction_student_time' });
correctionSchema.index({ status: 1, createdAt: 1 }, { name: 'correction_review_queue' });

export const StudentModel =
  (models.Student as Model<StudentRecord> | undefined) ??
  model<StudentRecord>('Student', studentSchema);
export const StudentMedicalProfileModel =
  (models.StudentMedicalProfile as Model<StudentMedicalProfileRecord> | undefined) ??
  model<StudentMedicalProfileRecord>('StudentMedicalProfile', medicalSchema);
export const ProfileCorrectionRequestModel =
  (models.ProfileCorrectionRequest as Model<ProfileCorrectionRecord> | undefined) ??
  model<ProfileCorrectionRecord>('ProfileCorrectionRequest', correctionSchema);
