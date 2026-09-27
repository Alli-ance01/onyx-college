import { model, models, Schema, type Model, type Types } from 'mongoose';

export interface AcademicSessionRecord {
  label: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'CLOSED' | 'DRAFT';
}

const academicSessionSchema = new Schema<AcademicSessionRecord>(
  {
    label: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED'],
      required: true,
      default: 'DRAFT',
    },
  },
  { collection: 'academic_sessions', timestamps: true, versionKey: 'version' },
);
academicSessionSchema.index({ label: 1 }, { name: 'academic_session_label_unique', unique: true });
academicSessionSchema.index(
  { status: 1 },
  {
    name: 'one_active_academic_session',
    partialFilterExpression: { status: 'ACTIVE' },
    unique: true,
  },
);

export interface TermRecord {
  academicSessionId: Types.ObjectId;
  name: string;
  ordinal: number;
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED' | 'PLANNED';
}

const termSchema = new Schema<TermRecord>(
  {
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'AcademicSession',
      required: true,
      immutable: true,
    },
    name: { type: String, required: true, immutable: true },
    ordinal: { type: Number, required: true, min: 1, max: 3, immutable: true },
    status: {
      type: String,
      enum: ['PLANNED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'],
      required: true,
      default: 'PLANNED',
    },
  },
  { collection: 'terms', timestamps: true, versionKey: 'version' },
);
termSchema.index(
  { academicSessionId: 1, ordinal: 1 },
  { name: 'term_session_ordinal_unique', unique: true },
);
termSchema.index(
  { academicSessionId: 1, status: 1 },
  {
    name: 'one_active_term_per_session',
    partialFilterExpression: { status: 'ACTIVE' },
    unique: true,
  },
);

export interface ClassLevelRecord {
  code: string;
  name: string;
  order: number;
  stage: 'JUNIOR' | 'SENIOR';
  status: 'ACTIVE' | 'ARCHIVED';
}

const classLevelSchema = new Schema<ClassLevelRecord>(
  {
    code: { type: String, required: true, trim: true, immutable: true },
    name: { type: String, required: true, trim: true },
    order: { type: Number, required: true, min: 1 },
    stage: { type: String, enum: ['JUNIOR', 'SENIOR'], required: true },
    status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], required: true, default: 'ACTIVE' },
  },
  { collection: 'class_levels', timestamps: true, versionKey: 'version' },
);
classLevelSchema.index({ code: 1 }, { name: 'class_level_code_unique', unique: true });
classLevelSchema.index({ order: 1 }, { name: 'class_level_order_unique', unique: true });

export interface TrackRecord {
  code: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

const trackSchema = new Schema<TrackRecord>(
  {
    code: { type: String, required: true, trim: true, immutable: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], required: true, default: 'ACTIVE' },
  },
  { collection: 'tracks', timestamps: true, versionKey: 'version' },
);
trackSchema.index({ code: 1 }, { name: 'track_code_unique', unique: true });

export interface SchoolSettingsRecord {
  currentAcademicSessionId?: Types.ObjectId;
  currentRegistrationConfigurationId?: Types.ObjectId;
  currentTermId?: Types.ObjectId;
  singletonKey: 'SCHOOL';
}

const schoolSettingsSchema = new Schema<SchoolSettingsRecord>(
  {
    singletonKey: { type: String, enum: ['SCHOOL'], required: true, default: 'SCHOOL' },
    currentAcademicSessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession' },
    currentTermId: { type: Schema.Types.ObjectId, ref: 'Term' },
    currentRegistrationConfigurationId: {
      type: Schema.Types.ObjectId,
      ref: 'RegistrationFormConfiguration',
    },
  },
  { collection: 'school_settings', timestamps: true, versionKey: 'version' },
);
schoolSettingsSchema.index(
  { singletonKey: 1 },
  { name: 'school_settings_singleton', unique: true },
);

export const AcademicSessionModel =
  (models.AcademicSession as Model<AcademicSessionRecord> | undefined) ??
  model<AcademicSessionRecord>('AcademicSession', academicSessionSchema);
export const TermModel =
  (models.Term as Model<TermRecord> | undefined) ?? model<TermRecord>('Term', termSchema);
export const ClassLevelModel =
  (models.ClassLevel as Model<ClassLevelRecord> | undefined) ??
  model<ClassLevelRecord>('ClassLevel', classLevelSchema);
export const TrackModel =
  (models.Track as Model<TrackRecord> | undefined) ?? model<TrackRecord>('Track', trackSchema);
export const SchoolSettingsModel =
  (models.SchoolSettings as Model<SchoolSettingsRecord> | undefined) ??
  model<SchoolSettingsRecord>('SchoolSettings', schoolSettingsSchema);
