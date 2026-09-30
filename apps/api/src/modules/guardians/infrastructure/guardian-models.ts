import mongoose, { type Model, type Types } from 'mongoose';

const { model, models, Schema } = mongoose;

export interface GuardianRecord {
  address?: string;
  alternatePhone?: string;
  email?: string;
  fullName: string;
  normalizedEmail?: string;
  normalizedPhone: string;
  occupation?: string;
  phone: string;
}

const guardianSchema = new Schema<GuardianRecord>(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    normalizedPhone: { type: String, required: true, select: false },
    alternatePhone: { type: String, trim: true },
    email: { type: String, trim: true },
    normalizedEmail: { type: String, select: false },
    occupation: { type: String, trim: true },
    address: { type: String, trim: true },
  },
  { collection: 'guardians', timestamps: true, versionKey: 'version' },
);
guardianSchema.index({ normalizedPhone: 1 }, { name: 'guardian_phone_candidates' });
guardianSchema.index({ normalizedEmail: 1 }, { name: 'guardian_email_candidates', sparse: true });

export interface StudentGuardianRecord {
  emergencyContact: boolean;
  guardianId: Types.ObjectId;
  primary: boolean;
  relationship: string;
  studentId: Types.ObjectId;
}

const studentGuardianSchema = new Schema<StudentGuardianRecord>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true },
    guardianId: { type: Schema.Types.ObjectId, ref: 'Guardian', required: true, immutable: true },
    relationship: { type: String, required: true, trim: true },
    primary: { type: Boolean, required: true, default: false },
    emergencyContact: { type: Boolean, required: true, default: false },
  },
  { collection: 'student_guardians', timestamps: true, versionKey: 'version' },
);
studentGuardianSchema.index(
  { studentId: 1, guardianId: 1 },
  { name: 'student_guardian_link_unique', unique: true },
);
studentGuardianSchema.index(
  { studentId: 1, primary: 1 },
  {
    name: 'student_primary_guardian_unique',
    partialFilterExpression: { primary: true },
    unique: true,
  },
);

export const GuardianModel =
  (models.Guardian as Model<GuardianRecord> | undefined) ??
  model<GuardianRecord>('Guardian', guardianSchema);
export const StudentGuardianModel =
  (models.StudentGuardian as Model<StudentGuardianRecord> | undefined) ??
  model<StudentGuardianRecord>('StudentGuardian', studentGuardianSchema);
