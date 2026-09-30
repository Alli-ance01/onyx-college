import type { AnnouncementAudienceType, AnnouncementDto } from '@onyx/contracts';
import mongoose from 'mongoose';

import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../app/errors/app-error.js';
import { ClassLevelModel, TrackModel } from '../../academics/infrastructure/academic-models.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import { EnrollmentModel } from '../../enrollments/infrastructure/enrollment-model.js';
import { UserModel } from '../../identity/infrastructure/user-model.js';
import { StudentModel } from '../../students/infrastructure/student-models.js';
import {
  TeacherModel,
  TeachingAssignmentModel,
} from '../../teachers/infrastructure/teacher-models.js';
import { OutboxEventModel } from '../../system/infrastructure/system-models.js';
import { createNotifications } from '../../notifications/infrastructure/notification-model.js';
import { AnnouncementModel } from '../infrastructure/announcement-model.js';

interface PrincipalSummary {
  accountType: string;
  permissions: readonly string[];
  userId: string;
}

export class AnnouncementService {
  readonly #audit = new AuditWriter();

  public async listForPrincipal(principal: PrincipalSummary): Promise<AnnouncementDto[]> {
    const now = new Date();
    let query: Record<string, unknown> = {};
    if (principal.accountType === 'STUDENT') {
      const student = await StudentModel.findOne({ userId: principal.userId }).lean();
      if (student === null) throw new NotFoundError();
      const enrollments = await EnrollmentModel.find({ studentId: student._id }).lean();
      const audiences: Record<string, unknown>[] = [
        { audienceType: 'SCHOOL' },
        { audienceType: 'STUDENTS' },
        { audienceType: 'SPECIFIC_USERS', audienceUserIds: principal.userId },
      ];
      for (const enrollment of enrollments) {
        const classLevel = await ClassLevelModel.findById(enrollment.classLevelId).lean();
        if (classLevel !== null)
          audiences.push({
            audienceType: classLevel.stage === 'JUNIOR' ? 'JUNIOR_SCHOOL' : 'SENIOR_SCHOOL',
          });
        audiences.push({ audienceType: 'CLASS', audienceClassLevelId: enrollment.classLevelId });
        if (enrollment.trackId !== undefined) {
          audiences.push({ audienceType: 'TRACK', audienceTrackId: enrollment.trackId });
          audiences.push({
            audienceType: 'CLASS_TRACK',
            audienceClassLevelId: enrollment.classLevelId,
            audienceTrackId: enrollment.trackId,
          });
        }
      }
      query = {
        $or: audiences,
        status: 'PUBLISHED',
        $and: [{ $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] }],
      };
    } else if (principal.accountType === 'TEACHER') {
      query = {
        $or: [
          { audienceType: 'SCHOOL', status: 'PUBLISHED' },
          { audienceType: 'TEACHERS', status: 'PUBLISHED' },
          {
            audienceType: 'SPECIFIC_USERS',
            audienceUserIds: principal.userId,
            status: 'PUBLISHED',
          },
          { authorUserId: principal.userId },
        ],
        $and: [{ $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] }],
      };
    }
    const records = await AnnouncementModel.find(query)
      .populate('authorUserId', 'username')
      .populate('audienceClassLevelId', 'name')
      .populate('audienceTrackId', 'name')
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();
    return records.map((item) => {
      const author = item.authorUserId as unknown as {
        _id: mongoose.Types.ObjectId;
        username: string;
      };
      const classLevel = item.audienceClassLevelId as unknown as
        { _id: mongoose.Types.ObjectId; name: string } | undefined;
      const track = item.audienceTrackId as unknown as
        { _id: mongoose.Types.ObjectId; name: string } | undefined;
      const label =
        item.audienceType === 'CLASS_TRACK'
          ? `${classLevel?.name ?? 'Class'} · ${track?.name ?? 'Track'}`
          : (classLevel?.name ?? track?.name ?? item.audienceType.replaceAll('_', ' '));
      return {
        audience: {
          label,
          type: item.audienceType,
          ...(classLevel === undefined ? {} : { classLevelId: classLevel._id.toString() }),
          ...(track === undefined ? {} : { trackId: track._id.toString() }),
          ...(item.audienceUserIds.length === 0
            ? {}
            : { userIds: item.audienceUserIds.map(String) }),
        },
        author: { id: author._id.toString(), name: author.username },
        body: item.body,
        createdAt: item.createdAt.toISOString(),
        id: item._id.toString(),
        status: item.status,
        title: item.title,
        version: item.version,
        ...(item.expiresAt === undefined ? {} : { expiresAt: item.expiresAt.toISOString() }),
        ...(item.publishedAt === undefined ? {} : { publishedAt: item.publishedAt.toISOString() }),
      };
    });
  }

  public async create(input: {
    actor: PrincipalSummary;
    audience: {
      classLevelId?: string;
      trackId?: string;
      type: AnnouncementAudienceType;
      userIds?: readonly string[];
    };
    body: string;
    expiresAt?: string;
    requestId: string;
    title: string;
  }): Promise<string> {
    const schoolwide = input.actor.permissions.includes('announcements.create_schoolwide');
    const scoped = input.actor.permissions.includes('announcements.create_scoped');
    if (!schoolwide && !scoped) throw new AuthorizationError();
    if (!schoolwide) await this.#validateTeacherAudience(input.actor.userId, input.audience);
    await this.#validateAudienceShape(input.audience);
    const announcement = new AnnouncementModel({
      audienceType: input.audience.type,
      audienceUserIds: (input.audience.userIds ?? []).map(
        (userId) => new mongoose.Types.ObjectId(userId),
      ),
      authorUserId: input.actor.userId,
      body: input.body,
      status: 'DRAFT',
      title: input.title,
      ...(input.audience.classLevelId === undefined
        ? {}
        : { audienceClassLevelId: input.audience.classLevelId }),
      ...(input.audience.trackId === undefined ? {} : { audienceTrackId: input.audience.trackId }),
      ...(input.expiresAt === undefined ? {} : { expiresAt: new Date(input.expiresAt) }),
    });
    await announcement.save();
    await this.#audit.append({
      action: 'ANNOUNCEMENT_CREATED',
      actorType: 'USER',
      actorUserId: new mongoose.Types.ObjectId(input.actor.userId),
      changes: { audienceType: input.audience.type },
      outcome: 'SUCCESS',
      requestId: input.requestId,
      targetId: announcement._id.toString(),
      targetType: 'Announcement',
    });
    return announcement._id.toString();
  }

  public async publish(input: {
    actor: PrincipalSummary;
    announcementId: string;
    requestId: string;
  }): Promise<void> {
    const record = await AnnouncementModel.findById(input.announcementId).lean();
    if (record === null) throw new NotFoundError();
    const owns = record.authorUserId.toString() === input.actor.userId;
    if (!owns && !input.actor.permissions.includes('announcements.manage_all'))
      throw new AuthorizationError();
    if (record.status !== 'DRAFT')
      throw new ConflictError('Only a draft announcement can be published.');
    const recipientUserIds = await this.#recipientUserIds(record);
    await mongoose.connection.transaction(async (session) => {
      const changed = await AnnouncementModel.updateOne(
        { _id: record._id, status: 'DRAFT' },
        { $set: { publishedAt: new Date(), status: 'PUBLISHED' } },
        { session },
      );
      if (changed.modifiedCount !== 1)
        throw new ConflictError('The announcement changed before publication.');
      await this.#audit.append(
        {
          action: 'ANNOUNCEMENT_PUBLISHED',
          actorType: 'USER',
          actorUserId: new mongoose.Types.ObjectId(input.actor.userId),
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: record._id.toString(),
          targetType: 'Announcement',
        },
        session,
      );
      await OutboxEventModel.create(
        [
          {
            aggregateId: record._id.toString(),
            aggregateType: 'Announcement',
            eventId: `announcement:${record._id.toString()}:published`,
            eventType: 'ANNOUNCEMENT_PUBLISHED',
            occurredAt: new Date(),
            payload: { audienceType: record.audienceType },
            status: 'PENDING',
            transactionActorId: new mongoose.Types.ObjectId(input.actor.userId),
          },
        ],
        { session },
      );
      await createNotifications(
        recipientUserIds.map((userId) => ({
          body: record.body,
          deduplicationKey: `announcement:${record._id.toString()}:published:${userId}`,
          recipientUserId: userId,
          resourceId: record._id.toString(),
          resourceType: 'Announcement',
          sourceEventId: `announcement:${record._id.toString()}:published`,
          title: record.title,
          type: 'ANNOUNCEMENT_PUBLISHED',
        })),
        session,
      );
    });
  }

  public async update(input: {
    actor: PrincipalSummary;
    announcementId: string;
    body?: string;
    expiresAt?: string;
    title?: string;
  }): Promise<void> {
    const record = await AnnouncementModel.findById(input.announcementId).lean();
    if (record === null) throw new NotFoundError();
    const owns = record.authorUserId.toString() === input.actor.userId;
    if (!input.actor.permissions.includes('announcements.manage_all')) {
      if (!owns || !input.actor.permissions.includes('announcements.update_own'))
        throw new AuthorizationError();
    }
    if (!['DRAFT', 'PUBLISHED'].includes(record.status))
      throw new ConflictError('This announcement cannot be updated.');
    const changes: Record<string, unknown> = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.body !== undefined) changes.body = input.body;
    if (input.expiresAt !== undefined) changes.expiresAt = new Date(input.expiresAt);
    await AnnouncementModel.updateOne({ _id: record._id }, { $set: changes });
  }

  public async withdraw(input: {
    actor: PrincipalSummary;
    announcementId: string;
    requestId: string;
  }): Promise<void> {
    const query: Record<string, unknown> = { _id: input.announcementId, status: 'PUBLISHED' };
    if (!input.actor.permissions.includes('announcements.manage_all'))
      query.authorUserId = input.actor.userId;
    const result = await AnnouncementModel.updateOne(query, { $set: { status: 'WITHDRAWN' } });
    if (result.modifiedCount !== 1) throw new NotFoundError();
    await this.#audit.append({
      action: 'ANNOUNCEMENT_WITHDRAWN',
      actorType: 'USER',
      actorUserId: new mongoose.Types.ObjectId(input.actor.userId),
      outcome: 'SUCCESS',
      requestId: input.requestId,
      targetId: input.announcementId,
      targetType: 'Announcement',
    });
  }

  async #validateAudienceShape(audience: {
    classLevelId?: string;
    trackId?: string;
    type: AnnouncementAudienceType;
    userIds?: readonly string[];
  }): Promise<void> {
    if (['CLASS', 'CLASS_TRACK'].includes(audience.type) && audience.classLevelId === undefined)
      throw new ValidationError('This audience requires a class level.');
    if (['TRACK', 'CLASS_TRACK'].includes(audience.type) && audience.trackId === undefined)
      throw new ValidationError('This audience requires a senior track.');
    if (audience.type === 'SPECIFIC_USERS') {
      const userIds = [...(audience.userIds ?? [])];
      if (userIds.length === 0) throw new ValidationError('Select at least one user.');
      if ((await UserModel.countDocuments({ _id: { $in: userIds } })) !== userIds.length)
        throw new ValidationError('One or more selected users are invalid.');
    }
    if (
      audience.classLevelId !== undefined &&
      (await ClassLevelModel.exists({ _id: audience.classLevelId })) === null
    )
      throw new ValidationError('The selected class level is invalid.');
    if (
      audience.trackId !== undefined &&
      (await TrackModel.exists({ _id: audience.trackId })) === null
    )
      throw new ValidationError('The selected track is invalid.');
  }

  async #validateTeacherAudience(
    userId: string,
    audience: { classLevelId?: string; trackId?: string; type: AnnouncementAudienceType },
  ): Promise<void> {
    if (!['CLASS', 'TRACK', 'CLASS_TRACK'].includes(audience.type)) throw new AuthorizationError();
    const teacher = await TeacherModel.findOne({ userId, status: 'ACTIVE' }).lean();
    if (teacher === null) throw new AuthorizationError();
    const query: Record<string, unknown> = { teacherId: teacher._id, status: 'ACTIVE' };
    if (audience.classLevelId !== undefined) query.classLevelId = audience.classLevelId;
    if (audience.trackId !== undefined) query.trackId = audience.trackId;
    if ((await TeachingAssignmentModel.exists(query)) === null) throw new AuthorizationError();
  }

  async #recipientUserIds(record: {
    audienceClassLevelId?: mongoose.Types.ObjectId;
    audienceTrackId?: mongoose.Types.ObjectId;
    audienceType: AnnouncementAudienceType;
    audienceUserIds: mongoose.Types.ObjectId[];
  }): Promise<string[]> {
    if (record.audienceType === 'SPECIFIC_USERS') {
      const users = await UserModel.find({
        _id: { $in: record.audienceUserIds },
        accountStatus: 'ACTIVE',
      })
        .select({ _id: 1 })
        .lean();
      return users.map(({ _id }) => _id.toString());
    }
    if (record.audienceType === 'SCHOOL') {
      const users = await UserModel.find({
        accountStatus: 'ACTIVE',
        accountType: { $in: ['ADMINISTRATOR', 'STUDENT', 'TEACHER'] },
      })
        .select({ _id: 1 })
        .lean();
      return users.map(({ _id }) => _id.toString());
    }
    if (record.audienceType === 'TEACHERS') {
      const teachers = await TeacherModel.find({ status: 'ACTIVE' }).select({ userId: 1 }).lean();
      return teachers.map(({ userId }) => userId.toString());
    }

    const enrollmentQuery: Record<string, unknown> = { status: 'ACTIVE' };
    if (record.audienceClassLevelId !== undefined)
      enrollmentQuery.classLevelId = record.audienceClassLevelId;
    if (record.audienceTrackId !== undefined) enrollmentQuery.trackId = record.audienceTrackId;
    if (record.audienceType === 'JUNIOR_SCHOOL' || record.audienceType === 'SENIOR_SCHOOL') {
      const classLevels = await ClassLevelModel.find({
        stage: record.audienceType === 'JUNIOR_SCHOOL' ? 'JUNIOR' : 'SENIOR',
        status: 'ACTIVE',
      })
        .select({ _id: 1 })
        .lean();
      enrollmentQuery.classLevelId = { $in: classLevels.map(({ _id }) => _id) };
    }
    const enrollments = await EnrollmentModel.find(enrollmentQuery).select({ studentId: 1 }).lean();
    const students = await StudentModel.find({
      _id: { $in: enrollments.map(({ studentId }) => studentId) },
      lifecycleStatus: 'ACTIVE',
    })
      .select({ userId: 1 })
      .lean();
    return [...new Set(students.map(({ userId }) => userId.toString()))];
  }
}
