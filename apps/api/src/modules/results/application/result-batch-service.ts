import type { ResultBatchDto, ResultComponentDto, TermReportDto } from '@onyx/contracts';
import mongoose, { type ClientSession, type Types } from 'mongoose';

import {
  AuthorizationError,
  ConflictError,
  DomainConflictError,
  NotFoundError,
  ValidationError,
} from '../../../app/errors/app-error.js';
import {
  AcademicSessionModel,
  ClassLevelModel,
  TermModel,
  TrackModel,
} from '../../academics/infrastructure/academic-models.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import { EnrollmentModel } from '../../enrollments/infrastructure/enrollment-model.js';
import { createNotifications } from '../../notifications/infrastructure/notification-model.js';
import { StudentModel } from '../../students/infrastructure/student-models.js';
import { SubjectService } from '../../subjects/application/subject-service.js';
import {
  EnrollmentSubjectOverrideModel,
  SubjectModel,
  SubjectOfferingModel,
} from '../../subjects/infrastructure/subject-models.js';
import { OutboxEventModel } from '../../system/infrastructure/system-models.js';
import { requireTeachingScope } from '../../teachers/application/teaching-scope-policy.js';
import {
  TeacherModel,
  TeachingAssignmentModel,
} from '../../teachers/infrastructure/teacher-models.js';
import {
  calculateOverallAverage,
  calculateResult,
  formatHundredths,
  parseDecimalToHundredths,
  standardCompetitionRanks,
  type GradeBandDefinition,
  type ResultComponentResolution,
} from '../domain/result-engine.js';
import {
  AssessmentSchemeModel,
  GradingSchemeModel,
  ResultBatchModel,
  ResultEntryModel,
  TermReportModel,
  type AssessmentSchemeRecord,
  type GradingSchemeRecord,
  type ReportSubjectSnapshotRecord,
  type ResultBatchRecord,
  type ResultEntryRecord,
  type TermReportRecord,
} from '../infrastructure/result-models.js';

export interface ResultPrincipal {
  accountType: string;
  permissions: readonly string[];
  userId: string;
}

export interface ClassPositionContext {
  academicSessionId: string;
  classLevelId: string;
  termId: string;
  trackId?: string;
}

export interface ClassPositionPolicy {
  enabledFor(context: ClassPositionContext, session: ClientSession): Promise<boolean>;
}

class DisabledClassPositionPolicy implements ClassPositionPolicy {
  public enabledFor(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

export interface SchoolIdentityProvider {
  schoolName(session: ClientSession): Promise<string>;
}

class DefaultSchoolIdentityProvider implements SchoolIdentityProvider {
  public schoolName(): Promise<string> {
    return Promise.resolve('Onyx College');
  }
}

interface ReportCandidate {
  academicSessionId: Types.ObjectId;
  classLevelId: Types.ObjectId;
  classLevelName: string;
  eligibleSubjectCount: number;
  enrollmentId: Types.ObjectId;
  overallAverageExact: string;
  overallAverageRounded: string;
  sessionLabel: string;
  studentDisplayName: string;
  studentId: Types.ObjectId;
  studentIdentifier: string;
  studentUserId: Types.ObjectId;
  subjects: ReportSubjectSnapshotRecord[];
  termId: Types.ObjectId;
  termName: string;
  trackId?: Types.ObjectId;
  trackName?: string;
}

export interface PublishedSubjectResult {
  academicSession: { id: string; label: string };
  components: readonly ResultComponentDto[];
  exempt: boolean;
  grade?: string;
  id: string;
  percentage?: string;
  subject: { code: string; id: string; name: string };
  term: { id: string; name: string };
  total?: string;
}

function hasPermission(principal: ResultPrincipal, permission: string): void {
  if (!principal.permissions.includes(permission)) throw new AuthorizationError();
}

function gradeBands(scheme: GradingSchemeRecord): GradeBandDefinition[] {
  return scheme.bands.map((band) => ({
    grade: band.grade,
    maximumPercentageHundredths: band.maximumPercentageHundredths,
    minimumPercentageHundredths: band.minimumPercentageHundredths,
    ...(band.remark === undefined ? {} : { remark: band.remark }),
  }));
}

function entrySnapshot(entry: ResultEntryRecord): {
  components: ResultComponentResolution[];
  exempt: boolean;
  grade?: string;
  percentageDisplay?: string;
  percentageExact?: string;
  subjectMaximumHundredths?: number;
  totalHundredths?: number;
} {
  return {
    components: entry.components.map((component) => ({
      key: component.key,
      state: component.state,
      ...(component.scoreHundredths === undefined
        ? {}
        : { scoreHundredths: component.scoreHundredths }),
    })),
    exempt: entry.exempt,
    ...(entry.grade === undefined ? {} : { grade: entry.grade }),
    ...(entry.percentageDisplay === undefined
      ? {}
      : { percentageDisplay: entry.percentageDisplay }),
    ...(entry.percentageExact === undefined ? {} : { percentageExact: entry.percentageExact }),
    ...(entry.subjectMaximumHundredths === undefined
      ? {}
      : { subjectMaximumHundredths: entry.subjectMaximumHundredths }),
    ...(entry.totalHundredths === undefined ? {} : { totalHundredths: entry.totalHundredths }),
  };
}

function reportDto(report: TermReportRecord & { _id: Types.ObjectId }): TermReportDto {
  if (report.publishedAt === undefined)
    throw new Error('Published report is missing its timestamp.');
  return {
    classLevel: report.classLevelName,
    id: report._id.toString(),
    overallAverage: report.overallAverageRounded,
    publishedAt: report.publishedAt.toISOString(),
    schoolName: report.schoolName,
    sessionLabel: report.sessionLabel,
    studentId: report.studentIdentifier,
    studentName: report.studentDisplayName,
    subjects: report.subjects.map((subject) => ({
      components: subject.components.map((component) => ({
        key: component.key,
        label: component.label,
        maximum: formatHundredths(component.maximumHundredths),
        ...(component.state === undefined ? {} : { state: component.state }),
        ...(component.scoreHundredths === undefined
          ? {}
          : { score: formatHundredths(component.scoreHundredths) }),
      })),
      exempt: subject.exempt,
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
      ...(subject.grade === undefined ? {} : { grade: subject.grade }),
      ...(subject.percentageDisplay === undefined ? {} : { percentage: subject.percentageDisplay }),
      ...(subject.totalHundredths === undefined
        ? {}
        : { total: formatHundredths(subject.totalHundredths) }),
    })),
    termName: report.termName,
    versionNumber: report.publicationVersion,
    ...(report.classPosition === undefined ? {} : { classPosition: report.classPosition }),
    ...(report.trackName === undefined ? {} : { track: report.trackName }),
  };
}

function isDuplicateKey(error: unknown): boolean {
  return error instanceof Error && error.name === 'MongoServerError';
}

export class ResultBatchService {
  readonly #audit = new AuditWriter();
  readonly #classPositionPolicy: ClassPositionPolicy;
  readonly #schoolIdentity: SchoolIdentityProvider;
  readonly #subjects = new SubjectService();

  public constructor(options?: {
    classPositionPolicy?: ClassPositionPolicy;
    schoolIdentity?: SchoolIdentityProvider;
  }) {
    this.#classPositionPolicy = options?.classPositionPolicy ?? new DisabledClassPositionPolicy();
    this.#schoolIdentity = options?.schoolIdentity ?? new DefaultSchoolIdentityProvider();
  }

  public async listBatches(
    principal: ResultPrincipal,
    filters: {
      academicSessionId?: string;
      classLevelId?: string;
      status?: ResultBatchRecord['status'];
      subjectId?: string;
      termId?: string;
    },
  ): Promise<ResultBatchDto[]> {
    const query: Record<string, unknown> = { ...filters };
    if (principal.accountType === 'TEACHER') {
      const teacher = await TeacherModel.findOne({
        userId: principal.userId,
        status: 'ACTIVE',
      }).lean();
      if (teacher === null) throw new AuthorizationError();
      query.teacherId = teacher._id;
    } else {
      hasPermission(principal, 'results.read_all');
    }
    const batches = await ResultBatchModel.find(query).sort({ updatedAt: -1 }).select('_id').lean();
    return Promise.all(batches.map(({ _id }) => this.getBatch(principal, _id.toString())));
  }

  public async getBatch(principal: ResultPrincipal, batchId: string): Promise<ResultBatchDto> {
    const batch = await ResultBatchModel.findById(batchId)
      .populate('academicSessionId', 'label')
      .populate('termId', 'name ordinal')
      .populate('classLevelId', 'code name')
      .populate('trackId', 'code name')
      .populate('subjectId', 'code name')
      .populate('teacherId', 'firstName middleName lastName userId')
      .populate('assessmentSchemeId')
      .populate('gradingSchemeId')
      .lean();
    if (batch === null) throw new NotFoundError();
    const teacher = batch.teacherId as unknown as {
      _id: Types.ObjectId;
      firstName: string;
      lastName: string;
      middleName?: string;
      userId: Types.ObjectId;
    };
    if (principal.accountType === 'TEACHER' && teacher.userId.toString() !== principal.userId) {
      throw new NotFoundError();
    }
    if (principal.accountType !== 'TEACHER') hasPermission(principal, 'results.read_all');
    const entries = await ResultEntryModel.find({ resultBatchId: batch._id })
      .populate('studentId', 'firstName middleName surname studentId')
      .sort({ studentId: 1 })
      .lean();
    const academicSession = batch.academicSessionId as unknown as {
      _id: Types.ObjectId;
      label: string;
    };
    const term = batch.termId as unknown as { _id: Types.ObjectId; name: string; ordinal: number };
    const classLevel = batch.classLevelId as unknown as {
      _id: Types.ObjectId;
      code: string;
      name: string;
    };
    const subject = batch.subjectId as unknown as {
      _id: Types.ObjectId;
      code: string;
      name: string;
    };
    const track = batch.trackId as unknown as
      { _id: Types.ObjectId; code: string; name: string } | undefined;
    const assessment = batch.assessmentSchemeId as unknown as AssessmentSchemeRecord & {
      _id: Types.ObjectId;
    };
    const grading = batch.gradingSchemeId as unknown as GradingSchemeRecord & {
      _id: Types.ObjectId;
    };
    return {
      academicSession: { id: academicSession._id.toString(), label: academicSession.label },
      assessmentScheme: {
        academicSessionId: assessment.academicSessionId.toString(),
        code: assessment.code,
        components: assessment.components.map((component) => ({
          key: component.key,
          label: component.label,
          maximum: formatHundredths(component.maximumHundredths),
        })),
        id: assessment._id.toString(),
        name: assessment.name,
        status: assessment.status,
        totalMaximum: formatHundredths(assessment.totalMaximumHundredths),
        versionNumber: assessment.versionNumber,
      },
      classLevel: {
        code: classLevel.code,
        id: classLevel._id.toString(),
        name: classLevel.name,
      },
      entries: entries.map((entry) => {
        const student = entry.studentId as unknown as {
          _id: Types.ObjectId;
          firstName: string;
          middleName?: string;
          studentId: string;
          surname: string;
        };
        return {
          components: entry.components.map((component) => ({
            key: component.key,
            state: component.state,
            ...(component.scoreHundredths === undefined
              ? {}
              : { score: formatHundredths(component.scoreHundredths) }),
          })),
          enrollmentId: entry.enrollmentId.toString(),
          exempt: entry.exempt,
          id: entry._id.toString(),
          student: {
            id: student._id.toString(),
            name: [student.surname, student.firstName, student.middleName]
              .filter(Boolean)
              .join(' '),
            studentId: student.studentId,
          },
          ...(entry.grade === undefined ? {} : { grade: entry.grade }),
          ...(entry.percentageDisplay === undefined ? {} : { percentage: entry.percentageDisplay }),
          ...(entry.totalHundredths === undefined
            ? {}
            : { total: formatHundredths(entry.totalHundredths) }),
        };
      }),
      gradingScheme: {
        academicSessionId: grading.academicSessionId.toString(),
        bands: grading.bands.map((band) => ({
          grade: band.grade,
          maximumPercentage: formatHundredths(band.maximumPercentageHundredths),
          minimumPercentage: formatHundredths(band.minimumPercentageHundredths),
          ...(band.remark === undefined ? {} : { remark: band.remark }),
        })),
        code: grading.code,
        id: grading._id.toString(),
        name: grading.name,
        status: grading.status,
        versionNumber: grading.versionNumber,
      },
      id: batch._id.toString(),
      status: batch.status,
      subject: { code: subject.code, id: subject._id.toString(), name: subject.name },
      teacher: {
        id: teacher._id.toString(),
        name: [teacher.firstName, teacher.middleName, teacher.lastName].filter(Boolean).join(' '),
      },
      term: { id: term._id.toString(), name: term.name, ordinal: term.ordinal },
      version: batch.version,
      ...(batch.reviewNote === undefined ? {} : { transitionNote: batch.reviewNote }),
      ...(track === undefined
        ? {}
        : { track: { code: track.code, id: track._id.toString(), name: track.name } }),
    };
  }

  public async createBatch(input: {
    actor: ResultPrincipal;
    assessmentSchemeId: string;
    gradingSchemeId: string;
    requestId: string;
    teachingAssignmentId: string;
    termId: string;
  }): Promise<string> {
    hasPermission(input.actor, 'results.enter');
    const [assignment, term, assessment, grading] = await Promise.all([
      TeachingAssignmentModel.findOne({ _id: input.teachingAssignmentId, status: 'ACTIVE' }).lean(),
      TermModel.findById(input.termId).lean(),
      AssessmentSchemeModel.findOne({ _id: input.assessmentSchemeId, status: 'ACTIVE' }).lean(),
      GradingSchemeModel.findOne({ _id: input.gradingSchemeId, status: 'ACTIVE' }).lean(),
    ]);
    if (assignment === null || term === null || assessment === null || grading === null) {
      throw new NotFoundError();
    }
    if (
      term.academicSessionId.toString() !== assignment.academicSessionId.toString() ||
      assessment.academicSessionId.toString() !== assignment.academicSessionId.toString() ||
      grading.academicSessionId.toString() !== assignment.academicSessionId.toString()
    ) {
      throw new ConflictError('The term and result schemes must belong to the assignment session.');
    }
    if (input.actor.accountType === 'TEACHER') {
      const scope = await requireTeachingScope(input.actor.userId, {
        academicSessionId: assignment.academicSessionId.toString(),
        classLevelId: assignment.classLevelId.toString(),
        subjectId: assignment.subjectId.toString(),
        ...(assignment.trackId === undefined ? {} : { trackId: assignment.trackId.toString() }),
      });
      if (scope.assignmentId !== assignment._id.toString()) throw new AuthorizationError();
    }
    const enrollments = await EnrollmentModel.find({
      academicSessionId: assignment.academicSessionId,
      classLevelId: assignment.classLevelId,
      normalizedTrackKey: { $exists: false },
      ...(assignment.trackId === undefined
        ? { trackId: { $exists: false } }
        : { trackId: assignment.trackId }),
      status: { $nin: ['ARCHIVED'] },
    }).lean();
    const eligibleEnrollmentIds: Types.ObjectId[] = [];
    for (const enrollment of enrollments) {
      const curriculum = await this.#subjects.curriculumForEnrollment(enrollment._id.toString());
      if (curriculum.some(({ subject }) => subject.id === assignment.subjectId.toString())) {
        eligibleEnrollmentIds.push(enrollment._id);
      }
    }
    if (eligibleEnrollmentIds.length === 0) {
      throw new ConflictError('No eligible student enrollments exist for this result batch.');
    }
    try {
      return await mongoose.connection.transaction(async (session) => {
        const [batch] = await ResultBatchModel.create(
          [
            {
              academicSessionId: assignment.academicSessionId,
              assessmentSchemeId: assessment._id,
              classLevelId: assignment.classLevelId,
              dataEntryActorUserIds: [],
              gradingSchemeId: grading._id,
              normalizedTrackKey: assignment.trackId?.toString() ?? 'NONE',
              status: 'DRAFT',
              subjectId: assignment.subjectId,
              teacherId: assignment.teacherId,
              teachingAssignmentId: assignment._id,
              termId: term._id,
              transitionHistory: [],
              workflowRevision: 0,
              ...(assignment.trackId === undefined ? {} : { trackId: assignment.trackId }),
            },
          ],
          { session },
        );
        if (batch === undefined) throw new Error('Result batch creation failed.');
        const eligibleEnrollments = enrollments.filter((enrollment) =>
          eligibleEnrollmentIds.some((id) => id.equals(enrollment._id)),
        );
        await ResultEntryModel.insertMany(
          eligibleEnrollments.map((enrollment) => ({
            components: [],
            correctionRevision: 0,
            enteredByUserIds: [],
            enrollmentId: enrollment._id,
            exempt: false,
            resultBatchId: batch._id,
            studentId: enrollment.studentId,
            validationState: 'INCOMPLETE',
          })),
          { session },
        );
        await this.#audit.append(
          {
            action: 'RESULT_BATCH_CREATED',
            actorType: 'USER',
            actorUserId: new mongoose.Types.ObjectId(input.actor.userId),
            changes: { eligibleEnrollmentCount: eligibleEnrollments.length },
            outcome: 'SUCCESS',
            requestId: input.requestId,
            targetId: batch._id.toString(),
            targetType: 'ResultBatch',
          },
          session,
        );
        return batch._id.toString();
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictError('A result batch already exists for this academic context.');
      }
      throw error;
    }
  }

  public async saveEntry(input: {
    actor: ResultPrincipal;
    components: readonly ResultComponentDto[];
    entryId: string;
    exempt: boolean;
    requestId: string;
  }): Promise<void> {
    hasPermission(input.actor, 'results.enter');
    const entry = await ResultEntryModel.findById(input.entryId).lean();
    if (entry === null) throw new NotFoundError();
    const batch = await ResultBatchModel.findOne({
      _id: entry.resultBatchId,
      status: { $in: ['DRAFT', 'RETURNED_FOR_CORRECTION'] },
    }).lean();
    if (batch === null) throw new ConflictError('This result batch is not editable.');
    await this.#authorizeEntry(input.actor, batch);
    const [assessment, grading] = await Promise.all([
      AssessmentSchemeModel.findById(batch.assessmentSchemeId).lean(),
      GradingSchemeModel.findById(batch.gradingSchemeId).lean(),
    ]);
    if (assessment === null || grading === null)
      throw new DomainConflictError('Result configuration is unavailable.');
    const definitions = new Map(
      assessment.components.map((component) => [component.key, component] as const),
    );
    const seen = new Set<string>();
    const components: ResultComponentResolution[] = input.components.map((component) => {
      if (seen.has(component.key)) throw new ValidationError('Duplicate assessment component.');
      seen.add(component.key);
      const definition = definitions.get(component.key);
      if (definition === undefined) throw new ValidationError('Unknown assessment component.');
      if (component.state === 'ABSENT') {
        if (component.score !== undefined)
          throw new ValidationError('An absent component cannot carry a score.');
        return { key: component.key, state: 'ABSENT' };
      }
      if (component.score === undefined)
        throw new ValidationError('A scored component requires a score.');
      const scoreHundredths = parseDecimalToHundredths(component.score);
      if (scoreHundredths > definition.maximumHundredths) {
        throw new ValidationError(`${definition.label} exceeds its configured maximum.`);
      }
      return { key: component.key, scoreHundredths, state: 'SCORED' };
    });
    if (input.exempt && components.length > 0) {
      throw new ValidationError('An exempt result cannot contain normal component scores.');
    }
    const complete = input.exempt || components.length === assessment.components.length;
    const calculated = complete
      ? calculateResult({
          components,
          exempt: input.exempt,
          gradingBands: gradeBands(grading),
          scheme: assessment,
        })
      : undefined;
    const actorId = new mongoose.Types.ObjectId(input.actor.userId);
    await mongoose.connection.transaction(async (session) => {
      const set: Record<string, unknown> = {
        components,
        exempt: input.exempt,
        lastEnteredAt: new Date(),
        lastEnteredByUserId: actorId,
        validationState: complete ? 'COMPLETE' : 'INCOMPLETE',
        ...(input.exempt
          ? { exemptAuthorizedAt: new Date(), exemptAuthorizedByUserId: actorId }
          : {}),
        ...(calculated?.exempt === false
          ? {
              grade: calculated.grade,
              percentageDisplay: calculated.percentageDisplay,
              percentageExact: calculated.percentageExact,
              subjectMaximumHundredths: calculated.subjectMaximumHundredths,
              totalHundredths: calculated.totalHundredths,
            }
          : {}),
      };
      const unset: Record<string, 1> = {};
      if (!input.exempt) {
        unset.exemptAuthorizedAt = 1;
        unset.exemptAuthorizedByUserId = 1;
      }
      if (calculated === undefined || calculated.exempt) {
        unset.grade = 1;
        unset.percentageDisplay = 1;
        unset.percentageExact = 1;
        unset.subjectMaximumHundredths = 1;
        unset.totalHundredths = 1;
      }
      const result = await ResultEntryModel.updateOne(
        { _id: entry._id, resultBatchId: batch._id },
        {
          $addToSet: { enteredByUserIds: actorId },
          $set: set,
          ...(Object.keys(unset).length === 0 ? {} : { $unset: unset }),
        },
        { session },
      );
      if (result.modifiedCount !== 1) throw new ConflictError();
      await ResultBatchModel.updateOne(
        { _id: batch._id, status: { $in: ['DRAFT', 'RETURNED_FOR_CORRECTION'] } },
        { $addToSet: { dataEntryActorUserIds: actorId } },
        { session },
      );
      await this.#audit.append(
        {
          action: input.exempt ? 'RESULT_ENTRY_EXEMPTED' : 'RESULT_ENTRY_UPDATED',
          actorType: 'USER',
          actorUserId: actorId,
          changes: { exempt: input.exempt, validationState: complete ? 'COMPLETE' : 'INCOMPLETE' },
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: entry._id.toString(),
          targetType: 'ResultEntry',
        },
        session,
      );
    });
  }

  public async submit(input: {
    actor: ResultPrincipal;
    batchId: string;
    requestId: string;
  }): Promise<void> {
    hasPermission(input.actor, 'results.submit');
    const batch = await ResultBatchModel.findOne({
      _id: input.batchId,
      status: { $in: ['DRAFT', 'RETURNED_FOR_CORRECTION'] },
    }).lean();
    if (batch === null)
      throw new ConflictError('The result batch cannot be submitted in its current state.');
    await this.#authorizeEntry(input.actor, batch);
    const [entryCount, incompleteCount] = await Promise.all([
      ResultEntryModel.countDocuments({ resultBatchId: batch._id }),
      ResultEntryModel.countDocuments({
        resultBatchId: batch._id,
        validationState: { $ne: 'COMPLETE' },
      }),
    ]);
    if (entryCount === 0 || incompleteCount > 0) {
      throw new DomainConflictError(
        'Every student result must be explicitly completed or exempted.',
      );
    }
    const actorId = new mongoose.Types.ObjectId(input.actor.userId);
    const priorStatus = batch.status;
    await mongoose.connection.transaction(async (session) => {
      const result = await ResultBatchModel.updateOne(
        { _id: batch._id, status: priorStatus },
        {
          $inc: { workflowRevision: 1 },
          $push: {
            transitionHistory: {
              actorUserId: actorId,
              at: new Date(),
              from: priorStatus,
              to: 'SUBMITTED',
            },
          },
          $set: { status: 'SUBMITTED', submittedAt: new Date(), submittedByUserId: actorId },
        },
        { session },
      );
      if (result.modifiedCount !== 1) throw new ConflictError();
      await this.#audit.append(
        {
          action: priorStatus === 'DRAFT' ? 'RESULT_BATCH_SUBMITTED' : 'RESULT_BATCH_RESUBMITTED',
          actorType: 'USER',
          actorUserId: actorId,
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: batch._id.toString(),
          targetType: 'ResultBatch',
        },
        session,
      );
    });
  }

  public async startReview(input: {
    actor: ResultPrincipal;
    batchId: string;
    note?: string;
    requestId: string;
  }): Promise<void> {
    hasPermission(input.actor, 'results.review');
    await this.#transition({
      action: 'RESULT_BATCH_REVIEW_STARTED',
      actor: input.actor,
      batchId: input.batchId,
      from: 'SUBMITTED',
      requestId: input.requestId,
      set: {
        reviewedAt: new Date(),
        reviewedByUserId: new mongoose.Types.ObjectId(input.actor.userId),
        ...(input.note === undefined ? {} : { reviewNote: input.note.trim() }),
      },
      to: 'UNDER_REVIEW',
      ...(input.note === undefined ? {} : { note: input.note }),
    });
  }

  public async returnForCorrection(input: {
    actor: ResultPrincipal;
    batchId: string;
    note: string;
    requestId: string;
  }): Promise<void> {
    hasPermission(input.actor, 'results.review');
    if (input.note.trim().length === 0) throw new ValidationError('A correction note is required.');
    await this.#transition({
      action: 'RESULT_BATCH_RETURNED_FOR_CORRECTION',
      actor: input.actor,
      batchId: input.batchId,
      from: 'UNDER_REVIEW',
      note: input.note,
      requestId: input.requestId,
      set: {
        returnedAt: new Date(),
        returnedByUserId: new mongoose.Types.ObjectId(input.actor.userId),
        reviewNote: input.note.trim(),
      },
      to: 'RETURNED_FOR_CORRECTION',
    });
  }

  public async approve(input: {
    actor: ResultPrincipal;
    batchId: string;
    note?: string;
    requestId: string;
  }): Promise<void> {
    hasPermission(input.actor, 'results.approve');
    const batch = await ResultBatchModel.findOne({
      _id: input.batchId,
      status: 'UNDER_REVIEW',
    }).lean();
    if (batch === null) throw new ConflictError('Only a batch under review can be approved.');
    const actorId = input.actor.userId;
    if (
      batch.submittedByUserId?.toString() === actorId ||
      batch.dataEntryActorUserIds.some((candidate) => candidate.toString() === actorId)
    ) {
      throw new AuthorizationError(
        'A result data-entry actor or submitter cannot approve the same batch.',
      );
    }
    await this.#transition({
      action: 'RESULT_BATCH_APPROVED',
      actor: input.actor,
      batchId: input.batchId,
      from: 'UNDER_REVIEW',
      requestId: input.requestId,
      set: {
        approvedAt: new Date(),
        approvedByUserId: new mongoose.Types.ObjectId(input.actor.userId),
        ...(input.note === undefined ? {} : { reviewNote: input.note.trim() }),
      },
      to: 'APPROVED',
      ...(input.note === undefined ? {} : { note: input.note }),
    });
  }

  public async publish(input: {
    actor: ResultPrincipal;
    batchId: string;
    requestId: string;
  }): Promise<{ reportIds: string[] }> {
    hasPermission(input.actor, 'results.publish');
    const existing = await ResultBatchModel.findById(input.batchId).lean();
    if (existing === null) throw new NotFoundError();
    if (existing.status === 'PUBLISHED') {
      const reports = await TermReportModel.find({
        current: true,
        status: 'PUBLISHED',
        'subjects.resultBatchId': existing._id,
      })
        .select('_id')
        .lean();
      return { reportIds: reports.map(({ _id }) => _id.toString()) };
    }
    if (existing.status !== 'APPROVED') {
      throw new ConflictError('Only an approved result batch can be published.');
    }
    const actorId = new mongoose.Types.ObjectId(input.actor.userId);
    return mongoose.connection.transaction(async (session) => {
      const batch = await ResultBatchModel.findOneAndUpdate(
        { _id: existing._id, status: 'APPROVED' },
        {
          $inc: { workflowRevision: 1 },
          $push: {
            transitionHistory: {
              actorUserId: actorId,
              at: new Date(),
              from: 'APPROVED',
              to: 'PUBLISHED',
            },
          },
          $set: { publishedAt: new Date(), publishedByUserId: actorId, status: 'PUBLISHED' },
        },
        { new: true, session },
      ).lean();
      if (batch === null) throw new ConflictError('The result batch changed before publication.');
      const batchEntries = await ResultEntryModel.find({ resultBatchId: batch._id })
        .session(session)
        .lean();
      const positionEnabled = await this.#classPositionPolicy.enabledFor(
        {
          academicSessionId: batch.academicSessionId.toString(),
          classLevelId: batch.classLevelId.toString(),
          termId: batch.termId.toString(),
          ...(batch.trackId === undefined ? {} : { trackId: batch.trackId.toString() }),
        },
        session,
      );
      const targetEnrollments = positionEnabled
        ? await EnrollmentModel.find({
            academicSessionId: batch.academicSessionId,
            classLevelId: batch.classLevelId,
            status: { $nin: ['ARCHIVED'] },
            ...(batch.trackId === undefined
              ? { trackId: { $exists: false } }
              : { trackId: batch.trackId }),
          })
            .session(session)
            .lean()
        : await EnrollmentModel.find({
            _id: { $in: batchEntries.map(({ enrollmentId }) => enrollmentId) },
          })
            .session(session)
            .lean();
      const candidates: ReportCandidate[] = [];
      for (const enrollment of targetEnrollments) {
        const candidate = await this.#buildReportCandidate(enrollment._id, batch.termId, session);
        if (candidate !== undefined) candidates.push(candidate);
      }
      const cohortComplete = !positionEnabled || candidates.length === targetEnrollments.length;
      const publishableCandidates = cohortComplete ? candidates : [];
      const rankByEnrollment =
        positionEnabled && cohortComplete
          ? standardCompetitionRanks(
              Object.fromEntries(
                candidates.map((candidate) => [
                  candidate.enrollmentId.toString(),
                  candidate.overallAverageRounded,
                ]),
              ),
            )
          : {};
      const schoolName = await this.#schoolIdentity.schoolName(session);
      const reportIds: string[] = [];
      const reportIdByEnrollment = new Map<string, string>();
      const notificationInputs: Parameters<typeof createNotifications>[0][number][] = [];
      for (const candidate of publishableCandidates) {
        const prior = await TermReportModel.findOne({
          current: true,
          enrollmentId: candidate.enrollmentId,
          status: 'PUBLISHED',
          termId: candidate.termId,
        })
          .session(session)
          .lean();
        if (prior !== null) {
          const priorId = prior._id.toString();
          reportIds.push(priorId);
          reportIdByEnrollment.set(candidate.enrollmentId.toString(), priorId);
          continue;
        }
        const [report] = await TermReportModel.create(
          [
            {
              ...candidate,
              current: true,
              publicationVersion: 1,
              publishedAt: new Date(),
              publishedByUserId: actorId,
              schoolName,
              status: 'PUBLISHED',
              ...(positionEnabled
                ? {
                    classPosition: rankByEnrollment[candidate.enrollmentId.toString()],
                    classPositionCohortSize: targetEnrollments.length,
                  }
                : {}),
            },
          ],
          { session },
        );
        if (report === undefined) throw new Error('Term report creation failed.');
        const reportId = report._id.toString();
        reportIds.push(reportId);
        reportIdByEnrollment.set(candidate.enrollmentId.toString(), reportId);
      }
      const batchStudents = await StudentModel.find({
        _id: { $in: batchEntries.map(({ studentId }) => studentId) },
      })
        .session(session)
        .select('_id userId')
        .lean();
      const userIdByStudent = new Map(
        batchStudents.map((student) => [student._id.toString(), student.userId]),
      );
      for (const entry of batchEntries) {
        const recipientUserId = userIdByStudent.get(entry.studentId.toString());
        if (recipientUserId === undefined) continue;
        const reportId = reportIdByEnrollment.get(entry.enrollmentId.toString());
        notificationInputs.push({
          body: 'A subject result is now available in your portal.',
          deduplicationKey: `result-batch:${batch._id.toString()}:student:${entry.studentId.toString()}`,
          recipientUserId,
          resourceId: reportId ?? entry._id.toString(),
          resourceType: reportId === undefined ? 'ResultEntry' : 'TermReport',
          sourceEventId: `result-batch:${batch._id.toString()}:published`,
          title: 'Result published',
          type: 'RESULT_PUBLISHED',
        });
      }
      await createNotifications(notificationInputs, session);
      await this.#audit.append(
        {
          action: 'RESULT_BATCH_PUBLISHED',
          actorType: 'USER',
          actorUserId: actorId,
          changes: { reportCount: reportIds.length },
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: batch._id.toString(),
          targetType: 'ResultBatch',
        },
        session,
      );
      await OutboxEventModel.create(
        [
          {
            aggregateId: batch._id.toString(),
            aggregateType: 'ResultBatch',
            eventId: `result-batch:${batch._id.toString()}:published`,
            eventType: 'RESULT_BATCH_PUBLISHED',
            occurredAt: new Date(),
            payload: {
              reportIds,
              studentUserIds: batchStudents.map(({ userId }) => userId.toString()),
            },
            status: 'PENDING',
            transactionActorId: actorId,
          },
        ],
        { session },
      );
      return { reportIds };
    });
  }

  public async listOwnPublishedReports(userId: string): Promise<TermReportDto[]> {
    const student = await StudentModel.findOne({ userId }).lean();
    if (student === null) throw new NotFoundError();
    const reports = await TermReportModel.find({
      current: true,
      status: 'PUBLISHED',
      studentId: student._id,
    })
      .sort({ publishedAt: -1 })
      .lean();
    return reports.map((report) => reportDto(report));
  }

  public async listOwnPublishedSubjectResults(userId: string): Promise<PublishedSubjectResult[]> {
    const student = await StudentModel.findOne({ userId }).lean();
    if (student === null) throw new NotFoundError();
    const entries = await ResultEntryModel.find({
      studentId: student._id,
      validationState: 'COMPLETE',
    })
      .populate({
        path: 'resultBatchId',
        match: { status: 'PUBLISHED' },
        populate: [
          { path: 'academicSessionId', select: 'label' },
          { path: 'termId', select: 'name' },
          { path: 'subjectId', select: 'code name' },
        ],
      })
      .sort({ updatedAt: -1 })
      .lean();
    return entries.flatMap((entry) => {
      const populatedBatch: unknown = entry.resultBatchId;
      if (populatedBatch === null || typeof populatedBatch !== 'object') return [];
      const batch = populatedBatch as {
        _id: Types.ObjectId;
        academicSessionId: { _id: Types.ObjectId; label: string };
        subjectId: { _id: Types.ObjectId; code: string; name: string };
        termId: { _id: Types.ObjectId; name: string };
      };
      return [
        {
          academicSession: {
            id: batch.academicSessionId._id.toString(),
            label: batch.academicSessionId.label,
          },
          components: entry.components.map((component) => ({
            key: component.key,
            state: component.state,
            ...(component.scoreHundredths === undefined
              ? {}
              : { score: formatHundredths(component.scoreHundredths) }),
          })),
          exempt: entry.exempt,
          id: entry._id.toString(),
          subject: {
            code: batch.subjectId.code,
            id: batch.subjectId._id.toString(),
            name: batch.subjectId.name,
          },
          term: { id: batch.termId._id.toString(), name: batch.termId.name },
          ...(entry.grade === undefined ? {} : { grade: entry.grade }),
          ...(entry.percentageDisplay === undefined ? {} : { percentage: entry.percentageDisplay }),
          ...(entry.totalHundredths === undefined
            ? {}
            : { total: formatHundredths(entry.totalHundredths) }),
        },
      ];
    });
  }

  public async getOwnPublishedReport(userId: string, reportId: string): Promise<TermReportDto> {
    const student = await StudentModel.findOne({ userId }).lean();
    if (student === null) throw new NotFoundError();
    const report = await TermReportModel.findOne({
      _id: reportId,
      current: true,
      status: 'PUBLISHED',
      studentId: student._id,
    }).lean();
    if (report === null) throw new NotFoundError();
    return reportDto(report);
  }

  async #authorizeEntry(principal: ResultPrincipal, batch: ResultBatchRecord): Promise<void> {
    if (principal.accountType !== 'TEACHER') return;
    const scope = await requireTeachingScope(principal.userId, {
      academicSessionId: batch.academicSessionId.toString(),
      classLevelId: batch.classLevelId.toString(),
      subjectId: batch.subjectId.toString(),
      ...(batch.trackId === undefined ? {} : { trackId: batch.trackId.toString() }),
    });
    if (scope.assignmentId !== batch.teachingAssignmentId.toString())
      throw new AuthorizationError();
  }

  async #transition(input: {
    action: string;
    actor: ResultPrincipal;
    batchId: string;
    from: ResultBatchRecord['status'];
    note?: string;
    requestId: string;
    set: Readonly<Record<string, unknown>>;
    to: ResultBatchRecord['status'];
  }): Promise<void> {
    const actorId = new mongoose.Types.ObjectId(input.actor.userId);
    await mongoose.connection.transaction(async (session) => {
      const result = await ResultBatchModel.updateOne(
        { _id: input.batchId, status: input.from },
        {
          $inc: { workflowRevision: 1 },
          $push: {
            transitionHistory: {
              actorUserId: actorId,
              at: new Date(),
              from: input.from,
              to: input.to,
              ...(input.note === undefined ? {} : { note: input.note.trim() }),
            },
          },
          $set: { ...input.set, status: input.to },
        },
        { session },
      );
      if (result.modifiedCount !== 1) {
        throw new ConflictError(
          'The result batch cannot make this transition in its current state.',
        );
      }
      await this.#audit.append(
        {
          action: input.action,
          actorType: 'USER',
          actorUserId: actorId,
          ...(input.note === undefined ? {} : { reason: input.note.trim() }),
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: input.batchId,
          targetType: 'ResultBatch',
        },
        session,
      );
    });
  }

  async #effectiveSubjectIds(
    enrollmentId: Types.ObjectId,
    session: ClientSession,
  ): Promise<string[]> {
    const enrollment = await EnrollmentModel.findById(enrollmentId).session(session).lean();
    if (enrollment === null) throw new NotFoundError();
    const offerings = await SubjectOfferingModel.find({
      academicSessionId: enrollment.academicSessionId,
      classLevelId: enrollment.classLevelId,
      normalizedTrackKey: enrollment.trackId?.toString() ?? 'NONE',
      status: { $in: ['ACTIVE', 'PLANNED'] },
    })
      .session(session)
      .lean();
    const overrides = await EnrollmentSubjectOverrideModel.find({
      enrollmentId,
      status: 'ACTIVE',
    })
      .session(session)
      .lean();
    const overrideBySubject = new Map(
      overrides.map((override) => [override.subjectId.toString(), override.action]),
    );
    return offerings
      .filter((offering) => {
        const override = overrideBySubject.get(offering.subjectId.toString());
        return offering.classification === 'REQUIRED' ? override !== 'REMOVE' : override === 'ADD';
      })
      .map((offering) => offering.subjectId.toString());
  }

  async #buildReportCandidate(
    enrollmentId: Types.ObjectId,
    termId: Types.ObjectId,
    session: ClientSession,
  ): Promise<ReportCandidate | undefined> {
    const enrollment = await EnrollmentModel.findById(enrollmentId).session(session).lean();
    if (enrollment === null) return undefined;
    const effectiveSubjectIds = await this.#effectiveSubjectIds(enrollment._id, session);
    if (effectiveSubjectIds.length === 0) return undefined;
    const batches = await ResultBatchModel.find({
      academicSessionId: enrollment.academicSessionId,
      classLevelId: enrollment.classLevelId,
      normalizedTrackKey: enrollment.trackId?.toString() ?? 'NONE',
      status: 'PUBLISHED',
      subjectId: { $in: effectiveSubjectIds },
      termId,
    })
      .session(session)
      .lean();
    const entries = await ResultEntryModel.find({
      enrollmentId: enrollment._id,
      resultBatchId: { $in: batches.map(({ _id }) => _id) },
      validationState: 'COMPLETE',
    })
      .session(session)
      .lean();
    if (entries.length !== effectiveSubjectIds.length) return undefined;
    const entryByBatch = new Map(entries.map((entry) => [entry.resultBatchId.toString(), entry]));
    const batchBySubject = new Map(batches.map((batch) => [batch.subjectId.toString(), batch]));
    if (effectiveSubjectIds.some((subjectId) => !batchBySubject.has(subjectId))) return undefined;
    const student = await StudentModel.findById(enrollment.studentId).session(session).lean();
    const academicSession = await AcademicSessionModel.findById(enrollment.academicSessionId)
      .session(session)
      .lean();
    const term = await TermModel.findById(termId).session(session).lean();
    const classLevel = await ClassLevelModel.findById(enrollment.classLevelId)
      .session(session)
      .lean();
    const track =
      enrollment.trackId === undefined
        ? null
        : await TrackModel.findById(enrollment.trackId).session(session).lean();
    const subjects = await SubjectModel.find({ _id: { $in: effectiveSubjectIds } })
      .session(session)
      .lean();
    const assessments = await AssessmentSchemeModel.find({
      _id: { $in: batches.map(({ assessmentSchemeId }) => assessmentSchemeId) },
    })
      .session(session)
      .lean();
    const gradings = await GradingSchemeModel.find({
      _id: { $in: batches.map(({ gradingSchemeId }) => gradingSchemeId) },
    })
      .session(session)
      .lean();
    if (student === null || academicSession === null || term === null || classLevel === null) {
      throw new DomainConflictError('Report identity or academic context is unavailable.');
    }
    const subjectsById = new Map(subjects.map((subject) => [subject._id.toString(), subject]));
    const assessmentsById = new Map(
      assessments.map((assessment) => [assessment._id.toString(), assessment]),
    );
    const gradingsById = new Map(gradings.map((grading) => [grading._id.toString(), grading]));
    const subjectSnapshots: ReportSubjectSnapshotRecord[] = [];
    for (const subjectId of effectiveSubjectIds) {
      const batch = batchBySubject.get(subjectId);
      const subject = subjectsById.get(subjectId);
      if (batch === undefined || subject === undefined) return undefined;
      const entry = entryByBatch.get(batch._id.toString());
      const assessment = assessmentsById.get(batch.assessmentSchemeId.toString());
      const grading = gradingsById.get(batch.gradingSchemeId.toString());
      if (entry === undefined || assessment === undefined || grading === undefined)
        return undefined;
      const componentsByKey = new Map(
        entry.components.map((component) => [component.key, component]),
      );
      subjectSnapshots.push({
        assessmentSchemeCode: assessment.code,
        assessmentSchemeVersion: assessment.versionNumber,
        components: assessment.components.map((definition) => {
          const component = componentsByKey.get(definition.key);
          if (entry.exempt) {
            return {
              key: definition.key,
              label: definition.label,
              maximumHundredths: definition.maximumHundredths,
            };
          }
          if (component === undefined) {
            throw new DomainConflictError('A published result is missing an assessment component.');
          }
          return {
            key: definition.key,
            label: definition.label,
            maximumHundredths: definition.maximumHundredths,
            state: component.state,
            ...(component.scoreHundredths === undefined
              ? {}
              : { scoreHundredths: component.scoreHundredths }),
          };
        }),
        exempt: entry.exempt,
        gradingSchemeCode: grading.code,
        gradingSchemeVersion: grading.versionNumber,
        resultBatchId: batch._id,
        resultEntryId: entry._id,
        subjectCode: subject.code,
        subjectId: subject._id,
        subjectName: subject.name,
        ...(entry.grade === undefined ? {} : { grade: entry.grade }),
        ...(entry.percentageDisplay === undefined
          ? {}
          : { percentageDisplay: entry.percentageDisplay }),
        ...(entry.percentageExact === undefined ? {} : { percentageExact: entry.percentageExact }),
        ...(entry.subjectMaximumHundredths === undefined
          ? {}
          : { subjectMaximumHundredths: entry.subjectMaximumHundredths }),
        ...(entry.totalHundredths === undefined ? {} : { totalHundredths: entry.totalHundredths }),
      });
    }
    const average = calculateOverallAverage(
      subjectSnapshots.map((subject) => ({
        exempt: subject.exempt,
        ...(subject.subjectMaximumHundredths === undefined
          ? {}
          : { subjectMaximumHundredths: subject.subjectMaximumHundredths }),
        ...(subject.totalHundredths === undefined
          ? {}
          : { totalHundredths: subject.totalHundredths }),
      })),
    );
    return {
      academicSessionId: enrollment.academicSessionId,
      classLevelId: enrollment.classLevelId,
      classLevelName: classLevel.name,
      eligibleSubjectCount: average.eligibleSubjectCount,
      enrollmentId: enrollment._id,
      overallAverageExact: average.exact,
      overallAverageRounded: average.rounded,
      sessionLabel: academicSession.label,
      studentDisplayName: [student.surname, student.firstName, student.middleName]
        .filter(Boolean)
        .join(' '),
      studentId: student._id,
      studentIdentifier: student.studentId,
      studentUserId: student.userId,
      subjects: subjectSnapshots.sort((left, right) =>
        left.subjectName.localeCompare(right.subjectName),
      ),
      termId: term._id,
      termName: term.name,
      ...(track === null ? {} : { trackId: track._id, trackName: track.name }),
    };
  }
}

export { entrySnapshot, reportDto };
