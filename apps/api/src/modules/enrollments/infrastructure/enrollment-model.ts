import { model, models, Schema, type Model, type Types } from 'mongoose';

export interface EnrollmentRecord {
  academicSessionId: Types.ObjectId;
  classLevelId: Types.ObjectId;
  enrolledAt: Date;
  placementSourceRegistrationId: Types.ObjectId;
  status: 'ACTIVE' | 'COMPLETED' | 'GRADUATED' | 'TRANSFERRED' | 'WITHDRAWN';
  studentId: Types.ObjectId;
  trackId?: Types.ObjectId;
}

const enrollmentSchema = new Schema<EnrollmentRecord>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true },
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'AcademicSession',
      required: true,
      immutable: true,
    },
    classLevelId: {
      type: Schema.Types.ObjectId,
      ref: 'ClassLevel',
      required: true,
      immutable: true,
    },
    trackId: { type: Schema.Types.ObjectId, ref: 'Track', immutable: true },
    placementSourceRegistrationId: {
      type: Schema.Types.ObjectId,
      ref: 'StudentRegistration',
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'WITHDRAWN', 'TRANSFERRED', 'GRADUATED'],
      required: true,
      default: 'ACTIVE',
    },
    enrolledAt: { type: Date, required: true, default: Date.now, immutable: true },
  },
  { collection: 'enrollments', timestamps: true, versionKey: 'version' },
);
enrollmentSchema.index(
  { studentId: 1, academicSessionId: 1 },
  { name: 'enrollment_student_session_unique', unique: true },
);
enrollmentSchema.index(
  { academicSessionId: 1, classLevelId: 1, trackId: 1, status: 1 },
  { name: 'enrollment_placement_roster' },
);

export const EnrollmentModel =
  (models.Enrollment as Model<EnrollmentRecord> | undefined) ??
  model<EnrollmentRecord>('Enrollment', enrollmentSchema);
