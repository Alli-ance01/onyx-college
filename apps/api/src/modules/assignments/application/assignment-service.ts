import { createHash, randomUUID } from 'node:crypto';

import type { AssignmentDto, StudentDocumentAccessDto } from '@onyx/contracts';
import mongoose from 'mongoose';

import { AuthorizationError, ConflictError, NotFoundError } from '../../../app/errors/app-error.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import type {
  DocumentStorage,
  DocumentStorageObject,
  StoredDocument,
} from '../../documents/application/document-storage.js';
import {
  documentExtensionFor,
  sanitizeDocumentFilename,
  validateDocumentUpload,
} from '../../documents/domain/document-file-policy.js';
import { EnrollmentModel } from '../../enrollments/infrastructure/enrollment-model.js';
import { StudentModel } from '../../students/infrastructure/student-models.js';
import { SubjectService } from '../../subjects/application/subject-service.js';
import { SubjectModel } from '../../subjects/infrastructure/subject-models.js';
import { activeTeachingAssignmentFilter } from '../../teachers/application/teaching-scope-policy.js';
import {
  TeacherModel,
  TeachingAssignmentModel,
} from '../../teachers/infrastructure/teacher-models.js';
import { OutboxEventModel } from '../../system/infrastructure/system-models.js';
import { createNotifications } from '../../notifications/infrastructure/notification-model.js';
import { AssignmentAttachmentModel, AssignmentModel } from '../infrastructure/assignment-models.js';

interface PrincipalSummary {
  accountType: string;
  permissions: readonly string[];
  userId: string;
}

function attachmentStorageObject(item: {
  provider: 'CLOUDINARY' | 'LOCAL';
  providerAssetId?: string;
  providerDeliveryType: 'authenticated' | 'local';
  providerFormat: string;
  providerPublicId: string;
  providerResourceType: 'image' | 'raw';
  providerVersion?: number;
}): DocumentStorageObject {
  return {
    deliveryType: item.providerDeliveryType,
    format: item.providerFormat,
    provider: item.provider,
    publicId: item.providerPublicId,
    resourceType: item.providerResourceType,
    ...(item.providerAssetId === undefined ? {} : { assetId: item.providerAssetId }),
    ...(item.providerVersion === undefined ? {} : { version: item.providerVersion }),
  };
}

export class AssignmentService {
  readonly #audit = new AuditWriter();
  readonly #maximumBytes: number;
  readonly #signedUrlTtlSeconds: number;
  readonly #storage: DocumentStorage;
  readonly #subjects = new SubjectService();

  public constructor(storage: DocumentStorage, maximumBytes: number, signedUrlTtlSeconds: number) {
    this.#storage = storage;
    this.#maximumBytes = maximumBytes;
    this.#signedUrlTtlSeconds = signedUrlTtlSeconds;
  }

  public async listForPrincipal(principal: PrincipalSummary): Promise<AssignmentDto[]> {
    let query: Record<string, unknown> = {};
    if (principal.accountType === 'STUDENT') {
      const student = await StudentModel.findOne({
        userId: principal.userId,
        lifecycleStatus: 'ACTIVE',
      }).lean();
      if (student === null) throw new NotFoundError();
      const enrollments = await EnrollmentModel.find({ studentId: student._id }).lean();
      const allowed: mongoose.Types.ObjectId[] = [];
      for (const enrollment of enrollments) {
        const curriculum = await this.#subjects.curriculumForEnrollment(enrollment._id.toString());
        const subjectIds = new Set(curriculum.map(({ subject }) => subject.id));
        const candidate = await AssignmentModel.find({
          academicSessionId: enrollment.academicSessionId,
          classLevelId: enrollment.classLevelId,
          status: 'PUBLISHED',
          trackId: enrollment.trackId ?? { $exists: false },
        })
          .select('_id subjectId')
          .lean();
        allowed.push(
          ...candidate
            .filter((assignment) => subjectIds.has(assignment.subjectId.toString()))
            .map(({ _id }) => _id),
        );
      }
      query = { _id: { $in: allowed }, status: 'PUBLISHED' };
    } else if (!principal.permissions.includes('assignments.manage_all')) {
      query = await activeTeachingAssignmentFilter(principal.userId);
    }
    const records = await AssignmentModel.find(query)
      .populate('teacherId', 'firstName middleName lastName')
      .populate('subjectId', 'code name')
      .populate('classLevelId', 'code name')
      .populate('trackId', 'code name')
      .populate('academicSessionId', 'label')
      .sort({ publishedAt: -1, dueAt: 1 })
      .lean();
    const attachments = await AssignmentAttachmentModel.find({
      assignmentId: { $in: records.map(({ _id }) => _id) },
      status: 'ACTIVE',
    }).lean();
    return records.map((item) => {
      const teacher = item.teacherId as unknown as {
        _id: mongoose.Types.ObjectId;
        firstName: string;
        lastName: string;
        middleName?: string;
      };
      const subject = item.subjectId as unknown as {
        _id: mongoose.Types.ObjectId;
        code: string;
        name: string;
      };
      const classLevel = item.classLevelId as unknown as {
        _id: mongoose.Types.ObjectId;
        code: string;
        name: string;
      };
      const session = item.academicSessionId as unknown as {
        _id: mongoose.Types.ObjectId;
        label: string;
      };
      const track = item.trackId as unknown as
        { _id: mongoose.Types.ObjectId; code: string; name: string } | undefined;
      return {
        academicSession: { id: session._id.toString(), label: session.label },
        attachments: attachments
          .filter(({ assignmentId }) => assignmentId.toString() === item._id.toString())
          .map((attachment) => ({
            displayName: attachment.displayName,
            id: attachment._id.toString(),
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          })),
        classLevel: {
          code: classLevel.code,
          id: classLevel._id.toString(),
          name: classLevel.name,
        },
        createdAt: item.createdAt.toISOString(),
        dueAt: item.dueAt.toISOString(),
        id: item._id.toString(),
        instructions: item.instructions,
        status: item.status,
        subject: { code: subject.code, id: subject._id.toString(), name: subject.name },
        teacher: {
          id: teacher._id.toString(),
          name: [teacher.firstName, teacher.middleName, teacher.lastName].filter(Boolean).join(' '),
        },
        title: item.title,
        version: item.version,
        ...(item.publishedAt === undefined ? {} : { publishedAt: item.publishedAt.toISOString() }),
        ...(track === undefined
          ? {}
          : { track: { code: track.code, id: track._id.toString(), name: track.name } }),
      };
    });
  }

  public async create(input: {
    actorUserId: string;
    dueAt: string;
    instructions: string;
    requestId: string;
    teachingAssignmentId: string;
    title: string;
  }): Promise<string> {
    const teacher = await TeacherModel.findOne({
      userId: input.actorUserId,
      status: 'ACTIVE',
    }).lean();
    const scope = await TeachingAssignmentModel.findOne({
      _id: input.teachingAssignmentId,
      status: 'ACTIVE',
      ...(teacher === null ? { _id: null } : { teacherId: teacher._id }),
    }).lean();
    if (teacher === null || scope === null) throw new AuthorizationError();
    const assignment = await AssignmentModel.create({
      academicSessionId: scope.academicSessionId,
      classLevelId: scope.classLevelId,
      createdByUserId: input.actorUserId,
      dueAt: new Date(input.dueAt),
      instructions: input.instructions,
      status: 'DRAFT',
      subjectId: scope.subjectId,
      teacherId: teacher._id,
      teachingAssignmentId: scope._id,
      title: input.title,
      ...(scope.trackId === undefined ? {} : { trackId: scope.trackId }),
    });
    await this.#audit.append({
      action: 'ASSIGNMENT_CREATED',
      actorType: 'USER',
      actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
      outcome: 'SUCCESS',
      requestId: input.requestId,
      targetId: assignment._id.toString(),
      targetType: 'Assignment',
    });
    return assignment._id.toString();
  }

  public async update(input: {
    actor: PrincipalSummary;
    assignmentId: string;
    dueAt?: string;
    instructions?: string;
    title?: string;
  }): Promise<void> {
    const query: Record<string, unknown> = { _id: input.assignmentId, status: 'DRAFT' };
    if (!input.actor.permissions.includes('assignments.manage_all')) {
      query.createdByUserId = input.actor.userId;
      Object.assign(query, await activeTeachingAssignmentFilter(input.actor.userId));
    }
    const changes: Record<string, unknown> = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.instructions !== undefined) changes.instructions = input.instructions;
    if (input.dueAt !== undefined) changes.dueAt = new Date(input.dueAt);
    const result = await AssignmentModel.updateOne(query, { $set: changes });
    if (result.matchedCount !== 1) throw new NotFoundError();
  }

  public async publish(input: {
    actor: PrincipalSummary;
    assignmentId: string;
    requestId: string;
  }): Promise<void> {
    const query: Record<string, unknown> = { _id: input.assignmentId, status: 'DRAFT' };
    if (!input.actor.permissions.includes('assignments.manage_all')) {
      query.createdByUserId = input.actor.userId;
      Object.assign(query, await activeTeachingAssignmentFilter(input.actor.userId));
    }
    const publicationCandidate = await AssignmentModel.findOne(query).lean();
    if (publicationCandidate === null) throw new NotFoundError();
    const [recipientUserIds, subject] = await Promise.all([
      this.#recipientUserIds(publicationCandidate),
      SubjectModel.findById(publicationCandidate.subjectId).select({ name: 1 }).lean(),
    ]);
    await mongoose.connection.transaction(async (session) => {
      const draft = await AssignmentModel.findOne(query).session(session).lean();
      if (draft === null) throw new NotFoundError();
      if (!input.actor.permissions.includes('assignments.manage_all')) {
        const activeScope = await TeachingAssignmentModel.exists({
          _id: draft.teachingAssignmentId,
          status: 'ACTIVE',
          teacherId: draft.teacherId,
        }).session(session);
        if (activeScope === null)
          throw new ConflictError('The teaching assignment is no longer active.');
      }
      const assignment = await AssignmentModel.findOneAndUpdate(
        query,
        { $set: { publishedAt: new Date(), status: 'PUBLISHED' } },
        { new: true, session },
      );
      if (assignment === null) throw new NotFoundError();
      await this.#audit.append(
        {
          action: 'ASSIGNMENT_PUBLISHED',
          actorType: 'USER',
          actorUserId: new mongoose.Types.ObjectId(input.actor.userId),
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: assignment._id.toString(),
          targetType: 'Assignment',
        },
        session,
      );
      await OutboxEventModel.create(
        [
          {
            aggregateId: assignment._id.toString(),
            aggregateType: 'Assignment',
            eventId: `assignment:${assignment._id.toString()}:published`,
            eventType: 'ASSIGNMENT_PUBLISHED',
            occurredAt: new Date(),
            payload: {
              academicSessionId: assignment.academicSessionId.toString(),
              classLevelId: assignment.classLevelId.toString(),
            },
            status: 'PENDING',
            transactionActorId: new mongoose.Types.ObjectId(input.actor.userId),
          },
        ],
        { session },
      );
      await createNotifications(
        recipientUserIds.map((userId) => ({
          body: `${assignment.title} has been published for ${subject?.name ?? 'your subject'}.`,
          deduplicationKey: `assignment:${assignment._id.toString()}:published:${userId}`,
          recipientUserId: userId,
          resourceId: assignment._id.toString(),
          resourceType: 'Assignment',
          sourceEventId: `assignment:${assignment._id.toString()}:published`,
          title: 'New assignment',
          type: 'ASSIGNMENT_PUBLISHED',
        })),
        session,
      );
    });
  }

  public async archive(input: {
    actor: PrincipalSummary;
    assignmentId: string;
    requestId: string;
  }): Promise<void> {
    const query: Record<string, unknown> = { _id: input.assignmentId, status: { $ne: 'ARCHIVED' } };
    if (!input.actor.permissions.includes('assignments.manage_all')) {
      query.createdByUserId = input.actor.userId;
      Object.assign(query, await activeTeachingAssignmentFilter(input.actor.userId));
    }
    const result = await AssignmentModel.updateOne(query, { $set: { status: 'ARCHIVED' } });
    if (result.modifiedCount !== 1) throw new NotFoundError();
    await this.#audit.append({
      action: 'ASSIGNMENT_ARCHIVED',
      actorType: 'USER',
      actorUserId: new mongoose.Types.ObjectId(input.actor.userId),
      outcome: 'SUCCESS',
      requestId: input.requestId,
      targetId: input.assignmentId,
      targetType: 'Assignment',
    });
  }

  public async uploadAttachment(input: {
    actor: PrincipalSummary;
    assignmentId: string;
    body: Buffer;
    displayName: string;
    mimeType: string;
    requestId: string;
  }): Promise<string> {
    const scope = input.actor.permissions.includes('assignments.manage_all')
      ? {}
      : await activeTeachingAssignmentFilter(input.actor.userId);
    const assignment = await AssignmentModel.findOne({ _id: input.assignmentId, ...scope }).lean();
    if (assignment?.status !== 'DRAFT')
      throw new ConflictError('Attachments can be changed only while the assignment is a draft.');
    const owns = assignment.createdByUserId.toString() === input.actor.userId;
    if (!owns && !input.actor.permissions.includes('assignments.manage_all'))
      throw new AuthorizationError();
    const mimeType = validateDocumentUpload({
      acceptedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      body: input.body,
      declaredMimeType: input.mimeType,
      maximumBytes: this.#maximumBytes,
    });
    const id = new mongoose.Types.ObjectId();
    const stored = await this.#storage.put({
      body: input.body,
      key: `private/assignment-attachments/${assignment._id.toString()}/${id.toString()}/${randomUUID()}.${documentExtensionFor(mimeType)}`,
      mimeType,
    });
    try {
      const attachment = await AssignmentAttachmentModel.create({
        _id: id,
        assignmentId: assignment._id,
        checksumSha256: createHash('sha256').update(input.body).digest('hex'),
        displayName: sanitizeDocumentFilename(input.displayName),
        mimeType,
        provider: stored.provider,
        providerDeliveryType: stored.deliveryType,
        providerFormat: stored.format,
        providerPublicId: stored.publicId,
        providerResourceType: stored.resourceType,
        sizeBytes: stored.bytes,
        status: 'ACTIVE',
        uploadedByUserId: input.actor.userId,
        ...(stored.assetId === undefined ? {} : { providerAssetId: stored.assetId }),
        ...(stored.version === undefined ? {} : { providerVersion: stored.version }),
      });
      await this.#audit.append({
        action: 'ASSIGNMENT_ATTACHMENT_UPLOADED',
        actorType: 'USER',
        actorUserId: new mongoose.Types.ObjectId(input.actor.userId),
        outcome: 'SUCCESS',
        requestId: input.requestId,
        targetId: attachment._id.toString(),
        targetType: 'AssignmentAttachment',
      });
      return attachment._id.toString();
    } catch (error) {
      await this.#storage.remove(stored).catch(() => undefined);
      throw error;
    }
  }

  public async attachmentAccess(
    attachmentId: string,
    principal: PrincipalSummary,
  ): Promise<StudentDocumentAccessDto> {
    const attachment = await AssignmentAttachmentModel.findOne({
      _id: attachmentId,
      status: 'ACTIVE',
    }).select('+providerAssetId +providerPublicId');
    if (attachment === null) throw new NotFoundError();
    const visibleAssignments = await this.listForPrincipal(principal);
    if (!visibleAssignments.some(({ id }) => id === attachment.assignmentId.toString()))
      throw new NotFoundError();
    const expiresAt = new Date(Date.now() + this.#signedUrlTtlSeconds * 1000);
    const access = await this.#storage.createSignedAccess(
      attachmentStorageObject(attachment),
      expiresAt,
    );
    return access === null
      ? { delivery: 'PROXY' }
      : { delivery: 'SIGNED', expiresAt: access.expiresAt.toISOString(), url: access.url };
  }

  public async downloadAttachment(
    attachmentId: string,
    principal: PrincipalSummary,
  ): Promise<{ displayName: string; stored: StoredDocument }> {
    const attachment = await AssignmentAttachmentModel.findOne({
      _id: attachmentId,
      status: 'ACTIVE',
    }).select('+providerAssetId +providerPublicId');
    if (attachment === null) throw new NotFoundError();
    const visibleAssignments = await this.listForPrincipal(principal);
    if (!visibleAssignments.some(({ id }) => id === attachment.assignmentId.toString()))
      throw new NotFoundError();
    return {
      displayName: attachment.displayName,
      stored: await this.#storage.get(attachmentStorageObject(attachment), attachment.mimeType),
    };
  }

  async #recipientUserIds(assignment: {
    academicSessionId: mongoose.Types.ObjectId;
    classLevelId: mongoose.Types.ObjectId;
    subjectId: mongoose.Types.ObjectId;
    trackId?: mongoose.Types.ObjectId;
  }): Promise<string[]> {
    const enrollments = await EnrollmentModel.find({
      academicSessionId: assignment.academicSessionId,
      classLevelId: assignment.classLevelId,
      status: 'ACTIVE',
      ...(assignment.trackId === undefined
        ? { trackId: { $exists: false } }
        : { trackId: assignment.trackId }),
    })
      .select({ _id: 1, studentId: 1 })
      .lean();
    const eligibleStudentIds: mongoose.Types.ObjectId[] = [];
    for (const enrollment of enrollments) {
      const curriculum = await this.#subjects.curriculumForEnrollment(enrollment._id.toString());
      if (curriculum.some(({ subject }) => subject.id === assignment.subjectId.toString())) {
        eligibleStudentIds.push(enrollment.studentId);
      }
    }
    const students = await StudentModel.find({
      _id: { $in: eligibleStudentIds },
      lifecycleStatus: 'ACTIVE',
    })
      .select({ userId: 1 })
      .lean();
    return [...new Set(students.map(({ userId }) => userId.toString()))];
  }
}
