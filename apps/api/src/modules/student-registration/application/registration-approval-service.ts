import { randomUUID } from 'node:crypto';

import mongoose from 'mongoose';

import { ConflictError, NotFoundError } from '../../../app/errors/app-error.js';
import {
  AcademicSessionModel,
  ClassLevelModel,
  SchoolSettingsModel,
  TrackModel,
} from '../../academics/infrastructure/academic-models.js';
import { RoleModel } from '../../access-control/infrastructure/role-model.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import {
  DocumentRequirementModel,
  StudentDocumentModel,
} from '../../documents/infrastructure/document-models.js';
import { EnrollmentModel } from '../../enrollments/infrastructure/enrollment-model.js';
import {
  GuardianModel,
  StudentGuardianModel,
} from '../../guardians/infrastructure/guardian-models.js';
import { UserModel } from '../../identity/infrastructure/user-model.js';
import {
  StudentMedicalProfileModel,
  StudentModel,
} from '../../students/infrastructure/student-models.js';
import {
  OutboxEventModel,
  SequenceCounterModel,
} from '../../system/infrastructure/system-models.js';
import {
  formatStudentId,
  normalizeHumanName,
  normalizePhone,
  normalizeRegistrationData,
} from '../domain/registration-policy.js';
import { StudentRegistrationModel } from '../infrastructure/registration-models.js';

interface ApprovalInput {
  academicSessionId: string;
  actorUserId: string;
  classLevelId: string;
  idempotencyKey: string;
  registrationId: string;
  requestId: string;
  trackId?: string;
}

function required(value: string | undefined, field: string): string {
  if (value === undefined || value.trim() === '')
    throw new ConflictError(`The approved registration is missing ${field}.`);
  return value;
}

export class RegistrationApprovalService {
  readonly #audit = new AuditWriter();

  public async approve(
    input: ApprovalInput,
  ): Promise<{ enrollmentId: string; studentId: string; studentRecordId: string }> {
    const existing = await StudentRegistrationModel.findById(input.registrationId).lean();
    if (existing === null) throw new NotFoundError();
    if (existing.status === 'APPROVED') {
      if (
        existing.approvalIdempotencyKey !== input.idempotencyKey ||
        existing.approvedStudentId === undefined ||
        existing.approvedEnrollmentId === undefined
      )
        throw new ConflictError('This registration has already been approved.');
      const student = await StudentModel.findById(existing.approvedStudentId).lean();
      if (student === null) throw new Error('Approved registration is missing its Student record.');
      return {
        enrollmentId: existing.approvedEnrollmentId.toString(),
        studentId: student.studentId,
        studentRecordId: student._id.toString(),
      };
    }
    if (existing.status !== 'UNDER_REVIEW')
      throw new ConflictError('Only a registration under review can be approved.');
    const strongDuplicate = existing.duplicateCandidates.some(
      ({ confidence }) => confidence === 'STRONG',
    );
    if (strongDuplicate && existing.duplicateResolution !== 'CONFIRMED_DISTINCT')
      throw new ConflictError('The possible duplicate must be resolved before approval.');

    return mongoose.connection.transaction(async (session) => {
      const academicSession = await AcademicSessionModel.findOne({
        _id: input.academicSessionId,
        status: 'ACTIVE',
      })
        .session(session)
        .lean();
      const classLevel = await ClassLevelModel.findOne({
        _id: input.classLevelId,
        status: 'ACTIVE',
      })
        .session(session)
        .lean();
      const track =
        input.trackId === undefined
          ? null
          : await TrackModel.findOne({ _id: input.trackId, status: 'ACTIVE' })
              .session(session)
              .lean();
      const requirements = await DocumentRequirementModel.find({
        active: true,
        requiredForRegistration: true,
      })
        .session(session)
        .lean();
      const studentRole = await RoleModel.findOne({ code: 'STUDENT', status: 'ACTIVE' })
        .session(session)
        .lean();
      const settings = await SchoolSettingsModel.findOne({ singletonKey: 'SCHOOL' })
        .session(session)
        .lean();
      if (
        academicSession === null ||
        classLevel === null ||
        studentRole === null ||
        settings?.currentAcademicSessionId?.toString() !== academicSession._id.toString()
      ) {
        throw new ConflictError('The authoritative academic placement is incomplete.');
      }
      if (
        (classLevel.stage === 'SENIOR' && track === null) ||
        (classLevel.stage === 'JUNIOR' && input.trackId !== undefined)
      ) {
        throw new ConflictError(
          classLevel.stage === 'SENIOR'
            ? 'Senior placement requires a valid track.'
            : 'Junior placement must not include a track.',
        );
      }
      const verifiedDocuments = await StudentDocumentModel.find({
        registrationId: existing._id,
        reviewStatus: 'VERIFIED',
        status: 'ACTIVE',
        uploadStatus: 'AVAILABLE',
      })
        .select({ documentRequirementId: 1 })
        .session(session)
        .lean();
      const verifiedRequirementIds = new Set(
        verifiedDocuments.map(({ documentRequirementId }) => documentRequirementId.toString()),
      );
      if (requirements.some(({ _id }) => !verifiedRequirementIds.has(_id.toString()))) {
        throw new ConflictError(
          'All required registration documents must be verified before approval.',
        );
      }
      const registration = await StudentRegistrationModel.findOneAndUpdate(
        {
          _id: input.registrationId,
          status: 'UNDER_REVIEW',
          approvedStudentId: { $exists: false },
          $or: [
            { 'duplicateCandidates.confidence': { $ne: 'STRONG' } },
            { duplicateResolution: 'CONFIRMED_DISTINCT' },
          ],
        },
        { $set: { approvalIdempotencyKey: input.idempotencyKey } },
        { new: true, session },
      );
      if (registration === null)
        throw new ConflictError('The registration changed before approval could begin.');
      if ((await StudentModel.exists({ userId: registration.userId }).session(session)) !== null)
        throw new ConflictError('This account already has a Student profile.');
      const passportRequirement = requirements.find(({ code }) => code === 'PASSPORT_PHOTOGRAPH');
      if (passportRequirement === undefined)
        throw new Error('Passport document requirement is missing.');
      const passport = await StudentDocumentModel.findOne({
        registrationId: registration._id,
        documentRequirementId: passportRequirement._id,
        status: 'ACTIVE',
        reviewStatus: 'VERIFIED',
        uploadStatus: 'AVAILABLE',
      }).session(session);
      if (passport === null)
        throw new ConflictError('The passport photograph must be verified before approval.');
      const counter = await SequenceCounterModel.findOneAndUpdate(
        { key: 'STUDENT_ID' },
        { $inc: { value: 1 }, $setOnInsert: { key: 'STUDENT_ID' } },
        { new: true, upsert: true, session },
      );
      const permanentStudentId = formatStudentId(counter.value);
      const data = normalizeRegistrationData(registration.data);
      const student = new StudentModel({
        dateOfBirth: required(data.personal.dateOfBirth, 'date of birth'),
        firstName: required(data.personal.firstName, 'first name'),
        gender: required(data.personal.gender, 'gender'),
        lifecycleStatus: 'ACTIVE',
        nationality: required(data.personal.nationality, 'nationality'),
        passportDocumentId: passport._id,
        residentialAddress: required(data.contact.residentialAddress, 'residential address'),
        sourceRegistrationId: registration._id,
        studentId: permanentStudentId,
        surname: required(data.personal.surname, 'surname'),
        userId: registration.userId,
        ...(data.personal.lga === undefined ? {} : { lga: data.personal.lga }),
        ...(data.personal.middleName === undefined ? {} : { middleName: data.personal.middleName }),
        ...(data.personal.stateOfOrigin === undefined
          ? {}
          : { stateOfOrigin: data.personal.stateOfOrigin }),
      });
      await student.save({ session });

      const guardianPhone = normalizePhone(data.guardian.phone ?? '');
      const guardianCandidates = await GuardianModel.find({ normalizedPhone: guardianPhone })
        .select('+normalizedPhone')
        .session(session);
      let guardian = guardianCandidates.find(
        ({ fullName }) =>
          normalizeHumanName(fullName) === normalizeHumanName(data.guardian.fullName ?? ''),
      );
      if (guardian === undefined) {
        guardian = new GuardianModel({
          fullName: required(data.guardian.fullName, 'guardian name'),
          normalizedPhone: guardianPhone,
          phone: required(data.guardian.phone, 'guardian phone'),
          ...(data.guardian.address === undefined ? {} : { address: data.guardian.address }),
          ...(data.guardian.alternatePhone === undefined
            ? {}
            : { alternatePhone: data.guardian.alternatePhone }),
          ...(data.guardian.email === undefined
            ? {}
            : {
                email: data.guardian.email,
                normalizedEmail: data.guardian.email.trim().toLocaleLowerCase('en-NG'),
              }),
          ...(data.guardian.occupation === undefined
            ? {}
            : { occupation: data.guardian.occupation }),
        });
        await guardian.save({ session });
      }
      const guardianLink = new StudentGuardianModel({
        emergencyContact: data.guardian.emergencyContact ?? true,
        guardianId: guardian._id,
        primary: true,
        relationship: required(data.guardian.relationship, 'guardian relationship'),
        studentId: student._id,
      });
      await guardianLink.save({ session });
      const medicalData = Object.fromEntries(
        Object.entries(data.medical).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === 'string' && entry[1].trim() !== '',
        ),
      );
      if (Object.keys(medicalData).length > 0) {
        const medical = new StudentMedicalProfileModel({ ...medicalData, studentId: student._id });
        await medical.save({ session });
      }
      const enrollment = new EnrollmentModel({
        academicSessionId: academicSession._id,
        classLevelId: classLevel._id,
        enrolledAt: new Date(),
        placementSourceRegistrationId: registration._id,
        status: 'ACTIVE',
        studentId: student._id,
        ...(track === null ? {} : { trackId: track._id }),
      });
      await enrollment.save({ session });
      const userUpdate = await UserModel.updateOne(
        { _id: registration.userId, accountStatus: 'ACTIVE', accountType: 'APPLICANT' },
        { $set: { accountType: 'STUDENT' }, $addToSet: { roles: studentRole._id } },
        { session },
      );
      if (userUpdate.modifiedCount !== 1)
        throw new ConflictError('The applicant account is no longer eligible for activation.');
      await StudentDocumentModel.updateMany(
        { registrationId: registration._id, status: 'ACTIVE' },
        { $set: { studentId: student._id } },
        { session },
      );
      const now = new Date();
      const registrationUpdate = await StudentRegistrationModel.updateOne(
        { _id: registration._id, status: 'UNDER_REVIEW' },
        {
          $set: {
            approvedEnrollmentId: enrollment._id,
            approvedStudentId: student._id,
            status: 'APPROVED',
          },
          $unset: { decisionReason: 1 },
          $push: {
            reviewHistory: {
              action: 'APPROVED',
              actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
              at: now,
            },
          },
        },
        { session },
      );
      if (registrationUpdate.modifiedCount !== 1) {
        throw new ConflictError('The registration changed before approval could complete.');
      }
      const actor = new mongoose.Types.ObjectId(input.actorUserId);
      await this.#audit.append(
        {
          action: 'STUDENT_ID_ALLOCATED',
          actorType: 'USER',
          actorUserId: actor,
          changes: { studentId: permanentStudentId },
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: student._id.toString(),
          targetType: 'Student',
        },
        session,
      );
      await this.#audit.append(
        {
          action: 'INITIAL_ENROLLMENT_CREATED',
          actorType: 'USER',
          actorUserId: actor,
          changes: {
            academicSessionId: academicSession._id.toString(),
            classLevelId: classLevel._id.toString(),
            ...(track === null ? {} : { trackId: track._id.toString() }),
          },
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: enrollment._id.toString(),
          targetType: 'Enrollment',
        },
        session,
      );
      await this.#audit.append(
        {
          action: 'STUDENT_REGISTRATION_APPROVED',
          actorType: 'USER',
          actorUserId: actor,
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: registration._id.toString(),
          targetType: 'StudentRegistration',
        },
        session,
      );
      await OutboxEventModel.create(
        [
          {
            aggregateId: registration._id.toString(),
            aggregateType: 'StudentRegistration',
            eventId: randomUUID(),
            eventType: 'RegistrationApproved',
            occurredAt: now,
            payload: {
              registrationId: registration._id.toString(),
              studentId: student._id.toString(),
              userId: registration.userId.toString(),
            },
            status: 'PENDING',
            transactionActorId: actor,
          },
        ],
        { session },
      );
      return {
        enrollmentId: enrollment._id.toString(),
        studentId: permanentStudentId,
        studentRecordId: student._id.toString(),
      };
    });
  }
}
