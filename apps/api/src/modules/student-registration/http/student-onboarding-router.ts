import {
  registrationStatuses,
  studentLifecycleStatuses,
  type ErrorEnvelope,
  type RegistrationCustomField,
  type RegistrationDraftInput,
  type SuccessEnvelope,
} from '@onyx/contracts';
import { raw, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import { z } from 'zod';

import { ValidationError } from '../../../app/errors/app-error.js';
import type { AppEnvironment } from '../../../config/environment.js';
import { AcademicSetupService } from '../../academics/application/academic-setup-service.js';
import { DocumentRequirementModel } from '../../documents/infrastructure/document-models.js';
import type { StudentDocumentService } from '../../documents/application/student-document-service.js';
import {
  createAuthenticationMiddleware,
  requireAuthenticatedPrincipal,
  requirePermission,
} from '../../identity/http/authentication-middleware.js';
import { requireTrustedBrowserOrigin } from '../../identity/http/browser-request-security.js';
import { validateBody } from '../../identity/http/validation.js';
import type { AccessTokenService } from '../../identity/infrastructure/access-token-service.js';
import type { MongoSessionRepository } from '../../identity/infrastructure/mongo-session-repository.js';
import type { PrincipalResolver } from '../../identity/application/auth-records.js';
import { StudentService } from '../../students/application/student-service.js';
import { RegistrationApprovalService } from '../application/registration-approval-service.js';
import { RegistrationConfigurationService } from '../application/registration-configuration-service.js';
import { RegistrationService } from '../application/registration-service.js';
import { StudentSignupService } from '../application/student-signup-service.js';
import { registrationDraftSchema } from '../domain/registration-policy.js';

const signupSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/u),
    email: z.email().max(254).optional(),
    phone: z.string().trim().min(7).max(32).optional(),
    password: z.string().min(12).max(128),
    passwordConfirmation: z.string().min(1).max(128),
  })
  .strict()
  .refine((value) => value.password === value.passwordConfirmation, {
    message: 'Passwords do not match.',
    path: ['passwordConfirmation'],
  });
const decisionSchema = z.object({ note: z.string().trim().min(5).max(1000) }).strict();
const changesSchema = decisionSchema
  .extend({ allowedCorrectionFields: z.array(z.string().min(1).max(120)).min(1).max(30) })
  .strict();
const duplicateSchema = z
  .object({
    reason: z.string().trim().min(5).max(1000),
    resolution: z.enum(['CONFIRMED_DISTINCT', 'DUPLICATE_REJECTED', 'ORIGINAL_REOPENED']),
  })
  .strict();
const approvalSchema = z
  .object({
    academicSessionId: z.string(),
    classLevelId: z.string(),
    trackId: z.string().optional(),
  })
  .strict();
const sessionSchema = z
  .object({ activeTermOrdinal: z.number().int().min(1).max(3), label: z.string().trim() })
  .strict();
const documentReviewSchema = z
  .object({
    note: z.string().trim().max(1000).optional(),
    status: z.enum(['REJECTED', 'VERIFIED']),
  })
  .strict();
const correctionSchema = z
  .object({
    field: z.string().trim(),
    reason: z.string().trim().min(5).max(1000),
    requestedValue: z.string().trim().min(1).max(500),
  })
const correctionDecisionSchema = z.object({ reason: z.string().trim().min(5).max(1000) }).strict();
const updateStudentProfileSchema = z
  .object({
    biodata: z
      .object({
        dateOfBirth: z.string().trim().min(1).optional(),
        firstName: z.string().trim().min(1).optional(),
        gender: z.string().trim().min(1).optional(),
        lga: z.string().trim().optional(),
        middleName: z.string().trim().optional(),
        nationality: z.string().trim().min(1).optional(),
        residentialAddress: z.string().trim().min(1).optional(),
        stateOfOrigin: z.string().trim().optional(),
        surname: z.string().trim().min(1).optional(),
      })
      .strict()
      .optional(),
    guardians: z
      .array(
        z.object({
          emergencyContact: z.boolean().optional(),
          fullName: z.string().trim().min(1),
          phone: z.string().trim().min(1),
          primary: z.boolean().optional(),
          relationship: z.string().trim().min(1),
        }),
      )
      .optional(),
    medical: z
      .object({
        allergies: z.string().trim().optional(),
        bloodGroup: z.string().trim().optional(),
        emergencyInstructions: z.string().trim().optional(),
        genotype: z.string().trim().optional(),
        medicalConditions: z.string().trim().optional(),
        medications: z.string().trim().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const configurationFieldSchema = z
  .object({
    displayOrder: z.number().int().min(0).max(10_000),
    enabled: z.boolean(),
    helpText: z.string().trim().max(500).optional(),
    key: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1).max(120),
    placeholder: z.string().trim().max(200).optional(),
    required: z.boolean(),
    section: z.string().trim().min(1).max(120),
  })
  .strict();
const customFieldSchema = configurationFieldSchema
  .extend({
    options: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    type: z.enum([
      'TEXT',
      'TEXTAREA',
      'NUMBER',
      'DATE',
      'SELECT',
      'MULTISELECT',
      'BOOLEAN',
      'EMAIL',
      'PHONE',
    ]),
    validation: z
      .object({
        earliestDate: z.iso.date().optional(),
        latestDate: z.iso.date().optional(),
        maximum: z.number().optional(),
        maximumLength: z.number().int().min(0).max(10_000).optional(),
        minimum: z.number().optional(),
        minimumLength: z.number().int().min(0).max(10_000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const registrationConfigurationSchema = z
  .object({
    canonicalFields: z.array(configurationFieldSchema).min(1).max(100),
    customFields: z.array(customFieldSchema).max(100),
  })
  .strict();

function validateObjectId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value))
    throw new ValidationError(`${label} is invalid.`);
  return value;
}

function optionalObjectId(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return validateObjectId(value, label);
}

function limiter(windowSeconds: number, limit: number) {
  return rateLimit({
    handler: (request, response) => {
      const envelope: ErrorEnvelope = {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
          requestId: request.requestId,
        },
      };
      response.status(429).json(envelope);
    },
    legacyHeaders: false,
    limit,
    standardHeaders: 'draft-8',
    windowMs: windowSeconds * 1000,
  });
}

export function createStudentOnboardingRouter(dependencies: {
  accessTokens: AccessTokenService;
  documents: StudentDocumentService;
  environment: AppEnvironment;
  principals: PrincipalResolver;
  sessions: MongoSessionRepository;
}): Router {
  const router = Router();
  const authenticate = createAuthenticationMiddleware(dependencies);
  const registrations = new RegistrationService();
  const approval = new RegistrationApprovalService();
  const students = new StudentService();
  const academics = new AcademicSetupService();
  const signup = new StudentSignupService();
  const configuration = new RegistrationConfigurationService();
  const trustedOrigin = requireTrustedBrowserOrigin(dependencies.environment.WEB_ORIGIN);

  router.post(
    '/student-signups',
    trustedOrigin,
    limiter(
      dependencies.environment.AUTH_RATE_LIMIT_WINDOW_SECONDS,
      dependencies.environment.STUDENT_SIGNUP_RATE_LIMIT_MAX,
    ),
    validateBody(signupSchema),
    async (request, response) => {
      const body = signupSchema.parse(request.body);
      const result = await signup.create(
        {
          username: body.username,
          password: body.password,
          ...(body.email === undefined ? {} : { email: body.email }),
          ...(body.phone === undefined ? {} : { phone: body.phone }),
        },
        request.requestId,
      );
      const envelope: SuccessEnvelope<typeof result> = { data: result };
      response
        .status(201)
        .location(`/api/v1/student-registrations/${result.registrationId}`)
        .json(envelope);
    },
  );

  router.use(
    [
      '/academic-setup',
      '/document-requirements',
      '/profile-correction-requests',
      '/registration-form-configurations',
      '/student-documents',
      '/student-registrations',
      '/students',
    ],
    authenticate,
  );
  router.get('/academic-setup', async (_request, response) =>
    response.json({ data: await academics.get() }),
  );
  router.post(
    '/academic-setup/activate-initial-session',
    requirePermission('sessions.manage', 'terms.manage'),
    validateBody(sessionSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      response.status(201).json({
        data: await academics.activateInitialSession(
          sessionSchema.parse(request.body),
          principal.userId,
          request.requestId,
        ),
      });
    },
  );

  router.get('/student-registrations/me', async (request, response) =>
    response.json({
      data: await registrations.getMine(requireAuthenticatedPrincipal(request).userId),
    }),
  );
  router.patch(
    '/student-registrations/me',
    validateBody(registrationDraftSchema),
    async (request, response) =>
      response.json({
        data: await registrations.saveMine(
          requireAuthenticatedPrincipal(request).userId,
          registrationDraftSchema.parse(request.body) as RegistrationDraftInput,
        ),
      }),
  );
  router.post('/student-registrations/me/submit', async (request, response) =>
    response.json({
      data: await registrations.submitMine(
        requireAuthenticatedPrincipal(request).userId,
        request.requestId,
      ),
    }),
  );
  router.get('/document-requirements', async (_request, response) => {
    const requirements = await DocumentRequirementModel.find({ active: true })
      .sort({ label: 1 })
      .lean();
    response.json({
      data: requirements.map((item) => ({
        acceptedMimeTypes: item.acceptedMimeTypes,
        code: item.code,
        description: item.description,
        id: item._id.toString(),
        label: item.label,
        maximumBytes: item.maximumBytes,
        requiredForRegistration: item.requiredForRegistration,
      })),
    });
  });
  router.put(
    '/student-documents/:requirementId/content',
    trustedOrigin,
    (request, response, next) => {
      raw({
        type: ['image/jpeg', 'image/png', 'application/pdf'],
        limit: dependencies.environment.DOCUMENT_MAX_BYTES,
      })(request, response, next);
    },
    async (request, response) => {
      if (!Buffer.isBuffer(request.body))
        throw new ValidationError('A binary document body is required.');
      const requirementId = validateObjectId(request.params.requirementId, 'Document requirement');
      const documentId = await dependencies.documents.upload({
        body: request.body,
        displayName: request.header('x-file-name') ?? 'document',
        mimeType: request.header('content-type') ?? '',
        requestId: request.requestId,
        requirementId,
        userId: requireAuthenticatedPrincipal(request).userId,
      });
      response
        .status(201)
        .location(`/api/v1/student-documents/${documentId}`)
        .json({ data: { id: documentId } });
    },
  );
  router.delete('/student-documents/:documentId', async (request, response) => {
    await dependencies.documents.remove(
      validateObjectId(request.params.documentId, 'Document'),
      requireAuthenticatedPrincipal(request).userId,
      request.requestId,
    );
    response.status(204).end();
  });
  router.get('/student-documents/:documentId/download-url', async (request, response) => {
    const access = await dependencies.documents.createDownloadAccess(
      validateObjectId(request.params.documentId, 'Document'),
      requireAuthenticatedPrincipal(request),
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.json({ data: access });
  });
  router.get('/student-documents/:documentId/content', async (request, response) => {
    const result = await dependencies.documents.download(
      validateObjectId(request.params.documentId, 'Document'),
      requireAuthenticatedPrincipal(request),
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Type', result.stored.contentType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${result.displayName.replace(/["\\]/gu, '')}"`,
    );
    response.send(result.stored.body);
  });

  router.get(
    '/student-registrations',
    requirePermission('students.read'),
    async (request, response) => {
      const statusParam = request.query['filter[status]'] ?? request.query.status;
      const status = registrationStatuses.find((item) => item === statusParam);
      response.json({
        data: await registrations.listAdmin({
          ...(request.query['filter[duplicateReview]'] === 'true' ||
          request.query.duplicateReview === 'true'
            ? { duplicateReview: true }
            : {}),
          ...(typeof request.query.q === 'string' ? { q: request.query.q } : {}),
          ...(status === undefined ? {} : { status }),
        }),
      });
    },
  );
  router.get(
    '/student-registrations/:registrationId',
    requirePermission('students.read'),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      response.json({
        data: await registrations.getAdmin(
          validateObjectId(request.params.registrationId, 'Registration'),
          principal.permissions.includes('students.read_sensitive'),
        ),
      });
    },
  );
  router.post(
    '/student-registrations/:registrationId/start-review',
    requirePermission('students.approve_registration'),
    async (request, response) =>
      response.json({
        data: await registrations.transitionAdmin({
          action: 'BEGIN_REVIEW',
          actorUserId: requireAuthenticatedPrincipal(request).userId,
          registrationId: validateObjectId(request.params.registrationId, 'Registration'),
          requestId: request.requestId,
        }),
      }),
  );
  router.post(
    '/student-registrations/:registrationId/request-changes',
    requirePermission('students.approve_registration'),
    validateBody(changesSchema),
    async (request, response) => {
      const body = changesSchema.parse(request.body);
      response.json({
        data: await registrations.transitionAdmin({
          action: 'REQUEST_CHANGES',
          actorUserId: requireAuthenticatedPrincipal(request).userId,
          allowedCorrectionFields: body.allowedCorrectionFields,
          note: body.note,
          registrationId: validateObjectId(request.params.registrationId, 'Registration'),
          requestId: request.requestId,
        }),
      });
    },
  );
  for (const [path, action] of [
    ['reject', 'REJECT'],
    ['reopen', 'REOPEN'],
  ] as const)
    router.post(
      `/student-registrations/:registrationId/${path}`,
      requirePermission('students.approve_registration'),
      validateBody(decisionSchema),
      async (request, response) => {
        const body = decisionSchema.parse(request.body);
        response.json({
          data: await registrations.transitionAdmin({
            action,
            actorUserId: requireAuthenticatedPrincipal(request).userId,
            note: body.note,
            registrationId: validateObjectId(request.params.registrationId, 'Registration'),
            requestId: request.requestId,
          }),
        });
      },
    );
  router.post(
    '/student-registrations/:registrationId/resolve-duplicate',
    requirePermission('students.approve_registration'),
    validateBody(duplicateSchema),
    async (request, response) => {
      const body = duplicateSchema.parse(request.body);
      response.json({
        data: await registrations.resolveDuplicate({
          actorUserId: requireAuthenticatedPrincipal(request).userId,
          reason: body.reason,
          registrationId: validateObjectId(request.params.registrationId, 'Registration'),
          requestId: request.requestId,
          resolution: body.resolution,
        }),
      });
    },
  );
  router.post(
    '/student-registrations/:registrationId/approve',
    requirePermission('students.approve_registration'),
    validateBody(approvalSchema),
    async (request, response) => {
      const key = request.header('idempotency-key');
      if (key === undefined || key.length < 16 || key.length > 128)
        throw new ValidationError('A valid Idempotency-Key header is required.');
      const body = approvalSchema.parse(request.body);
      response.json({
        data: await approval.approve({
          academicSessionId: body.academicSessionId,
          classLevelId: body.classLevelId,
          ...(body.trackId === undefined ? {} : { trackId: body.trackId }),
          actorUserId: requireAuthenticatedPrincipal(request).userId,
          idempotencyKey: key,
          registrationId: validateObjectId(request.params.registrationId, 'Registration'),
          requestId: request.requestId,
        }),
      });
    },
  );
  router.post(
    '/student-documents/:documentId/review',
    requirePermission('documents.review'),
    validateBody(documentReviewSchema),
    async (request, response) => {
      const body = documentReviewSchema.parse(request.body);
      await dependencies.documents.review({
        actorUserId: requireAuthenticatedPrincipal(request).userId,
        documentId: validateObjectId(request.params.documentId, 'Document'),
        ...(body.note === undefined ? {} : { note: body.note }),
        requestId: request.requestId,
        status: body.status,
      });
      response.status(204).end();
    },
  );

  router.get('/students/me/dashboard', async (request, response) =>
    response.json({
      data: await students.dashboardForUser(requireAuthenticatedPrincipal(request).userId),
    }),
  );
  router.get('/students/me/profile', async (request, response) =>
    response.json({
      data: await students.profileForUser(requireAuthenticatedPrincipal(request).userId),
    }),
  );
  router.post(
    '/students/me/profile-correction-requests',
    validateBody(correctionSchema),
    async (request, response) => {
      const body = correctionSchema.parse(request.body);
      const result = await students.createCorrection({
        ...body,
        requestId: request.requestId,
        userId: requireAuthenticatedPrincipal(request).userId,
      });
      response.status(201).json({ data: result });
    },
  );
  router.get('/students', requirePermission('students.read'), async (request, response) => {
    const principal = requireAuthenticatedPrincipal(request);
    const status = studentLifecycleStatuses.find(
      (item) => item === request.query['filter[status]'],
    );
    const cursor = optionalObjectId(request.query.cursor, 'Cursor');
    const classLevelId = optionalObjectId(request.query['filter[classLevelId]'], 'Class level');
    const sessionId = optionalObjectId(request.query['filter[sessionId]'], 'Academic session');
    const trackId = optionalObjectId(request.query['filter[trackId]'], 'Track');
    const result = await students.directory({
      ...(principal.accountType === 'TEACHER' ? { teacherUserId: principal.userId } : {}),
      ...(cursor === undefined ? {} : { cursor }),
      ...(typeof request.query.q === 'string' ? { q: request.query.q } : {}),
      ...(classLevelId === undefined ? {} : { classLevelId }),
      ...(typeof request.query['filter[gender]'] === 'string'
        ? { gender: request.query['filter[gender]'] }
        : {}),
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(trackId === undefined ? {} : { trackId }),
      ...(status === undefined ? {} : { status }),
    });
    response.json({
      data: result.items,
      meta: {
        hasMore: result.nextCursor !== undefined,
        nextCursor: result.nextCursor,
        pageSize: 25,
      },
    });
  });
  router.get(
    '/students/:studentId',
    requirePermission('students.read'),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      response.json({
        data: await students.profileForAdmin(
          validateObjectId(request.params.studentId, 'Student'),
          principal.permissions.includes('students.read_sensitive'),
          principal.accountType === 'TEACHER' ? principal.userId : undefined,
        ),
      });
    },
  );
  router.patch(
    '/students/:studentId',
    requirePermission('students.update'),
    validateBody(updateStudentProfileSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const studentId = validateObjectId(request.params.studentId, 'Student');
      const body = updateStudentProfileSchema.parse(request.body);
      const updated = await students.updateProfileForAdmin({
        actorUserId: principal.userId,
        biodata: body.biodata,
        guardians: body.guardians,
        medical: principal.permissions.includes('students.read_sensitive')
          ? body.medical
          : undefined,
        requestId: request.requestId,
        studentId,
      });
      response.json({ data: updated });
    },
  );
  router.get(
    '/profile-correction-requests',
    requirePermission('students.manage_corrections'),
    async (request, response) =>
      response.json({
        data: await students.listCorrections(
          typeof request.query.status === 'string' ? request.query.status : undefined,
        ),
      }),
  );
  for (const [path, action] of [
    ['approve', 'APPROVE'],
    ['reject', 'REJECT'],
  ] as const)
    router.post(
      `/profile-correction-requests/:correctionId/${path}`,
      requirePermission('students.manage_corrections'),
      validateBody(correctionDecisionSchema),
      async (request, response) => {
        const body = correctionDecisionSchema.parse(request.body);
        response.json({
          data: await students.decideCorrection({
            action,
            actorUserId: requireAuthenticatedPrincipal(request).userId,
            correctionId: validateObjectId(request.params.correctionId, 'Correction request'),
            reason: body.reason,
            requestId: request.requestId,
          }),
        });
      },
    );

  router.post(
    '/registration-form-configurations',
    requirePermission('settings.manage'),
    validateBody(registrationConfigurationSchema),
    async (request, response) => {
      const body = registrationConfigurationSchema.parse(request.body);
      const result = await configuration.createVersion({
        actorUserId: requireAuthenticatedPrincipal(request).userId,
        canonicalFields: body.canonicalFields,
        customFields: body.customFields as RegistrationCustomField[],
        requestId: request.requestId,
      });
      response.status(201).json({ data: result });
    },
  );
  return router;
}
