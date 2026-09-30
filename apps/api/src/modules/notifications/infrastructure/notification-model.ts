import { model, models, Schema, Types, type ClientSession, type Model } from 'mongoose';

export interface NotificationRecord {
  body: string;
  deduplicationKey: string;
  readAt?: Date;
  recipientUserId: Types.ObjectId;
  resourceId?: string;
  resourceType?: string;
  sourceEventId?: string;
  status: 'ARCHIVED' | 'AVAILABLE';
  title: string;
  type: string;
  createdAt: Date;
}

const notificationSchema = new Schema<NotificationRecord>(
  {
    recipientUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    type: { type: String, required: true, immutable: true },
    title: { type: String, required: true, immutable: true },
    body: { type: String, required: true, immutable: true },
    resourceType: { type: String, immutable: true },
    resourceId: { type: String, immutable: true },
    sourceEventId: { type: String, immutable: true },
    deduplicationKey: { type: String, required: true, immutable: true },
    status: {
      type: String,
      enum: ['AVAILABLE', 'ARCHIVED'],
      required: true,
      default: 'AVAILABLE',
    },
    readAt: { type: Date },
  },
  { collection: 'notifications', timestamps: true, versionKey: false },
);
notificationSchema.index(
  { deduplicationKey: 1 },
  { name: 'notification_deduplication_unique', unique: true },
);
notificationSchema.index(
  { recipientUserId: 1, readAt: 1, createdAt: -1 },
  { name: 'notification_recipient_read_time' },
);

export const NotificationModel =
  (models.Notification as Model<NotificationRecord> | undefined) ??
  model<NotificationRecord>('Notification', notificationSchema);

export async function createNotifications(
  records: readonly {
    body: string;
    deduplicationKey: string;
    recipientUserId: Types.ObjectId | string;
    resourceId?: string;
    resourceType?: string;
    sourceEventId?: string;
    title: string;
    type: string;
  }[],
  session?: ClientSession,
): Promise<void> {
  if (records.length === 0) return;
  for (const record of records) {
    await NotificationModel.updateOne(
      { deduplicationKey: record.deduplicationKey },
      {
        $setOnInsert: {
          body: record.body,
          deduplicationKey: record.deduplicationKey,
          recipientUserId:
            typeof record.recipientUserId === 'string'
              ? new Types.ObjectId(record.recipientUserId)
              : record.recipientUserId,
          status: 'AVAILABLE',
          title: record.title,
          type: record.type,
          ...(record.resourceId === undefined ? {} : { resourceId: record.resourceId }),
          ...(record.resourceType === undefined ? {} : { resourceType: record.resourceType }),
          ...(record.sourceEventId === undefined ? {} : { sourceEventId: record.sourceEventId }),
        },
      },
      { upsert: true, ...(session === undefined ? {} : { session }) },
    );
  }
}
