import mongoose, { type Model, type Types } from 'mongoose';
const { model, models, Schema } = mongoose;

export interface SubjectChangeRequestRecord {
  action: 'ADD' | 'REMOVE';
  enrollmentId: Types.ObjectId;
  requestedByUserId: Types.ObjectId;
  subjectId: Types.ObjectId;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decisionReason?: string;
  decidedByUserId?: Types.ObjectId;
  decidedAt?: Date;
  createdAt: Date;
  version: number;
}

const subjectChangeRequestSchema = new Schema<SubjectChangeRequestRecord>(
  {
    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Enrollment',
      required: true,
      immutable: true,
    },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, immutable: true },
    action: { type: String, enum: ['ADD', 'REMOVE'], required: true, immutable: true },
    requestedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    reason: { type: String, required: true, trim: true, immutable: true },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      required: true,
      default: 'PENDING',
    },
    decisionReason: { type: String, trim: true },
    decidedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
  },
  {
    collection: 'subject_change_requests',
    timestamps: { createdAt: true, updatedAt: true },
    versionKey: 'version',
  },
);
subjectChangeRequestSchema.index(
  { enrollmentId: 1, subjectId: 1, status: 1 },
  {
    name: 'subject_change_request_pending_unique',
    unique: true,
    partialFilterExpression: { status: 'PENDING' },
  },
);
subjectChangeRequestSchema.index(
  { status: 1, createdAt: 1 },
  { name: 'subject_change_request_queue' },
);
subjectChangeRequestSchema.index(
  { requestedByUserId: 1, createdAt: -1 },
  { name: 'subject_change_request_student_history' },
);

export const SubjectChangeRequestModel =
  (models.SubjectChangeRequest as Model<SubjectChangeRequestRecord> | undefined) ??
  model<SubjectChangeRequestRecord>('SubjectChangeRequest', subjectChangeRequestSchema);
