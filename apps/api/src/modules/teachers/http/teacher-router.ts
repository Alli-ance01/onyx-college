import type { ErrorEnvelope } from '@onyx/contracts';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { NotFoundError } from '../../../app/errors/app-error.js';
import { objectId, optionalString, sendData } from '../../../app/http/route-utils.js';
import type { AppEnvironment } from '../../../config/environment.js';
import type { PrincipalResolver } from '../../identity/application/auth-records.js';
import {
  createAuthenticationMiddleware,
  requireAuthenticatedPrincipal,
  requireAnyPermission,
  requirePermission,
} from '../../identity/http/authentication-middleware.js';
import { requireTrustedBrowserOrigin } from '../../identity/http/browser-request-security.js';
import { validateBody } from '../../identity/http/validation.js';
import type { AccessTokenService } from '../../identity/infrastructure/access-token-service.js';
import { CredentialCrypto } from '../../identity/infrastructure/credential-crypto.js';
import type { MongoSessionRepository } from '../../identity/infrastructure/mongo-session-repository.js';
import { EnrollmentService } from '../../enrollments/application/enrollment-service.js';
import { TeacherService } from '../application/teacher-service.js';

const invitationSchema = z
  .object({
    email: z.email().max(254),
    invitedName: z.string().trim().min(2).max(160),
  })
  .strict();
const invitationAcceptanceSchema = z
  .object({
    address: z.string().trim().max(500).optional(),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    middleName: z.string().trim().max(100).optional(),
    password: z.string().min(12).max(128),
    passwordConfirmation: z.string().min(1).max(128),
    phone: z.string().trim().min(7).max(32).optional(),
    qualifications: z.string().trim().max(2_000).optional(),
    token: z.string().min(32).max(512),
    username: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/u),
  })
  .strict()
  .refine((body) => body.password === body.passwordConfirmation, {
    message: 'Passwords do not match.',
    path: ['passwordConfirmation'],
  });
const reasonSchema = z.object({ reason: z.string().trim().min(5).max(1_000) }).strict();
const decisionSchema = z.object({ note: z.string().trim().min(5).max(1_000) }).strict();
const directTeacherSchema = z
  .object({
    email: z.email().max(254).optional(),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(7).max(32).optional(),
    username: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/u),
  })
  .strict();
const assignmentSchema = z
  .object({
    academicSessionId: z.string(),
    classLevelId: z.string(),
    subjectId: z.string().optional(),
    teacherId: z.string(),
    trackId: z.string().optional(),
    type: z.enum(['CLASS_TEACHER', 'TEACHING']),
  })
  .strict();
const revokeAssignmentSchema = reasonSchema.extend({ type: z.enum(['CLASS_TEACHER', 'TEACHING']) });

function setupLimiter(environment: AppEnvironment) {
  return rateLimit({
    handler: (request, response) => {
      const envelope: ErrorEnvelope = {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many setup attempts. Please try again later.',
          requestId: request.requestId,
        },
      };
      response.status(429).json(envelope);
    },
    legacyHeaders: false,
    limit: 5,
    standardHeaders: 'draft-8',
    windowMs: environment.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1_000,
  });
}

export function createTeacherRouter(dependencies: {
  accessTokens: AccessTokenService;
  environment: AppEnvironment;
  principals: PrincipalResolver;
  sessions: MongoSessionRepository;
}): Router {
  const router = Router();
  const authenticate = createAuthenticationMiddleware(dependencies);
  const teachers = new TeacherService(
    new CredentialCrypto(dependencies.environment.AUTH_REFRESH_TOKEN_PEPPER),
  );
  const enrollments = new EnrollmentService();

  router.post(
    '/teacher-invitations/accept',
    requireTrustedBrowserOrigin(dependencies.environment.WEB_ORIGIN),
    setupLimiter(dependencies.environment),
    validateBody(invitationAcceptanceSchema),
    async (request, response) => {
      const body = invitationAcceptanceSchema.parse(request.body);
      sendData(
        response,
        await teachers.acceptInvitation({
          firstName: body.firstName,
          lastName: body.lastName,
          password: body.password,
          requestId: request.requestId,
          token: body.token,
          username: body.username,
          ...(body.address === undefined ? {} : { address: body.address }),
          ...(body.middleName === undefined ? {} : { middleName: body.middleName }),
          ...(body.phone === undefined ? {} : { phone: body.phone }),
          ...(body.qualifications === undefined ? {} : { qualifications: body.qualifications }),
        }),
        201,
      );
    },
  );

  router.use(
    ['/teacher-invitations', '/teacher-registrations', '/teachers', '/teaching-assignments'],
    authenticate,
  );

  router.get('/teachers/me', async (request, response) => {
    sendData(response, await teachers.getMine(requireAuthenticatedPrincipal(request).userId));
  });
  router.get('/teachers/me/academic-assignments', async (request, response) => {
    const profile = await teachers.getMine(requireAuthenticatedPrincipal(request).userId);
    sendData(response, await teachers.listAssignments(profile.teacher.id));
  });
  router.get('/teachers/me/students', async (request, response) => {
    const profile = await teachers.getMine(requireAuthenticatedPrincipal(request).userId);
    const requestedAssignmentId = optionalString(request.query.assignmentId);
    const assignments = (await teachers.listAssignments(profile.teacher.id)).filter(
      (assignment) =>
        assignment.status === 'ACTIVE' &&
        (requestedAssignmentId === undefined || assignment.id === requestedAssignmentId),
    );
    if (requestedAssignmentId !== undefined && assignments.length === 0) throw new NotFoundError();
    const roster = new Map<string, Awaited<ReturnType<EnrollmentService['list']>>[number]>();
    for (const assignment of assignments) {
      const entries = await enrollments.list({
        teacherUserId: requireAuthenticatedPrincipal(request).userId,
        academicSessionId: assignment.academicSession.id,
        classLevelId: assignment.classLevel.id,
        ...(assignment.track === undefined ? {} : { trackId: assignment.track.id }),
      });
      for (const entry of entries.filter((item) => item.status === 'ACTIVE'))
        roster.set(entry.id, entry);
    }
    sendData(response, [...roster.values()]);
  });

  router.get('/teachers', requirePermission('teachers.read'), async (request, response) => {
    const status = optionalString(request.query.status) as
      'ACTIVE' | 'ARCHIVED' | 'INACTIVE' | 'PENDING_APPROVAL' | 'SUSPENDED' | undefined;
    sendData(response, await teachers.listTeachers(status));
  });
  router.post(
    '/teachers',
    requirePermission('teachers.create'),
    validateBody(directTeacherSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = directTeacherSchema.parse(request.body);
      sendData(
        response,
        await teachers.createDirect({
          actorUserId: principal.userId,
          firstName: body.firstName,
          lastName: body.lastName,
          requestId: request.requestId,
          username: body.username,
          ...(body.email === undefined ? {} : { email: body.email }),
          ...(body.phone === undefined ? {} : { phone: body.phone }),
        }),
        201,
      );
    },
  );

  router.get(
    '/teacher-invitations',
    requirePermission('teachers.invite'),
    async (_request, response) => {
      sendData(response, await teachers.listInvitations());
    },
  );
  router.post(
    '/teacher-invitations',
    requirePermission('teachers.invite'),
    validateBody(invitationSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = invitationSchema.parse(request.body);
      sendData(
        response,
        await teachers.invite({
          actorUserId: principal.userId,
          email: body.email,
          invitedName: body.invitedName,
          requestId: request.requestId,
        }),
        201,
      );
    },
  );
  router.post(
    '/teacher-invitations/:invitationId/revoke',
    requirePermission('teachers.invite'),
    validateBody(reasonSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = reasonSchema.parse(request.body);
      await teachers.revokeInvitation({
        actorUserId: principal.userId,
        invitationId: objectId(request.params.invitationId, 'Invitation'),
        reason: body.reason,
        requestId: request.requestId,
      });
      sendData(response, { revoked: true });
    },
  );

  router.get(
    '/teacher-registrations',
    requireAnyPermission('teachers.read', 'teachers.approve'),
    async (request, response) => {
      const status = optionalString(request.query.status) as
        | 'APPROVED'
        | 'CHANGES_REQUESTED'
        | 'DRAFT'
        | 'REJECTED'
        | 'SUBMITTED'
        | 'UNDER_REVIEW'
        | undefined;
      sendData(response, await teachers.listRegistrations(status));
    },
  );
  for (const action of ['approve', 'reject'] as const) {
    router.post(
      `/teacher-registrations/:registrationId/${action}`,
      requirePermission('teachers.approve'),
      validateBody(decisionSchema),
      async (request, response) => {
        const principal = requireAuthenticatedPrincipal(request);
        const body = decisionSchema.parse(request.body);
        sendData(
          response,
          await teachers.decideRegistration({
            action: action === 'approve' ? 'APPROVE' : 'REJECT',
            actorUserId: principal.userId,
            note: body.note,
            registrationId: objectId(request.params.registrationId, 'Teacher registration'),
            requestId: request.requestId,
          }),
        );
      },
    );
  }

  router.get(
    '/teaching-assignments',
    requireAnyPermission('teachers.read', 'teachers.assign'),
    async (request, response) => {
      const teacherId = request.query.teacherId;
      sendData(
        response,
        await teachers.listAssignments(
          teacherId === undefined ? undefined : objectId(teacherId, 'Teacher'),
        ),
      );
    },
  );
  router.post(
    '/teaching-assignments',
    requirePermission('teachers.assign'),
    validateBody(assignmentSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = assignmentSchema.parse(request.body);
      const id = await teachers.assign({
        academicSessionId: objectId(body.academicSessionId, 'Academic session'),
        actorUserId: principal.userId,
        classLevelId: objectId(body.classLevelId, 'Class level'),
        requestId: request.requestId,
        teacherId: objectId(body.teacherId, 'Teacher'),
        type: body.type,
        ...(body.subjectId === undefined ? {} : { subjectId: objectId(body.subjectId, 'Subject') }),
        ...(body.trackId === undefined ? {} : { trackId: objectId(body.trackId, 'Track') }),
      });
      sendData(response, { id }, 201);
    },
  );
  router.post(
    '/teaching-assignments/:assignmentId/revoke',
    requirePermission('teachers.assign'),
    validateBody(revokeAssignmentSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = revokeAssignmentSchema.parse(request.body);
      await teachers.revokeAssignment({
        actorUserId: principal.userId,
        assignmentId: objectId(request.params.assignmentId, 'Academic assignment'),
        reason: body.reason,
        requestId: request.requestId,
        type: body.type,
      });
      sendData(response, { revoked: true });
    },
  );

  return router;
}
