import { randomUUID } from 'node:crypto';

import type {
  ProfileCorrectionRequestDto,
  StudentDashboardDto,
  StudentDirectoryItemDto,
  StudentProfileDto,
} from '@onyx/contracts';
import mongoose from 'mongoose';

import { ConflictError, NotFoundError, ValidationError } from '../../../app/errors/app-error.js';
import {
  AcademicSessionModel,
  ClassLevelModel,
  SchoolSettingsModel,
  TermModel,
  TrackModel,
} from '../../academics/infrastructure/academic-models.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import { StudentDocumentModel } from '../../documents/infrastructure/document-models.js';
import { EnrollmentModel } from '../../enrollments/infrastructure/enrollment-model.js';
import { teacherEnrollmentFilter } from '../../teachers/application/teaching-scope-policy.js';
import {
  GuardianModel,
  StudentGuardianModel,
} from '../../guardians/infrastructure/guardian-models.js';
import { OutboxEventModel } from '../../system/infrastructure/system-models.js';
import {
  ProfileCorrectionRequestModel,
  StudentMedicalProfileModel,
  StudentModel,
} from '../infrastructure/student-models.js';

const correctableFields = [
  'surname',
  'firstName',
  'middleName',
  'dateOfBirth',
  'gender',
  'nationality',
  'stateOfOrigin',
  'lga',
  'residentialAddress',
] as const;
type CorrectableField = (typeof correctableFields)[number];

function correctionDto(item: {
  _id: { toString(): string };
  createdAt: Date;
  field: string;
  reason: string;
  requestedValue: string;
  reviewReason?: string | null;
  status: 'APPROVED' | 'REJECTED' | 'SUBMITTED' | 'UNDER_REVIEW';
}): ProfileCorrectionRequestDto {
  return {
    createdAt: item.createdAt.toISOString(),
    field: item.field,
    id: item._id.toString(),
    reason: item.reason,
    requestedValue: item.requestedValue,
    status: item.status,
    ...(item.reviewReason == null ? {} : { reviewReason: item.reviewReason }),
  };
}

export class StudentService {
  readonly #audit = new AuditWriter();

  async #resolveStudent(userId: string) {
    const student = await StudentModel.findOne({ userId }).lean();
    if (student === null) throw new NotFoundError();
    return student;
  }

  public async dashboardForUser(userId: string): Promise<StudentDashboardDto> {
    const student = await this.#resolveStudent(userId);
    const settings = await SchoolSettingsModel.findOne({ singletonKey: 'SCHOOL' }).lean();
    const enrollment =
      settings?.currentAcademicSessionId === undefined
        ? null
        : await EnrollmentModel.findOne({
            studentId: student._id,
            academicSessionId: settings.currentAcademicSessionId,
          }).lean();
    const [session, term, classLevel, track] = await Promise.all([
      enrollment === null
        ? null
        : AcademicSessionModel.findById(enrollment.academicSessionId).lean(),
      settings?.currentTermId === undefined
        ? null
        : TermModel.findById(settings.currentTermId).lean(),
      enrollment === null ? null : ClassLevelModel.findById(enrollment.classLevelId).lean(),
      enrollment?.trackId === undefined ? null : TrackModel.findById(enrollment.trackId).lean(),
    ]);
    return {
      lifecycleStatus: student.lifecycleStatus,
      passportDocumentId: student.passportDocumentId.toString(),
      studentId: student.studentId,
      studentName: [student.firstName, student.middleName, student.surname]
        .filter(Boolean)
        .join(' '),
      ...(enrollment === null || session === null || classLevel === null
        ? {}
        : {
            currentEnrollment: {
              classLevel: {
                code: classLevel.code,
                id: classLevel._id.toString(),
                name: classLevel.name,
                stage: classLevel.stage,
              },
              session: { id: session._id.toString(), label: session.label },
              ...(track === null
                ? {}
                : { track: { code: track.code, id: track._id.toString(), name: track.name } }),
            },
          }),
      ...(term === null ? {} : { currentTerm: { id: term._id.toString(), name: term.name } }),
    };
  }

  public async profileForUser(userId: string): Promise<StudentProfileDto> {
    const student = await this.#resolveStudent(userId);
    return this.#profile(student._id.toString(), true);
  }

  public async profileForAdmin(
    studentId: string,
    includeSensitive: boolean,
    teacherUserId?: string,
  ): Promise<StudentProfileDto> {
    if (teacherUserId !== undefined) {
      const scope = await teacherEnrollmentFilter(teacherUserId);
      if ((await EnrollmentModel.exists({ $and: [{ studentId }, scope] })) === null)
        throw new NotFoundError();
    }
    return this.#profile(studentId, includeSensitive);
  }

  async #profile(studentRecordId: string, includeMedical: boolean): Promise<StudentProfileDto> {
    const student = await StudentModel.findById(studentRecordId).lean();
    if (student === null) throw new NotFoundError();
    const [dashboard, enrollments, links, documents, corrections, medical] = await Promise.all([
      this.dashboardForUser(student.userId.toString()),
      EnrollmentModel.find({ studentId: student._id }).sort({ enrolledAt: -1 }).lean(),
      StudentGuardianModel.find({ studentId: student._id }).lean(),
      StudentDocumentModel.find({
        studentId: student._id,
        status: 'ACTIVE',
        uploadStatus: 'AVAILABLE',
      })
        .sort({ createdAt: -1 })
        .lean(),
      ProfileCorrectionRequestModel.find({ studentId: student._id }).sort({ createdAt: -1 }).lean(),
      includeMedical
        ? StudentMedicalProfileModel.findOne({ studentId: student._id }).lean()
        : Promise.resolve(null),
    ]);
    const [sessions, levels, tracks, guardians] = await Promise.all([
      AcademicSessionModel.find({
        _id: { $in: enrollments.map(({ academicSessionId }) => academicSessionId) },
      }).lean(),
      ClassLevelModel.find({
        _id: { $in: enrollments.map(({ classLevelId }) => classLevelId) },
      }).lean(),
      TrackModel.find({
        _id: {
          $in: enrollments.flatMap(({ trackId }) => (trackId === undefined ? [] : [trackId])),
        },
      }).lean(),
      GuardianModel.find({ _id: { $in: links.map(({ guardianId }) => guardianId) } }).lean(),
    ]);
    const sessionById = new Map(sessions.map((item) => [item._id.toString(), item]));
    const levelById = new Map(levels.map((item) => [item._id.toString(), item]));
    const trackById = new Map(tracks.map((item) => [item._id.toString(), item]));
    const guardianById = new Map(guardians.map((item) => [item._id.toString(), item]));
    return {
      ...dashboard,
      biodata: {
        dateOfBirth: student.dateOfBirth,
        firstName: student.firstName,
        gender: student.gender,
        nationality: student.nationality,
        residentialAddress: student.residentialAddress,
        surname: student.surname,
        ...(student.middleName === undefined ? {} : { middleName: student.middleName }),
        ...(student.stateOfOrigin === undefined ? {} : { stateOfOrigin: student.stateOfOrigin }),
        ...(student.lga === undefined ? {} : { lga: student.lga }),
      },
      guardians: links.flatMap((link) => {
        const guardian = guardianById.get(link.guardianId.toString());
        return guardian === undefined
          ? []
          : [
              {
                emergencyContact: link.emergencyContact,
                fullName: guardian.fullName,
                phone: guardian.phone,
                primary: link.primary,
                relationship: link.relationship,
              },
            ];
      }),
      academicHistory: enrollments.flatMap((enrollment) => {
        const session = sessionById.get(enrollment.academicSessionId.toString());
        const level = levelById.get(enrollment.classLevelId.toString());
        const track =
          enrollment.trackId === undefined
            ? undefined
            : trackById.get(enrollment.trackId.toString());
        return session === undefined || level === undefined
          ? []
          : [
              {
                classLevel: {
                  code: level.code,
                  id: level._id.toString(),
                  name: level.name,
                  stage: level.stage,
                },
                id: enrollment._id.toString(),
                session: { id: session._id.toString(), label: session.label },
                status: enrollment.status,
                ...(track === undefined
                  ? {}
                  : { track: { code: track.code, id: track._id.toString(), name: track.name } }),
              },
            ];
      }),
      documents: documents.map((document) => ({
        createdAt: document.createdAt.toISOString(),
        displayName: document.displayName,
        documentRequirementId: document.documentRequirementId.toString(),
        id: document._id.toString(),
        mimeType: document.mimeType,
        reviewStatus: document.reviewStatus,
        sizeBytes: document.sizeBytes,
        version: document.versionNumber,
        ...(document.reviewNote === undefined ? {} : { reviewNote: document.reviewNote }),
      })),
      correctionRequests: corrections.map(correctionDto),
      ...(medical === null
        ? {}
        : {
            medical: Object.fromEntries(
              Object.entries({
                allergies: medical.allergies,
                bloodGroup: medical.bloodGroup,
                emergencyInstructions: medical.emergencyInstructions,
                genotype: medical.genotype,
                medicalConditions: medical.medicalConditions,
                medications: medical.medications,
              }).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === 'string' && entry[1] !== '',
              ),
            ),
          }),
    };
  }

  public async createCorrection(input: {
    field: string;
    reason: string;
    requestedValue: string;
    requestId: string;
    userId: string;
  }): Promise<ProfileCorrectionRequestDto> {
    if (!correctableFields.includes(input.field as CorrectableField))
      throw new ValidationError(
        'That field cannot be changed through a profile correction request.',
      );
    const student = await this.#resolveStudent(input.userId);
    const field = input.field as CorrectableField;
    const requestedValue = input.requestedValue.trim();
    if (field === 'dateOfBirth') {
      const parsed = /^\d{4}-\d{2}-\d{2}$/u.test(requestedValue)
        ? new Date(requestedValue + 'T00:00:00.000Z')
        : null;
      if (
        parsed === null ||
        Number.isNaN(parsed.valueOf()) ||
        parsed.toISOString().slice(0, 10) !== requestedValue
      ) {
        throw new ValidationError('Enter a valid date of birth in YYYY-MM-DD format.');
      }
    }
    const beforeValue = student[field] ?? '';
    if (beforeValue === requestedValue)
      throw new ConflictError('The requested value is already current.');
    const existing = await ProfileCorrectionRequestModel.exists({
      field,
      status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] },
      studentId: student._id,
    });
    if (existing !== null)
      throw new ConflictError('A correction for this field is already awaiting review.');
    return mongoose.connection.transaction(async (session) => {
      const [correction] = await ProfileCorrectionRequestModel.create(
        [
          {
            beforeValue,
            field,
            reason: input.reason.trim(),
            requestedValue,
            requesterUserId: student.userId,
            status: 'SUBMITTED',
            studentId: student._id,
          },
        ],
        { session },
      );
      if (correction === undefined) throw new Error('Profile correction creation failed.');
      await this.#audit.append(
        {
          action: 'PROFILE_CORRECTION_REQUESTED',
          actorType: 'USER',
          actorUserId: student.userId,
          changes: { field },
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: correction._id.toString(),
          targetType: 'ProfileCorrectionRequest',
        },
        session,
      );
      await OutboxEventModel.create(
        [
          {
            aggregateId: correction._id.toString(),
            aggregateType: 'ProfileCorrectionRequest',
            eventId: randomUUID(),
            eventType: 'ProfileCorrectionRequested',
            occurredAt: new Date(),
            payload: { correctionId: correction._id.toString(), studentId: student._id.toString() },
            status: 'PENDING',
            transactionActorId: student.userId,
          },
        ],
        { session },
      );
      return correctionDto(correction);
    });
  }

  public async listCorrections(status?: string): Promise<ProfileCorrectionRequestDto[]> {
    const allowed = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] as const;
    const selected = allowed.find((item) => item === status);
    const items = await ProfileCorrectionRequestModel.find(
      selected === undefined ? {} : { status: selected },
    )
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();
    return items.map(correctionDto);
  }

  public async decideCorrection(input: {
    action: 'APPROVE' | 'REJECT';
    actorUserId: string;
    correctionId: string;
    reason: string;
    requestId: string;
  }): Promise<ProfileCorrectionRequestDto> {
    const actor = new mongoose.Types.ObjectId(input.actorUserId);
    return mongoose.connection.transaction(async (session) => {
      const correction = await ProfileCorrectionRequestModel.findOne({
        _id: input.correctionId,
        status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] },
      }).session(session);
      if (correction === null) {
        const exists = await ProfileCorrectionRequestModel.exists({
          _id: input.correctionId,
        }).session(session);
        if (exists === null) throw new NotFoundError();
        throw new ConflictError('This correction request has already been decided.');
      }
      if (input.action === 'APPROVE') {
        const student = await StudentModel.findById(correction.studentId).session(session);
        if (student === null) throw new NotFoundError();
        const field = correction.field as CorrectableField;
        if ((student[field] ?? '') !== correction.beforeValue) {
          throw new ConflictError(
            'The authoritative value changed after this request was submitted. Review a new request.',
          );
        }
        if (
          field === 'nationality' &&
          correction.requestedValue.toLocaleLowerCase('en-NG') === 'nigerian' &&
          ((student.stateOfOrigin ?? '') === '' || (student.lga ?? '') === '')
        ) {
          throw new ConflictError(
            'State of origin and LGA must be established before nationality can be changed to Nigerian.',
          );
        }
        student.set(field, correction.requestedValue);
        await student.save({ session });
      }
      correction.status = input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      correction.reviewerUserId = actor;
      correction.reviewedAt = new Date();
      correction.reviewReason = input.reason;
      if (input.action === 'APPROVE') correction.appliedAt = new Date();
      await correction.save({ session });
      await this.#audit.append(
        {
          action:
            input.action === 'APPROVE'
              ? 'PROFILE_CORRECTION_APPROVED'
              : 'PROFILE_CORRECTION_REJECTED',
          actorType: 'USER',
          actorUserId: actor,
          changes: {
            after: input.action === 'APPROVE' ? correction.requestedValue : undefined,
            before: correction.beforeValue,
            field: correction.field,
          },
          outcome: 'SUCCESS',
          reason: input.reason,
          requestId: input.requestId,
          targetId: correction._id.toString(),
          targetType: 'ProfileCorrectionRequest',
        },
        session,
      );
      await OutboxEventModel.create(
        [
          {
            aggregateId: correction._id.toString(),
            aggregateType: 'ProfileCorrectionRequest',
            eventId: randomUUID(),
            eventType:
              input.action === 'APPROVE'
                ? 'ProfileCorrectionApproved'
                : 'ProfileCorrectionRejected',
            occurredAt: new Date(),
            payload: {
              correctionId: correction._id.toString(),
              userId: correction.requesterUserId.toString(),
            },
            status: 'PENDING',
            transactionActorId: actor,
          },
        ],
        { session },
      );
      return correctionDto(correction);
    });
  }

  public async directory(filters: {
    classLevelId?: string;
    cursor?: string;
    gender?: string;
    q?: string;
    sessionId?: string;
    status?: string;
    trackId?: string;
    teacherUserId?: string;
  }): Promise<{ items: StudentDirectoryItemDto[]; nextCursor?: string }> {
    const enrollmentFilter: Record<string, unknown> =
      filters.teacherUserId === undefined
        ? {}
        : await teacherEnrollmentFilter(filters.teacherUserId);
    if (filters.sessionId !== undefined) enrollmentFilter.academicSessionId = filters.sessionId;
    if (filters.classLevelId !== undefined) enrollmentFilter.classLevelId = filters.classLevelId;
    if (filters.trackId !== undefined) enrollmentFilter.trackId = filters.trackId;
    const enrollments = await EnrollmentModel.find(enrollmentFilter).lean();
    const enrollmentByStudent = new Map(
      enrollments.map((item) => [item.studentId.toString(), item]),
    );
    const query: Record<string, unknown> = {};
    if (Object.keys(enrollmentFilter).length > 0)
      query._id = { $in: enrollments.map(({ studentId }) => studentId) };
    if (filters.cursor !== undefined && mongoose.isValidObjectId(filters.cursor)) {
      const existingIdFilter = typeof query._id === 'object' && query._id !== null ? query._id : {};
      query._id = {
        ...existingIdFilter,
        $gt: new mongoose.Types.ObjectId(filters.cursor),
      };
    }
    if (filters.gender !== undefined) query.gender = filters.gender;
    if (filters.status !== undefined) query.lifecycleStatus = filters.status;
    if (filters.q !== undefined && filters.q.trim() !== '') {
      const safe = filters.q
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
        .slice(0, 100);
      query.$or = [
        { firstName: new RegExp(safe, 'iu') },
        { surname: new RegExp(safe, 'iu') },
        { studentId: new RegExp(`^${safe}`, 'iu') },
      ];
    }
    const students = await StudentModel.find(query).sort({ _id: 1 }).limit(26).lean();
    const page = students.slice(0, 25);
    const placementIds = page.flatMap((student) => {
      const enrollment = enrollmentByStudent.get(student._id.toString());
      return enrollment === undefined
        ? []
        : [
            enrollment.classLevelId,
            ...(enrollment.trackId === undefined ? [] : [enrollment.trackId]),
          ];
    });
    const [levels, tracks] = await Promise.all([
      ClassLevelModel.find({ _id: { $in: placementIds } }).lean(),
      TrackModel.find({ _id: { $in: placementIds } }).lean(),
    ]);
    const names = new Map([
      ...levels.map((item) => [item._id.toString(), item.name] as const),
      ...tracks.map((item) => [item._id.toString(), item.name] as const),
    ]);
    const items = page.map((student) => {
      const enrollment = enrollmentByStudent.get(student._id.toString());
      const classLevel =
        enrollment === undefined ? undefined : names.get(enrollment.classLevelId.toString());
      const track =
        enrollment?.trackId === undefined ? undefined : names.get(enrollment.trackId.toString());
      return {
        gender: student.gender,
        id: student._id.toString(),
        lifecycleStatus: student.lifecycleStatus,
        name: [student.firstName, student.middleName, student.surname].filter(Boolean).join(' '),
        studentId: student.studentId,
        ...(classLevel === undefined ? {} : { classLevel }),
        ...(track === undefined ? {} : { track }),
      };
    });
    const last = page.at(-1);
    return {
      items,
      ...(students.length <= 25 || last === undefined ? {} : { nextCursor: last._id.toString() }),
    };
  }

  public async updateProfileForAdmin(input: {
    actorUserId: string;
    biodata?: Partial<Record<CorrectableField, string | undefined>> | undefined;
    guardians?:
      | {
          emergencyContact?: boolean | undefined;
          fullName: string;
          phone: string;
          primary?: boolean | undefined;
          relationship: string;
        }[]
      | undefined;
    medical?:
      | {
          allergies?: string | undefined;
          bloodGroup?: string | undefined;
          emergencyInstructions?: string | undefined;
          genotype?: string | undefined;
          medicalConditions?: string | undefined;
          medications?: string | undefined;
        }
      | undefined;
    requestId: string;
    studentId: string;
  }): Promise<StudentProfileDto> {
    const actorId = new mongoose.Types.ObjectId(input.actorUserId);
    const student = await StudentModel.findById(input.studentId);
    if (student === null) throw new NotFoundError();

    const changes: Record<string, unknown> = {};

    await mongoose.connection.transaction(async (session) => {
      // 1. Update biodata fields
      if (input.biodata !== undefined) {
        for (const [key, val] of Object.entries(input.biodata)) {
          if (val !== undefined && correctableFields.includes(key as CorrectableField)) {
            const trimmed = val.trim();
            const current = (student.get(key) as string | undefined) ?? '';
            if (trimmed !== current) {
              changes[`biodata.${key}`] = { after: trimmed, before: current };
              student.set(key, trimmed);
            }
          }
        }
        await student.save({ session });
      }

      // 2. Update guardians if provided
      if (input.guardians !== undefined && input.guardians.length > 0) {
        for (const g of input.guardians) {
          const normPhone = g.phone.replace(/\D/gu, '');
          let guardian = await GuardianModel.findOne({
            $or: [{ phone: g.phone }, { normalizedPhone: normPhone }],
          }).session(session);
          if (guardian === null) {
            guardian = new GuardianModel({
              fullName: g.fullName.trim(),
              normalizedPhone: normPhone,
              phone: g.phone.trim(),
            });
            await guardian.save({ session });
          } else {
            guardian.fullName = g.fullName.trim();
            await guardian.save({ session });
          }

          await StudentGuardianModel.findOneAndUpdate(
            { guardianId: guardian._id, studentId: student._id },
            {
              $set: {
                emergencyContact: g.emergencyContact ?? true,
                primary: g.primary ?? true,
                relationship: g.relationship.trim(),
              },
            },
            { session, upsert: true },
          );
        }
        changes.guardians = { updatedCount: input.guardians.length };
      }

      // 3. Update medical profile if provided
      if (input.medical !== undefined) {
        const medicalClean: Record<string, string> = {};
        for (const [key, value] of Object.entries(input.medical)) {
          if (typeof value === 'string') {
            medicalClean[key] = value.trim();
          }
        }
        await StudentMedicalProfileModel.findOneAndUpdate(
          { studentId: student._id },
          { $set: medicalClean },
          { session, upsert: true },
        );
        changes.medical = medicalClean;
      }

      // 4. Audit log
      await this.#audit.append(
        {
          action: 'STUDENT_PROFILE_UPDATED',
          actorType: 'USER',
          actorUserId: actorId,
          changes,
          outcome: 'SUCCESS',
          reason: 'Administrator updated student profile',
          requestId: input.requestId,
          targetId: student._id.toString(),
          targetType: 'Student',
        },
        session,
      );
    });

    return this.profileForAdmin(input.studentId, true);
  }
}
