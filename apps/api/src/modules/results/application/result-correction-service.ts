import { randomUUID } from 'node:crypto';

import type { ResultComponentDto, ResultCorrectionRequestDto } from '@onyx/contracts';
import mongoose, { type Types } from 'mongoose';

import {
  AuthorizationError,
  ConflictError,
  DomainConflictError,
  NotFoundError,
  ValidationError,
} from '../../../app/errors/app-error.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import { createNotifications } from '../../notifications/infrastructure/notification-model.js';
import { StudentModel } from '../../students/infrastructure/student-models.js';
import { OutboxEventModel } from '../../system/infrastructure/system-models.js';
import { requireTeachingScope } from '../../teachers/application/teaching-scope-policy.js';
import {
  calculateOverallAverage,
  calculateResult,
  parseDecimalToHundredths,
  type GradeBandDefinition,
  type ResultComponentResolution,
} from '../domain/result-engine.js';
import {
  AssessmentSchemeModel,
  GradingSchemeModel,
  ResultBatchModel,
  ResultCorrectionRequestModel,
  ResultEntryModel,
  TermReportModel,
  type GradingSchemeRecord,
  type ReportSubjectSnapshotRecord,
  type ResultBatchRecord,
  type ResultCorrectionRequestRecord,
  type ResultCorrectionSnapshotRecord,
} from '../infrastructure/result-models.js';
import type { ResultPrincipal } from './result-batch-service.js';

function requirePermission(principal: ResultPrincipal, permission: string): void {
  if (!principal.permissions.includes(permission)) throw new AuthorizationError();
}

function gradingBands(scheme: GradingSchemeRecord): GradeBandDefinition[] {
  return scheme.bands.map((band) => ({
    grade: band.grade,
    maximumPercentageHundredths: band.maximumPercentageHundredths,
    minimumPercentageHundredths: band.minimumPercentageHundredths,
    ...(band.remark === undefined ? {} : { remark: band.remark }),
  }));
}

function correctionDto(
  item: ResultCorrectionRequestRecord & { _id: Types.ObjectId },
): ResultCorrectionRequestDto {
  return {
    createdAt: item.createdAt.toISOString(),
    id: item._id.toString(),
    proposedComponents: item.proposedValue.components.map((component) => ({
      key: component.key,
      state: component.state,
      ...(component.scoreHundredths === undefined
        ? {}
        : { score: (component.scoreHundredths / 100).toFixed(2) }),
    })),
    reason: item.reason,
    resultEntryId: item.resultEntryId.toString(),
    status: item.status,
  };
}

function snapshotFromEntry(entry: {
  components: readonly {
    key: string;
    scoreHundredths?: number;
    state: 'ABSENT' | 'SCORED';
  }[];
  exempt: boolean;
  grade?: string;
  percentageDisplay?: string;
  percentageExact?: string;
  subjectMaximumHundredths?: number;
  totalHundredths?: number;
}): ResultCorrectionSnapshotRecord {
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

export class ResultCorrectionService {
  readonly #audit = new AuditWriter();

  public async list(
    principal: ResultPrincipal,
    status?: ResultCorrectionRequestRecord['status'],
  ): Promise<ResultCorrectionRequestDto[]> {
    const query: Record<string, unknown> = {};
    if (status !== undefined) query.status = status;
    if (principal.accountType === 'TEACHER') {
      requirePermission(principal, 'results.request_correction');
      query.requestedByUserId = principal.userId;
    } else if (
      !principal.permissions.includes('results.approve_correction') &&
      !principal.permissions.includes('results.read_all')
    ) {
      throw new AuthorizationError();
    }
    const items = await ResultCorrectionRequestModel.find(query).sort({ createdAt: -1 }).lean();
    return items.map((item) => correctionDto(item));
  }

  public async request(input: {
    actor: ResultPrincipal;
    components: readonly ResultComponentDto[];
    exempt: boolean;
    reason: string;
    requestId: string;
    resultEntryId: string;
  }): Promise<ResultCorrectionRequestDto> {
    requirePermission(input.actor, 'results.request_correction');
    if (input.reason.trim().length === 0)
      throw new ValidationError('A correction reason is required.');
    const entry = await ResultEntryModel.findById(input.resultEntryId).lean();
    if (entry === null) throw new NotFoundError();
    const batch = await ResultBatchModel.findOne({
      _id: entry.resultBatchId,
      status: 'PUBLISHED',
    }).lean();
    if (batch === null)
      throw new ConflictError('Only a published result can use this correction workflow.');
    await this.#authorizeTeacherScope(input.actor, batch);
    const [assessment, grading] = await Promise.all([
      AssessmentSchemeModel.findById(batch.assessmentSchemeId).lean(),
      GradingSchemeModel.findById(batch.gradingSchemeId).lean(),
    ]);
    if (assessment === null || grading === null) {
      throw new DomainConflictError('The result configuration is unavailable.');
    }
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
    const calculated = calculateResult({
      components,
      exempt: input.exempt,
      gradingBands: gradingBands(grading),
      scheme: assessment,
    });
    const proposedValue: ResultCorrectionSnapshotRecord = calculated.exempt
      ? { components: [], exempt: true }
      : {
          components,
          exempt: false,
          grade: calculated.grade,
          percentageDisplay: calculated.percentageDisplay,
          percentageExact: calculated.percentageExact,
          subjectMaximumHundredths: calculated.subjectMaximumHundredths,
          totalHundredths: calculated.totalHundredths,
        };
    const currentReport = await TermReportModel.findOne({
      current: true,
      enrollmentId: entry.enrollmentId,
      status: 'PUBLISHED',
      'subjects.resultEntryId': entry._id,
    }).lean();
    const actorId = new mongoose.Types.ObjectId(input.actor.userId);
    return mongoose.connection.transaction(async (session) => {
      const [request] = await ResultCorrectionRequestModel.create(
        [
          {
            auditCorrelationId: randomUUID(),
            existingValue: snapshotFromEntry(entry),
            proposedValue,
            reason: input.reason.trim(),
            requestedByUserId: actorId,
            resultBatchId: batch._id,
            resultEntryId: entry._id,
            status: 'SUBMITTED',
            ...(currentReport === null ? {} : { termReportId: currentReport._id }),
          },
        ],
        { session },
      );
      if (request === undefined) throw new Error('Result correction request creation failed.');
      await this.#audit.append(
        {
          action: 'RESULT_CORRECTION_REQUESTED',
          actorType: 'USER',
          actorUserId: actorId,
          changes: { exempt: proposedValue.exempt },
          correlationId: request.auditCorrelationId,
          outcome: 'SUCCESS',
          reason: input.reason.trim(),
          requestId: input.requestId,
          targetId: request._id.toString(),
          targetType: 'ResultCorrectionRequest',
        },
        session,
      );
      return correctionDto(request.toObject());
    });
  }

  public async startReview(input: {
    actor: ResultPrincipal;
    note?: string;
    requestId: string;
    requestResourceId: string;
  }): Promise<void> {
    requirePermission(input.actor, 'results.approve_correction');
    const actorId = new mongoose.Types.ObjectId(input.actor.userId);
    await mongoose.connection.transaction(async (session) => {
      const request = await ResultCorrectionRequestModel.findOneAndUpdate(
        { _id: input.requestResourceId, status: 'SUBMITTED' },
        {
          $set: {
            reviewedAt: new Date(),
            reviewedByUserId: actorId,
            status: 'UNDER_REVIEW',
            ...(input.note === undefined ? {} : { reviewNote: input.note.trim() }),
          },
        },
        { new: true, session },
      );
      if (request === null)
        throw new ConflictError('The correction cannot enter review in its current state.');
      await this.#audit.append(
        {
          action: 'RESULT_CORRECTION_REVIEW_STARTED',
          actorType: 'USER',
          actorUserId: actorId,
          correlationId: request.auditCorrelationId,
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: request._id.toString(),
          targetType: 'ResultCorrectionRequest',
        },
        session,
      );
    });
  }

  public async approve(input: {
    actor: ResultPrincipal;
    note?: string;
    requestId: string;
    requestResourceId: string;
  }): Promise<void> {
    requirePermission(input.actor, 'results.approve_correction');
    const request = await ResultCorrectionRequestModel.findOne({
      _id: input.requestResourceId,
      status: 'UNDER_REVIEW',
    }).lean();
    if (request === null)
      throw new ConflictError('Only a correction under review can be approved.');
    if (request.requestedByUserId.toString() === input.actor.userId) {
      throw new AuthorizationError('A correction requester cannot approve their own request.');
    }
    const actorId = new mongoose.Types.ObjectId(input.actor.userId);
    await mongoose.connection.transaction(async (session) => {
      const result = await ResultCorrectionRequestModel.updateOne(
        { _id: request._id, status: 'UNDER_REVIEW' },
        {
          $set: {
            approvedAt: new Date(),
            approvedByUserId: actorId,
            status: 'APPROVED',
            ...(input.note === undefined ? {} : { reviewNote: input.note.trim() }),
          },
        },
        { session },
      );
      if (result.modifiedCount !== 1) throw new ConflictError();
      await this.#audit.append(
        {
          action: 'RESULT_CORRECTION_APPROVED',
          actorType: 'USER',
          actorUserId: actorId,
          correlationId: request.auditCorrelationId,
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: request._id.toString(),
          targetType: 'ResultCorrectionRequest',
        },
        session,
      );
    });
  }

  public async reject(input: {
    actor: ResultPrincipal;
    note: string;
    requestId: string;
    requestResourceId: string;
  }): Promise<void> {
    requirePermission(input.actor, 'results.approve_correction');
    if (input.note.trim().length === 0)
      throw new ValidationError('A rejection reason is required.');
    const actorId = new mongoose.Types.ObjectId(input.actor.userId);
    await mongoose.connection.transaction(async (session) => {
      const request = await ResultCorrectionRequestModel.findOneAndUpdate(
        { _id: input.requestResourceId, status: 'UNDER_REVIEW' },
        {
          $set: {
            rejectedAt: new Date(),
            rejectedByUserId: actorId,
            reviewNote: input.note.trim(),
            status: 'REJECTED',
          },
        },
        { new: true, session },
      );
      if (request === null)
        throw new ConflictError('Only a correction under review can be rejected.');
      await this.#audit.append(
        {
          action: 'RESULT_CORRECTION_REJECTED',
          actorType: 'USER',
          actorUserId: actorId,
          correlationId: request.auditCorrelationId,
          outcome: 'SUCCESS',
          reason: input.note.trim(),
          requestId: input.requestId,
          targetId: request._id.toString(),
          targetType: 'ResultCorrectionRequest',
        },
        session,
      );
    });
  }

  public async apply(input: {
    actor: ResultPrincipal;
    requestId: string;
    requestResourceId: string;
  }): Promise<{ reportId?: string }> {
    requirePermission(input.actor, 'results.approve_correction');
    const actorId = new mongoose.Types.ObjectId(input.actor.userId);
    return mongoose.connection.transaction(async (session) => {
      const request = await ResultCorrectionRequestModel.findOne({
        _id: input.requestResourceId,
        status: 'APPROVED',
      })
        .session(session)
        .lean();
      if (request === null) throw new ConflictError('Only an approved correction can be applied.');
      const entry = await ResultEntryModel.findById(request.resultEntryId).session(session).lean();
      const batch = await ResultBatchModel.findOne({
        _id: request.resultBatchId,
        status: 'PUBLISHED',
      })
        .session(session)
        .lean();
      if (entry === null || batch === null) {
        throw new DomainConflictError(
          'The published result is no longer available for correction.',
        );
      }
      const proposed = request.proposedValue;
      const set: Record<string, unknown> = {
        components: proposed.components,
        exempt: proposed.exempt,
        validationState: 'COMPLETE',
        ...(proposed.grade === undefined ? {} : { grade: proposed.grade }),
        ...(proposed.percentageDisplay === undefined
          ? {}
          : { percentageDisplay: proposed.percentageDisplay }),
        ...(proposed.percentageExact === undefined
          ? {}
          : { percentageExact: proposed.percentageExact }),
        ...(proposed.subjectMaximumHundredths === undefined
          ? {}
          : { subjectMaximumHundredths: proposed.subjectMaximumHundredths }),
        ...(proposed.totalHundredths === undefined
          ? {}
          : { totalHundredths: proposed.totalHundredths }),
      };
      const unset: Record<string, 1> = {};
      for (const field of [
        'grade',
        'percentageDisplay',
        'percentageExact',
        'subjectMaximumHundredths',
        'totalHundredths',
      ] as const) {
        if (proposed[field] === undefined) unset[field] = 1;
      }
      const entryResult = await ResultEntryModel.updateOne(
        { _id: entry._id, correctionRevision: entry.correctionRevision },
        {
          $inc: { correctionRevision: 1 },
          $set: set,
          ...(Object.keys(unset).length === 0 ? {} : { $unset: unset }),
        },
        { session },
      );
      if (entryResult.modifiedCount !== 1)
        throw new ConflictError('The result changed before correction.');

      let newReportId: string | undefined;
      const currentReport = await TermReportModel.findOne({
        current: true,
        enrollmentId: entry.enrollmentId,
        status: 'PUBLISHED',
        'subjects.resultEntryId': entry._id,
      })
        .session(session)
        .lean();
      if (currentReport !== null) {
        const correctedSubjects: ReportSubjectSnapshotRecord[] = currentReport.subjects.map(
          (subject) =>
            subject.resultEntryId.toString() === entry._id.toString()
              ? {
                  ...subject,
                  components: proposed.exempt
                    ? subject.components.map((component) => ({
                        key: component.key,
                        label: component.label,
                        maximumHundredths: component.maximumHundredths,
                      }))
                    : proposed.components.map((component) => {
                        const prior = subject.components.find(({ key }) => key === component.key);
                        if (prior === undefined) {
                          throw new DomainConflictError(
                            'The report component snapshot is inconsistent.',
                          );
                        }
                        return {
                          key: component.key,
                          label: prior.label,
                          maximumHundredths: prior.maximumHundredths,
                          state: component.state,
                          ...(component.scoreHundredths === undefined
                            ? {}
                            : { scoreHundredths: component.scoreHundredths }),
                        };
                      }),
                  exempt: proposed.exempt,
                  ...(proposed.grade === undefined ? {} : { grade: proposed.grade }),
                  ...(proposed.percentageDisplay === undefined
                    ? {}
                    : { percentageDisplay: proposed.percentageDisplay }),
                  ...(proposed.percentageExact === undefined
                    ? {}
                    : { percentageExact: proposed.percentageExact }),
                  ...(proposed.subjectMaximumHundredths === undefined
                    ? {}
                    : { subjectMaximumHundredths: proposed.subjectMaximumHundredths }),
                  ...(proposed.totalHundredths === undefined
                    ? {}
                    : { totalHundredths: proposed.totalHundredths }),
                }
              : subject,
        );
        const average = calculateOverallAverage(
          correctedSubjects.map((subject) => ({
            exempt: subject.exempt,
            ...(subject.subjectMaximumHundredths === undefined
              ? {}
              : { subjectMaximumHundredths: subject.subjectMaximumHundredths }),
            ...(subject.totalHundredths === undefined
              ? {}
              : { totalHundredths: subject.totalHundredths }),
          })),
        );
        const superseded = await TermReportModel.updateOne(
          { _id: currentReport._id, current: true, status: 'PUBLISHED' },
          { $set: { current: false, status: 'SUPERSEDED' } },
          { session },
        );
        if (superseded.modifiedCount !== 1)
          throw new ConflictError('The term report changed before correction.');
        const [newReport] = await TermReportModel.create(
          [
            {
              academicSessionId: currentReport.academicSessionId,
              classLevelId: currentReport.classLevelId,
              classLevelName: currentReport.classLevelName,
              current: true,
              eligibleSubjectCount: average.eligibleSubjectCount,
              enrollmentId: currentReport.enrollmentId,
              overallAverageExact: average.exact,
              overallAverageRounded: average.rounded,
              publicationVersion: currentReport.publicationVersion + 1,
              publishedAt: new Date(),
              publishedByUserId: actorId,
              schoolName: currentReport.schoolName,
              sessionLabel: currentReport.sessionLabel,
              status: 'PUBLISHED',
              studentDisplayName: currentReport.studentDisplayName,
              studentId: currentReport.studentId,
              studentIdentifier: currentReport.studentIdentifier,
              subjects: correctedSubjects,
              termId: currentReport.termId,
              termName: currentReport.termName,
              ...(currentReport.classTeacherRemark === undefined
                ? {}
                : { classTeacherRemark: currentReport.classTeacherRemark }),
              ...(currentReport.principalRemark === undefined
                ? {}
                : { principalRemark: currentReport.principalRemark }),
              ...(currentReport.trackId === undefined ? {} : { trackId: currentReport.trackId }),
              ...(currentReport.trackName === undefined
                ? {}
                : { trackName: currentReport.trackName }),
            },
          ],
          { session },
        );
        if (newReport === undefined) throw new Error('Corrected report creation failed.');
        newReportId = newReport._id.toString();
      }
      const correctionResult = await ResultCorrectionRequestModel.updateOne(
        { _id: request._id, status: 'APPROVED' },
        {
          $set: {
            appliedAt: new Date(),
            appliedByUserId: actorId,
            status: 'APPLIED',
            ...(newReportId === undefined ? {} : { appliedReportId: newReportId }),
          },
        },
        { session },
      );
      if (correctionResult.modifiedCount !== 1) throw new ConflictError();
      const student = await StudentModel.findById(entry.studentId).session(session).lean();
      if (student !== null) {
        await createNotifications(
          [
            {
              body: 'An approved correction has been applied to a published result.',
              deduplicationKey: `result-correction:${request._id.toString()}:applied`,
              recipientUserId: student.userId,
              resourceId: newReportId ?? entry._id.toString(),
              resourceType: newReportId === undefined ? 'ResultEntry' : 'TermReport',
              sourceEventId: `result-correction:${request._id.toString()}:applied`,
              title: 'Result correction applied',
              type: 'RESULT_CORRECTION_APPLIED',
            },
          ],
          session,
        );
      }
      await this.#audit.append(
        {
          action: 'RESULT_CORRECTION_APPLIED',
          actorType: 'USER',
          actorUserId: actorId,
          changes: {
            after: { exempt: proposed.exempt },
            before: { exempt: request.existingValue.exempt },
            reportVersionCreated: newReportId,
          },
          correlationId: request.auditCorrelationId,
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: request._id.toString(),
          targetType: 'ResultCorrectionRequest',
        },
        session,
      );
      await OutboxEventModel.create(
        [
          {
            aggregateId: request._id.toString(),
            aggregateType: 'ResultCorrectionRequest',
            eventId: `result-correction:${request._id.toString()}:applied`,
            eventType: 'RESULT_CORRECTION_APPLIED',
            occurredAt: new Date(),
            payload: {
              resultEntryId: entry._id.toString(),
              ...(newReportId === undefined ? {} : { reportId: newReportId }),
            },
            status: 'PENDING',
            transactionActorId: actorId,
          },
        ],
        { session },
      );
      return newReportId === undefined ? {} : { reportId: newReportId };
    });
  }

  async #authorizeTeacherScope(
    principal: ResultPrincipal,
    batch: ResultBatchRecord,
  ): Promise<void> {
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
}
