import type { AnnouncementAudienceType } from '@onyx/contracts';
import mongoose, { type Model, type Types } from 'mongoose';

const { model, models, Schema } = mongoose;

export interface AnnouncementRecord {
  audienceClassLevelId?: Types.ObjectId;
  audienceTrackId?: Types.ObjectId;
  audienceType: AnnouncementAudienceType;
  audienceUserIds: Types.ObjectId[];
  authorUserId: Types.ObjectId;
  body: string;
  expiresAt?: Date;
  publishedAt?: Date;
  status: 'ARCHIVED' | 'DRAFT' | 'EXPIRED' | 'PUBLISHED' | 'WITHDRAWN';
  title: string;
  createdAt: Date;
  version: number;
}

const announcementSchema = new Schema<AnnouncementRecord>(
  {
    authorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    audienceType: {
      type: String,
      enum: [
        'SCHOOL',
        'STUDENTS',
        'TEACHERS',
        'JUNIOR_SCHOOL',
        'SENIOR_SCHOOL',
        'CLASS',
        'TRACK',
        'CLASS_TRACK',
        'SPECIFIC_USERS',
      ],
      required: true,
      immutable: true,
    },
    audienceClassLevelId: { type: Schema.Types.ObjectId, ref: 'ClassLevel', immutable: true },
    audienceTrackId: { type: Schema.Types.ObjectId, ref: 'Track', immutable: true },
    audienceUserIds: [{ type: Schema.Types.ObjectId, ref: 'User', immutable: true }],
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'EXPIRED', 'WITHDRAWN', 'ARCHIVED'],
      required: true,
      default: 'DRAFT',
    },
    publishedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { collection: 'announcements', timestamps: true, versionKey: 'version' },
);
announcementSchema.index(
  { status: 1, publishedAt: -1, expiresAt: 1 },
  { name: 'announcement_publication_time' },
);
announcementSchema.index(
  { audienceType: 1, audienceClassLevelId: 1, audienceTrackId: 1, status: 1 },
  { name: 'announcement_academic_audience' },
);
announcementSchema.index(
  { audienceUserIds: 1, status: 1, publishedAt: -1 },
  { name: 'announcement_specific_users' },
);
announcementSchema.index({ authorUserId: 1, createdAt: -1 }, { name: 'announcement_author' });

export const AnnouncementModel =
  (models.Announcement as Model<AnnouncementRecord> | undefined) ??
  model<AnnouncementRecord>('Announcement', announcementSchema);
