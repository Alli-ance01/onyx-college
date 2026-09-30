import type {
  ClassTeacherAssignmentDto,
  TeacherDto,
  TeacherInvitationDto,
  TeacherRegistrationDto,
  TeachingAssignmentDto,
} from '@onyx/contracts';
import mongoose from 'mongoose';

import { ConflictError, NotFoundError, ValidationError } from '../../../app/errors/app-error.js';
import { RoleModel } from '../../access-control/infrastructure/role-model.js';
import {
  AcademicSessionModel,
  ClassLevelModel,
  TrackModel,
} from '../../academics/infrastructure/academic-models.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import { normalizeEmail, normalizeUsername } from '../../identity/domain/identity-normalization.js';
import type { CredentialCrypto } from '../../identity/infrastructure/credential-crypto.js';
import { PasswordService } from '../../identity/infrastructure/password-service.js';
import { UserModel } from '../../identity/infrastructure/user-model.js';
import { SubjectModel } from '../../subjects/infrastructure/subject-models.js';
import { OutboxEventModel } from '../../system/infrastructure/system-models.js';
import {
  ClassTeacherAssignmentModel,
  TeacherInvitationModel,
  TeacherModel,
  TeacherRegistrationModel,
  TeachingAssignmentModel,
  type TeacherRecord,
  type TeacherRegistrationRecord,
} from '../infrastructure/teacher-models.js';

function teacherDto(item: {
  _id: mongoose.Types.ObjectId;
  email?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  phone?: string;
  staffId?: string;
  status: TeacherDto['status'];
  userId: mongoose.Types.ObjectId;
}): TeacherDto {
  return {
    firstName: item.firstName,
    id: item._id.toString(),
    lastName: item.lastName,
    status: item.status,
    userId: item.userId.toString(),
    ...(item.middleName === undefined ? {} : { middleName: item.middleName }),
    ...(item.email === undefined ? {} : { email: item.email }),
    ...(item.phone === undefined ? {} : { phone: item.phone }),
    ...(item.staffId === undefined ? {} : { staffId: item.staffId }),
  };
}

function registrationDto(item: {
  _id: mongoose.Types.ObjectId;
  address?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  phone?: string;
  qualifications?: string;
  status: TeacherRegistrationDto['status'];
  submittedAt?: Date;
  userId: mongoose.Types.ObjectId;
  version: number;
}): TeacherRegistrationDto {
  return {
    data: {
      firstName: item.firstName,
      lastName: item.lastName,
      ...(item.middleName === undefined ? {} : { middleName: item.middleName }),
      ...(item.phone === undefined ? {} : { phone: item.phone }),
      ...(item.address === undefined ? {} : { address: item.address }),
      ...(item.qualifications === undefined ? {} : { qualifications: item.qualifications }),
    },
    id: item._id.toString(),
    status: item.status,
    userId: item.userId.toString(),
    version: item.version,
    ...(item.submittedAt === undefined ? {} : { submittedAt: item.submittedAt.toISOString() }),
  };
}

export class TeacherService {
  readonly #audit = new AuditWriter();
  readonly #crypto: CredentialCrypto;
  readonly #passwords = new PasswordService();

  public constructor(crypto: CredentialCrypto) {
    this.#crypto = crypto;
  }

  public async listTeachers(status?: TeacherRecord['status']): Promise<TeacherDto[]> {
    const query = status === undefined ? {} : { status };
    const teachers = await TeacherModel.find(query).sort({ lastName: 1, firstName: 1 }).lean();
    return teachers.map(teacherDto);
  }

  public async getMine(userId: string): Promise<{
    registration: TeacherRegistrationDto;
    teacher: TeacherDto;
  }> {
    const [teacher, registration] = await Promise.all([
      TeacherModel.findOne({ userId }).lean(),
      TeacherRegistrationModel.findOne({ userId }).lean(),
    ]);
    if (teacher === null || registration === null) throw new NotFoundError();
    return { registration: registrationDto(registration), teacher: teacherDto(teacher) };
  }

  public async listRegistrations(
    status?: TeacherRegistrationRecord['status'],
  ): Promise<TeacherRegistrationDto[]> {
    const query = status === undefined ? {} : { status };
    const records = await TeacherRegistrationModel.find(query).sort({ submittedAt: 1 }).lean();
    return records.map(registrationDto);
  }

  public async listInvitations(): Promise<TeacherInvitationDto[]> {
    await TeacherInvitationModel.updateMany(
      { expiresAt: { $lte: new Date() }, status: 'PENDING' },
      { $set: { status: 'EXPIRED' } },
    );
    const invitations = await TeacherInvitationModel.find()
      .sort({ createdAt: -1 })
      .select('-tokenHash')
      .lean();
    return invitations.map((item) => ({
      createdAt: item.createdAt.toISOString(),
      email: item.email,
      expiresAt: item.expiresAt.toISOString(),
      id: item._id.toString(),
      invitedName: item.invitedName,
      status: item.status,
      ...(item.acceptedAt === undefined ? {} : { acceptedAt: item.acceptedAt.toISOString() }),
    }));
  }

  public async invite(input: {
    actorUserId: string;
    email: string;
    invitedName: string;
    requestId: string;
  }): Promise<{ invitation: TeacherInvitationDto; setupToken: string }> {
    const email = normalizeEmail(input.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
      throw new ValidationError('A valid email address is required.');
    if (
      (await TeacherInvitationModel.exists({
        email,
        status: 'PENDING',
        expiresAt: { $gt: new Date() },
      })) !== null
    )
      throw new ConflictError('An active invitation already exists for this address.');
    const token = this.#crypto.createOpaqueValue(32);
    const invitation = await TeacherInvitationModel.create({
      email,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedName: input.invitedName.trim(),
      issuedByUserId: input.actorUserId,
      status: 'PENDING',
      tokenHash: this.#crypto.hash(token, 'teacher-invitation'),
    });
    await this.#audit.append({
      action: 'TEACHER_INVITATION_CREATED',
      actorType: 'USER',
      actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
      outcome: 'SUCCESS',
      requestId: input.requestId,
      targetId: invitation._id.toString(),
      targetType: 'TeacherInvitation',
    });
    return {
      invitation: {
        createdAt: invitation.createdAt.toISOString(),
        email: invitation.email,
        expiresAt: invitation.expiresAt.toISOString(),
        id: invitation._id.toString(),
        invitedName: invitation.invitedName,
        status: invitation.status,
      },
      setupToken: token,
    };
  }

  public async revokeInvitation(input: {
    actorUserId: string;
    invitationId: string;
    reason: string;
    requestId: string;
  }): Promise<void> {
    const invitation = await TeacherInvitationModel.findOneAndUpdate(
      { _id: input.invitationId, status: 'PENDING' },
      { $set: { revokedAt: new Date(), status: 'REVOKED' } },
      { new: true },
    );
    if (invitation === null) throw new ConflictError('The invitation is no longer pending.');
    await this.#audit.append({
      action: 'TEACHER_INVITATION_REVOKED',
      actorType: 'USER',
      actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
      outcome: 'SUCCESS',
      reason: input.reason,
      requestId: input.requestId,
      targetId: invitation._id.toString(),
      targetType: 'TeacherInvitation',
    });
  }

  public async acceptInvitation(input: {
    address?: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    password: string;
    phone?: string;
    qualifications?: string;
    requestId: string;
    token: string;
    username: string;
  }): Promise<{ registrationId: string; username: string }> {
    const tokenHash = this.#crypto.hash(input.token, 'teacher-invitation');
    const invitation = await TeacherInvitationModel.findOne({ tokenHash }).select('+tokenHash');
    if (invitation?.status !== 'PENDING' || invitation.expiresAt <= new Date())
      throw new NotFoundError('This teacher setup link is invalid or expired.');
    const normalizedUsername = normalizeUsername(input.username);
    if (normalizedUsername.length < 3) throw new ValidationError('Username is too short.');
    const [passwordHash, teacherRole] = await Promise.all([
      this.#passwords.hash(input.password),
      RoleModel.findOne({ code: 'TEACHER', status: 'ACTIVE' }).lean(),
    ]);
    if (teacherRole === null) throw new ConflictError('Teacher access is not initialized.');
    try {
      return await mongoose.connection.transaction(async (session) => {
        const claimed = await TeacherInvitationModel.updateOne(
          { _id: invitation._id, status: 'PENDING', expiresAt: { $gt: new Date() } },
          { $set: { acceptedAt: new Date(), status: 'ACCEPTED' } },
          { session },
        );
        if (claimed.modifiedCount !== 1)
          throw new ConflictError('The invitation was already used.');
        const [user] = await UserModel.create(
          [
            {
              accountStatus: 'ACTIVE',
              accountType: 'TEACHER',
              email: invitation.email,
              normalizedEmail: normalizeEmail(invitation.email),
              normalizedUsername,
              passwordHash,
              roles: [teacherRole._id],
              username: input.username.trim(),
            },
          ],
          { session },
        );
        if (user === undefined) throw new Error('Teacher user creation failed.');
        const [registration] = await TeacherRegistrationModel.create(
          [
            {
              firstName: input.firstName,
              invitationId: invitation._id,
              lastName: input.lastName,
              status: 'SUBMITTED',
              submittedAt: new Date(),
              userId: user._id,
              ...(input.middleName === undefined ? {} : { middleName: input.middleName }),
              ...(input.phone === undefined ? {} : { phone: input.phone }),
              ...(input.address === undefined ? {} : { address: input.address }),
              ...(input.qualifications === undefined
                ? {}
                : { qualifications: input.qualifications }),
            },
          ],
          { session },
        );
        if (registration === undefined) throw new Error('Teacher registration creation failed.');
        const [teacher] = await TeacherModel.create(
          [
            {
              email: invitation.email,
              firstName: input.firstName,
              lastName: input.lastName,
              sourceInvitationId: invitation._id,
              sourceRegistrationId: registration._id,
              status: 'PENDING_APPROVAL',
              userId: user._id,
              ...(input.middleName === undefined ? {} : { middleName: input.middleName }),
              ...(input.phone === undefined ? {} : { phone: input.phone }),
            },
          ],
          { session },
        );
        if (teacher === undefined) throw new Error('Teacher profile creation failed.');
        await TeacherInvitationModel.updateOne(
          { _id: invitation._id },
          { $set: { resultingTeacherId: teacher._id, resultingUserId: user._id } },
          { session },
        );
        await this.#audit.append(
          {
            action: 'TEACHER_INVITATION_ACCEPTED',
            actorType: 'USER',
            actorUserId: user._id,
            outcome: 'SUCCESS',
            requestId: input.requestId,
            targetId: invitation._id.toString(),
            targetType: 'TeacherInvitation',
          },
          session,
        );
        return { registrationId: registration._id.toString(), username: user.username };
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'MongoServerError')
        throw new ConflictError('The account details are already in use.');
      throw error;
    }
  }

  public async createDirect(input: {
    actorUserId: string;
    email?: string;
    firstName: string;
    lastName: string;
    phone?: string;
    requestId: string;
    username: string;
  }): Promise<{ temporaryPassword: string; teacherId: string; username: string }> {
    const temporaryPassword = this.#crypto.createOpaqueValue(18);
    const passwordHash = await this.#passwords.hash(temporaryPassword);
    const role = await RoleModel.findOne({ code: 'TEACHER', status: 'ACTIVE' }).lean();
    if (role === null) throw new ConflictError('Teacher access is not initialized.');
    const normalizedUsername = normalizeUsername(input.username);
    try {
      const result = await mongoose.connection.transaction(async (session) => {
        const [user] = await UserModel.create(
          [
            {
              accountStatus: 'ACTIVE',
              accountType: 'TEACHER',
              mustChangePassword: true,
              normalizedUsername,
              passwordHash,
              roles: [role._id],
              username: input.username.trim(),
              ...(input.email === undefined
                ? {}
                : { email: input.email, normalizedEmail: normalizeEmail(input.email) }),
              ...(input.phone === undefined ? {} : { phone: input.phone }),
            },
          ],
          { session },
        );
        if (user === undefined) throw new Error('Teacher user creation failed.');
        const [registration] = await TeacherRegistrationModel.create(
          [
            {
              firstName: input.firstName,
              lastName: input.lastName,
              status: 'SUBMITTED',
              submittedAt: new Date(),
              userId: user._id,
              ...(input.phone === undefined ? {} : { phone: input.phone }),
            },
          ],
          { session },
        );
        if (registration === undefined) throw new Error('Teacher registration creation failed.');
        const [teacher] = await TeacherModel.create(
          [
            {
              firstName: input.firstName,
              lastName: input.lastName,
              sourceRegistrationId: registration._id,
              status: 'PENDING_APPROVAL',
              userId: user._id,
              ...(input.email === undefined ? {} : { email: input.email }),
              ...(input.phone === undefined ? {} : { phone: input.phone }),
            },
          ],
          { session },
        );
        if (teacher === undefined) throw new Error('Teacher profile creation failed.');
        await this.#audit.append(
          {
            action: 'TEACHER_STAFF_CREATED',
            actorType: 'USER',
            actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
            outcome: 'SUCCESS',
            requestId: input.requestId,
            targetId: teacher._id.toString(),
            targetType: 'Teacher',
          },
          session,
        );
        return teacher._id.toString();
      });
      return { teacherId: result, temporaryPassword, username: input.username.trim() };
    } catch (error) {
      if (error instanceof Error && error.name === 'MongoServerError')
        throw new ConflictError('The account details are already in use.');
      throw error;
    }
  }

  public async decideRegistration(input: {
    action: 'APPROVE' | 'REJECT';
    actorUserId: string;
    note: string;
    registrationId: string;
    requestId: string;
  }): Promise<TeacherRegistrationDto> {
    const registration = await TeacherRegistrationModel.findById(input.registrationId).lean();
    if (registration === null) throw new NotFoundError();
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(registration.status))
      throw new ConflictError('This teacher registration cannot be decided now.');
    const actorId = new mongoose.Types.ObjectId(input.actorUserId);
    await mongoose.connection.transaction(async (session) => {
      const status = input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      const changed = await TeacherRegistrationModel.updateOne(
        { _id: registration._id, status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } },
        {
          $set: {
            reviewedAt: new Date(),
            reviewedByUserId: actorId,
            reviewNote: input.note,
            status,
          },
        },
        { session },
      );
      if (changed.modifiedCount !== 1)
        throw new ConflictError('The registration changed before the decision completed.');
      await TeacherModel.updateOne(
        { sourceRegistrationId: registration._id, status: 'PENDING_APPROVAL' },
        {
          $set:
            input.action === 'APPROVE'
              ? { approvedAt: new Date(), approvedByUserId: actorId, status: 'ACTIVE' }
              : { status: 'INACTIVE' },
        },
        { session },
      );
      await this.#audit.append(
        {
          action: `TEACHER_REGISTRATION_${status}`,
          actorType: 'USER',
          actorUserId: actorId,
          outcome: 'SUCCESS',
          reason: input.note,
          requestId: input.requestId,
          targetId: registration._id.toString(),
          targetType: 'TeacherRegistration',
        },
        session,
      );
      await OutboxEventModel.create(
        [
          {
            aggregateId: registration._id.toString(),
            aggregateType: 'TeacherRegistration',
            eventId: `teacher-registration:${registration._id.toString()}:${status}`,
            eventType: `TEACHER_REGISTRATION_${status}`,
            occurredAt: new Date(),
            payload: { userId: registration.userId.toString() },
            status: 'PENDING',
            transactionActorId: actorId,
          },
        ],
        { session },
      );
    });
    const updated = await TeacherRegistrationModel.findById(registration._id).lean();
    if (updated === null) throw new Error('Teacher registration could not be reloaded.');
    return registrationDto(updated);
  }

  public async listAssignments(
    teacherId?: string,
  ): Promise<readonly (ClassTeacherAssignmentDto | TeachingAssignmentDto)[]> {
    const teachingQuery = teacherId === undefined ? {} : { teacherId };
    const [teaching, classTeaching] = await Promise.all([
      TeachingAssignmentModel.find(teachingQuery)
        .populate('teacherId', 'firstName middleName lastName')
        .populate('subjectId', 'code name')
        .populate('classLevelId', 'code name')
        .populate('trackId', 'code name')
        .populate('academicSessionId', 'label')
        .sort({ createdAt: -1 })
        .lean(),
      ClassTeacherAssignmentModel.find(teachingQuery)
        .populate('teacherId', 'firstName middleName lastName')
        .populate('classLevelId', 'code name')
        .populate('trackId', 'code name')
        .populate('academicSessionId', 'label')
        .sort({ createdAt: -1 })
        .lean(),
    ]);
    const mapBase = (item: (typeof classTeaching)[number]) => {
      const teacher = item.teacherId as unknown as {
        _id: mongoose.Types.ObjectId;
        firstName: string;
        lastName: string;
        middleName?: string;
      };
      const classLevel = item.classLevelId as unknown as {
        _id: mongoose.Types.ObjectId;
        code: string;
        name: string;
      };
      const academicSession = item.academicSessionId as unknown as {
        _id: mongoose.Types.ObjectId;
        label: string;
      };
      const track = item.trackId as unknown as
        { _id: mongoose.Types.ObjectId; code: string; name: string } | undefined;
      return {
        academicSession: { id: academicSession._id.toString(), label: academicSession.label },
        classLevel: {
          code: classLevel.code,
          id: classLevel._id.toString(),
          name: classLevel.name,
        },
        id: item._id.toString(),
        status: item.status,
        teacher: {
          id: teacher._id.toString(),
          name: [teacher.firstName, teacher.middleName, teacher.lastName].filter(Boolean).join(' '),
        },
        ...(track === undefined
          ? {}
          : { track: { code: track.code, id: track._id.toString(), name: track.name } }),
      };
    };
    return [
      ...teaching.map((item): TeachingAssignmentDto => {
        const subject = item.subjectId as unknown as {
          _id: mongoose.Types.ObjectId;
          code: string;
          name: string;
        };
        return {
          ...mapBase(item),
          subject: { code: subject.code, id: subject._id.toString(), name: subject.name },
          type: 'TEACHING',
        };
      }),
      ...classTeaching.map((item): ClassTeacherAssignmentDto => ({
        ...mapBase(item),
        type: 'CLASS_TEACHER',
      })),
    ];
  }

  public async assign(input: {
    academicSessionId: string;
    actorUserId: string;
    classLevelId: string;
    requestId: string;
    subjectId?: string;
    teacherId: string;
    trackId?: string;
    type: 'CLASS_TEACHER' | 'TEACHING';
  }): Promise<string> {
    const [teacher, academicSession, classLevel, track, subject] = await Promise.all([
      TeacherModel.findById(input.teacherId).lean(),
      AcademicSessionModel.findById(input.academicSessionId).lean(),
      ClassLevelModel.findById(input.classLevelId).lean(),
      input.trackId === undefined ? null : TrackModel.findById(input.trackId).lean(),
      input.subjectId === undefined ? null : SubjectModel.findById(input.subjectId).lean(),
    ]);
    if (teacher?.status !== 'ACTIVE' || academicSession === null || classLevel === null)
      throw new NotFoundError();
    if (classLevel.stage === 'SENIOR' && track === null)
      throw new ValidationError('Senior assignments require a valid track.');
    if (classLevel.stage === 'JUNIOR' && input.trackId !== undefined)
      throw new ValidationError('Junior assignments cannot have a track.');
    if (input.type === 'TEACHING' && subject?.status !== 'ACTIVE')
      throw new ValidationError('A teaching assignment requires an active subject.');
    const shared = {
      academicSessionId: academicSession._id,
      assignedByUserId: input.actorUserId,
      classLevelId: classLevel._id,
      normalizedTrackKey: track?._id.toString() ?? 'NONE',
      status: 'ACTIVE' as const,
      teacherId: teacher._id,
      ...(track === null ? {} : { trackId: track._id }),
    };
    try {
      let record: { _id: mongoose.Types.ObjectId };
      if (input.type === 'TEACHING') {
        if (subject === null) throw new ValidationError('Select an active subject.');
        record = await TeachingAssignmentModel.create({ ...shared, subjectId: subject._id });
      } else {
        record = await ClassTeacherAssignmentModel.create(shared);
      }
      await this.#audit.append({
        action:
          input.type === 'TEACHING' ? 'TEACHING_ASSIGNMENT_CREATED' : 'CLASS_TEACHER_ASSIGNED',
        actorType: 'USER',
        actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
        outcome: 'SUCCESS',
        requestId: input.requestId,
        targetId: record._id.toString(),
        targetType: input.type === 'TEACHING' ? 'TeachingAssignment' : 'ClassTeacherAssignment',
      });
      return record._id.toString();
    } catch (error) {
      if (error instanceof Error && error.name === 'MongoServerError')
        throw new ConflictError('This academic assignment already exists.');
      throw error;
    }
  }

  public async revokeAssignment(input: {
    actorUserId: string;
    assignmentId: string;
    reason: string;
    requestId: string;
    type: 'CLASS_TEACHER' | 'TEACHING';
  }): Promise<void> {
    const model = input.type === 'TEACHING' ? TeachingAssignmentModel : ClassTeacherAssignmentModel;
    const result = await model.updateOne(
      { _id: input.assignmentId, status: { $in: ['ACTIVE', 'PLANNED'] } },
      {
        $set: {
          revokedAt: new Date(),
          revokedByUserId: input.actorUserId,
          revocationReason: input.reason,
          status: 'REVOKED',
        },
      },
    );
    if (result.modifiedCount !== 1) throw new ConflictError('The assignment cannot be revoked.');
    await this.#audit.append({
      action: input.type === 'TEACHING' ? 'TEACHING_ASSIGNMENT_REVOKED' : 'CLASS_TEACHER_REVOKED',
      actorType: 'USER',
      actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
      outcome: 'SUCCESS',
      reason: input.reason,
      requestId: input.requestId,
      targetId: input.assignmentId,
      targetType: input.type === 'TEACHING' ? 'TeachingAssignment' : 'ClassTeacherAssignment',
    });
  }
}
