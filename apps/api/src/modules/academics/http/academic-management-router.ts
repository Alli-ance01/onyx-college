import { Router } from 'express';
import { z } from 'zod';

import { AuthorizationError, NotFoundError } from '../../../app/errors/app-error.js';
import { objectId, optionalObjectId, sendData } from '../../../app/http/route-utils.js';
import type { PrincipalResolver } from '../../identity/application/auth-records.js';
import {
  createAuthenticationMiddleware,
  requireAuthenticatedPrincipal,
  requireAnyPermission,
  requirePermission,
} from '../../identity/http/authentication-middleware.js';
import { validateBody } from '../../identity/http/validation.js';
import type { AccessTokenService } from '../../identity/infrastructure/access-token-service.js';
import type { MongoSessionRepository } from '../../identity/infrastructure/mongo-session-repository.js';
import { EnrollmentService } from '../../enrollments/application/enrollment-service.js';
import { EnrollmentModel } from '../../enrollments/infrastructure/enrollment-model.js';
import { StudentModel } from '../../students/infrastructure/student-models.js';
import { SubjectService } from '../../subjects/application/subject-service.js';
import { requireTeacherEnrollmentAccess } from '../../teachers/application/teaching-scope-policy.js';
import { AcademicAdminService } from '../application/academic-admin-service.js';

const createSessionSchema = z
  .object({
    label: z
      .string()
      .trim()
      .regex(/^\d{4}\/\d{4}$/u),
  })
  .strict();
const activateContextSchema = z.object({ termId: z.string() }).strict();
const createSubjectSchema = z
  .object({
    code: z.string().trim().min(2).max(20),
    description: z.string().trim().max(1_000).optional(),
    name: z.string().trim().min(2).max(160),
  })
  .strict();
const updateSubjectSchema = z
  .object({
    description: z.string().trim().max(1_000).optional(),
    name: z.string().trim().min(2).max(160).optional(),
    status: z.enum(['ACTIVE', 'RETIRED']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one change.');
const offeringSchema = z
  .object({
    academicSessionId: z.string(),
    classification: z.enum(['OPTIONAL', 'REQUIRED']),
    classLevelId: z.string(),
    subjectId: z.string(),
    trackId: z.string().optional(),
  })
  .strict();
const overrideSchema = z
  .object({
    action: z.enum(['ADD', 'REMOVE']),
    reason: z.string().trim().min(5).max(1_000),
    subjectId: z.string(),
  })
  .strict();
const subjectChangeRequestSchema = z
  .object({
    action: z.enum(['ADD', 'REMOVE']),
    reason: z.string().trim().min(5).max(1_000),
    subjectId: z.string(),
  })
  .strict();
const subjectChangeDecisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    decisionReason: z.string().trim().min(5).max(1_000),
  })
  .strict();
const progressionSchema = z
  .object({
    destinationClassLevelId: z.string().optional(),
    destinationSessionId: z.string().optional(),
    destinationTrackId: z.string().optional(),
    outcome: z.enum(['PROMOTE', 'REPEAT', 'WITHDRAW', 'TRANSFER', 'GRADUATE']),
    reason: z.string().trim().min(5).max(1_000),
  })
  .strict();

async function requireCurriculumAccess(
  principal: ReturnType<typeof requireAuthenticatedPrincipal>,
  enrollmentId: string,
): Promise<void> {
  if (
    principal.accountType !== 'TEACHER' &&
    (principal.permissions.includes('enrollments.read') ||
      principal.permissions.includes('enrollments.manage'))
  ) {
    return;
  }
  if (principal.accountType === 'STUDENT') {
    const [student, enrollment] = await Promise.all([
      StudentModel.findOne({ userId: principal.userId }).lean(),
      EnrollmentModel.findById(enrollmentId).lean(),
    ]);
    if (student === null || enrollment?.studentId.toString() !== student._id.toString()) {
      throw new NotFoundError();
    }
    return;
  }
  if (principal.accountType === 'TEACHER') {
    await requireTeacherEnrollmentAccess(principal.userId, enrollmentId);
    return;
  }
  throw new AuthorizationError();
}

export function createAcademicManagementRouter(dependencies: {
  accessTokens: AccessTokenService;
  principals: PrincipalResolver;
  sessions: MongoSessionRepository;
}): Router {
  const router = Router();
  const academics = new AcademicAdminService();
  const enrollments = new EnrollmentService();
  const subjects = new SubjectService();

  router.use(
    [
      '/academic-sessions',
      '/class-levels',
      '/enrollments',
      '/subject-offerings',
      '/subject-change-requests',
      '/subjects',
      '/tracks',
    ],
    createAuthenticationMiddleware(dependencies),
  );

  router.get('/academic-sessions', async (_request, response) => {
    sendData(response, await academics.listSessions());
  });
  router.post(
    '/academic-sessions',
    requirePermission('sessions.manage'),
    validateBody(createSessionSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = createSessionSchema.parse(request.body);
      sendData(
        response,
        await academics.createSession({
          actorUserId: principal.userId,
          label: body.label,
          requestId: request.requestId,
        }),
        201,
      );
    },
  );
  router.post(
    '/academic-sessions/:sessionId/activate',
    requirePermission('sessions.manage', 'terms.manage'),
    validateBody(activateContextSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = activateContextSchema.parse(request.body);
      sendData(
        response,
        await academics.activateContext({
          academicSessionId: objectId(request.params.sessionId, 'Academic session'),
          actorUserId: principal.userId,
          requestId: request.requestId,
          termId: objectId(body.termId, 'Term'),
        }),
      );
    },
  );
  router.get('/class-levels', async (_request, response) => {
    sendData(response, await academics.listClassLevels());
  });
  router.get('/tracks', async (_request, response) => {
    sendData(response, await academics.listTracks());
  });

  router.get('/subjects', async (_request, response) => {
    sendData(response, await subjects.listSubjects());
  });
  router.post(
    '/subjects',
    requirePermission('subjects.manage'),
    validateBody(createSubjectSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = createSubjectSchema.parse(request.body);
      sendData(
        response,
        await subjects.createSubject({
          actorUserId: principal.userId,
          code: body.code,
          name: body.name,
          requestId: request.requestId,
          ...(body.description === undefined ? {} : { description: body.description }),
        }),
        201,
      );
    },
  );
  router.patch(
    '/subjects/:subjectId',
    requirePermission('subjects.manage'),
    validateBody(updateSubjectSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = updateSubjectSchema.parse(request.body);
      sendData(
        response,
        await subjects.updateSubject({
          actorUserId: principal.userId,
          requestId: request.requestId,
          subjectId: objectId(request.params.subjectId, 'Subject'),
          ...(body.description === undefined ? {} : { description: body.description }),
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.status === undefined ? {} : { status: body.status }),
        }),
      );
    },
  );
  router.get(
    '/subject-offerings',
    requireAnyPermission('subject_offerings.manage', 'teachers.assign', 'results.configure'),
    async (request, response) => {
      const academicSessionId = optionalObjectId(
        request.query.academicSessionId,
        'Academic session',
      );
      const classLevelId = optionalObjectId(request.query.classLevelId, 'Class level');
      const trackId = optionalObjectId(request.query.trackId, 'Track');
      sendData(
        response,
        await subjects.listOfferings({
          ...(academicSessionId === undefined ? {} : { academicSessionId }),
          ...(classLevelId === undefined ? {} : { classLevelId }),
          ...(trackId === undefined ? {} : { trackId }),
        }),
      );
    },
  );
  router.post(
    '/subject-offerings',
    requirePermission('subject_offerings.manage'),
    validateBody(offeringSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = offeringSchema.parse(request.body);
      const id = await subjects.createOffering({
        academicSessionId: objectId(body.academicSessionId, 'Academic session'),
        actorUserId: principal.userId,
        classification: body.classification,
        classLevelId: objectId(body.classLevelId, 'Class level'),
        requestId: request.requestId,
        subjectId: objectId(body.subjectId, 'Subject'),
        ...(body.trackId === undefined ? {} : { trackId: objectId(body.trackId, 'Track') }),
      });
      sendData(response, { id }, 201);
    },
  );

  router.get(
    '/enrollments',
    requireAnyPermission('enrollments.read', 'enrollments.manage'),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const academicSessionId = optionalObjectId(
        request.query.academicSessionId,
        'Academic session',
      );
      const classLevelId = optionalObjectId(request.query.classLevelId, 'Class level');
      const studentId = optionalObjectId(request.query.studentId, 'Student');
      const trackId = optionalObjectId(request.query.trackId, 'Track');
      sendData(
        response,
        await enrollments.list({
          ...(principal.accountType === 'TEACHER' ? { teacherUserId: principal.userId } : {}),
          ...(academicSessionId === undefined ? {} : { academicSessionId }),
          ...(classLevelId === undefined ? {} : { classLevelId }),
          ...(studentId === undefined ? {} : { studentId }),
          ...(trackId === undefined ? {} : { trackId }),
        }),
      );
    },
  );
  router.get('/enrollments/:enrollmentId/curriculum', async (request, response) => {
    const principal = requireAuthenticatedPrincipal(request);
    const enrollmentId = objectId(request.params.enrollmentId, 'Enrollment');
    await requireCurriculumAccess(principal, enrollmentId);
    sendData(response, await subjects.curriculumForEnrollment(enrollmentId));
  });
  router.get('/enrollments/:enrollmentId/subject-change-options', async (request, response) => {
    const principal = requireAuthenticatedPrincipal(request);
    const enrollmentId = objectId(request.params.enrollmentId, 'Enrollment');
    await requireCurriculumAccess(principal, enrollmentId);
    sendData(response, await subjects.subjectChangeOptions(enrollmentId));
  });
  router.put(
    '/enrollments/:enrollmentId/subject-overrides',
    requirePermission('enrollments.manage'),
    validateBody(overrideSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = overrideSchema.parse(request.body);
      sendData(
        response,
        await subjects.setOverride({
          action: body.action,
          actorUserId: principal.userId,
          enrollmentId: objectId(request.params.enrollmentId, 'Enrollment'),
          reason: body.reason,
          requestId: request.requestId,
          subjectId: objectId(body.subjectId, 'Subject'),
        }),
      );
    },
  );
  router.delete(
    '/enrollments/:enrollmentId/subject-overrides/:subjectId',
    requirePermission('enrollments.manage'),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      await subjects.revokeOverride({
        actorUserId: principal.userId,
        enrollmentId: objectId(request.params.enrollmentId, 'Enrollment'),
        reason: typeof request.query.reason === 'string' ? request.query.reason : undefined,
        requestId: request.requestId,
        subjectId: objectId(request.params.subjectId, 'Subject'),
      });
      response.status(204).end();
    },
  );
  router.get(
    '/subject-change-requests',
    requirePermission('enrollments.manage'),
    async (request, response) => {
      const status = request.query.status;
      sendData(
        response,
        await subjects.listSubjectChangeRequests({
          ...(status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED'
            ? { status }
            : {}),
        }),
      );
    },
  );
  router.get('/subject-change-requests/mine', async (request, response) => {
    const principal = requireAuthenticatedPrincipal(request);
    if (principal.accountType !== 'STUDENT') throw new AuthorizationError();
    sendData(
      response,
      await subjects.listSubjectChangeRequests({ studentUserId: principal.userId }),
    );
  });
  router.post(
    '/enrollments/:enrollmentId/subject-change-requests',
    validateBody(subjectChangeRequestSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      if (principal.accountType !== 'STUDENT') throw new AuthorizationError();
      const body = subjectChangeRequestSchema.parse(request.body);
      sendData(
        response,
        await subjects.requestSubjectChange({
          action: body.action,
          enrollmentId: objectId(request.params.enrollmentId, 'Enrollment'),
          reason: body.reason,
          requestId: request.requestId,
          subjectId: objectId(body.subjectId, 'Subject'),
          studentUserId: principal.userId,
        }),
        201,
      );
    },
  );
  router.post(
    '/subject-change-requests/:requestId/decision',
    requirePermission('enrollments.manage'),
    validateBody(subjectChangeDecisionSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = subjectChangeDecisionSchema.parse(request.body);
      sendData(
        response,
        await subjects.decideSubjectChangeRequest({
          actorUserId: principal.userId,
          decision: body.decision,
          decisionReason: body.decisionReason,
          requestId: request.requestId,
          requestRecordId: objectId(request.params.requestId, 'Subject-change request'),
        }),
      );
    },
  );
  router.post(
    '/enrollments/:enrollmentId/progress',
    requirePermission('enrollments.promote'),
    validateBody(progressionSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = progressionSchema.parse(request.body);
      sendData(
        response,
        await enrollments.progress({
          actorUserId: principal.userId,
          enrollmentId: objectId(request.params.enrollmentId, 'Enrollment'),
          outcome: body.outcome,
          reason: body.reason,
          requestId: request.requestId,
          ...(body.destinationClassLevelId === undefined
            ? {}
            : {
                destinationClassLevelId: objectId(
                  body.destinationClassLevelId,
                  'Destination class level',
                ),
              }),
          ...(body.destinationSessionId === undefined
            ? {}
            : {
                destinationSessionId: objectId(
                  body.destinationSessionId,
                  'Destination academic session',
                ),
              }),
          ...(body.destinationTrackId === undefined
            ? {}
            : { destinationTrackId: objectId(body.destinationTrackId, 'Destination track') }),
        }),
      );
    },
  );

  return router;
}
