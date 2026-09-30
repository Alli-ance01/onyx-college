import type { NotificationDto } from '@onyx/contracts';

import { NotFoundError } from '../../../app/errors/app-error.js';
import { OutboxEventModel } from '../../system/infrastructure/system-models.js';
import { NotificationModel, createNotifications } from '../infrastructure/notification-model.js';

const eventCopy: Record<string, { body: string; title: string }> = {
  RegistrationApproved: {
    body: 'Your registration has been approved. Your full Student Portal is now available.',
    title: 'Registration approved',
  },
  RegistrationChangesRequested: {
    body: 'The school requested corrections to your registration.',
    title: 'Registration changes requested',
  },
  RegistrationRejected: {
    body: 'A decision has been recorded for your student registration.',
    title: 'Registration decision',
  },
  ProfileCorrectionApproved: {
    body: 'Your profile correction request was approved.',
    title: 'Profile correction approved',
  },
  ProfileCorrectionRejected: {
    body: 'Your profile correction request was not approved.',
    title: 'Profile correction decision',
  },
  TEACHER_REGISTRATION_APPROVED: {
    body: 'Your teacher profile has been approved. Academic access depends on assigned scopes.',
    title: 'Teacher account approved',
  },
};

export class NotificationService {
  public async list(userId: string): Promise<NotificationDto[]> {
    await this.#materializeUserEvents(userId);
    const records = await NotificationModel.find({ recipientUserId: userId, status: 'AVAILABLE' })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return records.map((item) => ({
      body: item.body,
      createdAt: item.createdAt.toISOString(),
      id: item._id.toString(),
      title: item.title,
      type: item.type,
      ...(item.readAt === undefined ? {} : { readAt: item.readAt.toISOString() }),
      ...(item.resourceId === undefined ? {} : { resourceId: item.resourceId }),
      ...(item.resourceType === undefined ? {} : { resourceType: item.resourceType }),
    }));
  }

  public async markRead(userId: string, notificationId: string): Promise<void> {
    const result = await NotificationModel.updateOne(
      { _id: notificationId, recipientUserId: userId, status: 'AVAILABLE' },
      { $set: { readAt: new Date() } },
    );
    if (result.matchedCount !== 1) throw new NotFoundError();
  }

  public async markAllRead(userId: string): Promise<void> {
    await NotificationModel.updateMany(
      { recipientUserId: userId, readAt: { $exists: false }, status: 'AVAILABLE' },
      { $set: { readAt: new Date() } },
    );
  }

  async #materializeUserEvents(userId: string): Promise<void> {
    const events = await OutboxEventModel.find({
      'payload.userId': userId,
      eventType: { $in: Object.keys(eventCopy) },
    })
      .limit(100)
      .lean();
    await createNotifications(
      events.flatMap((event) => {
        const copy = eventCopy[event.eventType];
        if (copy === undefined) return [];
        return [
          {
            body: copy.body,
            deduplicationKey: `outbox:${event.eventId}:${userId}`,
            recipientUserId: userId,
            resourceId: event.aggregateId,
            resourceType: event.aggregateType,
            sourceEventId: event.eventId,
            title: copy.title,
            type: event.eventType,
          },
        ];
      }),
    );
  }
}
