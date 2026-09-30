import { Router } from 'express';
import { z } from 'zod';

import { AuthorizationError } from '../../../app/errors/app-error.js';
import {
  objectId,
  optionalObjectId,
  optionalString,
  principalSummary,
  sendData,
} from '../../../app/http/route-utils.js';
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
import { ReportPdfService } from '../application/report-pdf-service.js';
import { ResultBatchService } from '../application/result-batch-service.js';
import { ResultConfigurationService } from '../application/result-configuration-service.js';
import { ResultCorrectionService } from '../application/result-correction-service.js';
import { MongoResultSettingsPolicy } from '../application/result-settings-policy.js';

const decimal = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/u);
const assessmentSchema = z
  .object({
    academicSessionId: z.string(),
    code: z.string().trim().min(2).max(32),
    components: z
      .array(
        z
          .object({
            key: z.string().trim().min(1).max(64),
            label: z.string().trim().min(1).max(120),
            maximum: decimal,
          })
          .strict(),
      )
      .min(1)
      .max(20),
    name: z.string().trim().min(2).max(160),
    totalMaximum: decimal,
  })
  .strict();
const gradingSchema = z
  .object({
    academicSessionId: z.string(),
    bands: z
      .array(
        z
          .object({
            grade: z.string().trim().min(1).max(20),
            maximumPercentage: decimal,
            minimumPercentage: decimal,
            remark: z.string().trim().max(160).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    code: z.string().trim().min(2).max(32),
    name: z.string().trim().min(2).max(160),
  })
  .strict();
const createBatchSchema = z
  .object({
    assessmentSchemeId: z.string(),
    gradingSchemeId: z.string(),
    teachingAssignmentId: z.string(),
    termId: z.string(),
  })
  .strict();
const resultComponentSchema = z
  .object({
    key: z.string().trim().min(1).max(64),
    score: decimal.optional(),
    state: z.enum(['ABSENT', 'SCORED']),
  })
  .strict();
const resultEntrySchema = z
  .object({
    components: z.array(resultComponentSchema).max(20),
    exempt: z.boolean(),
  })
  .strict();
const optionalNoteSchema = z.object({ note: z.string().trim().max(2_000).optional() }).strict();
const requiredNoteSchema = z.object({ note: z.string().trim().min(5).max(2_000) }).strict();
const correctionRequestSchema = resultEntrySchema
  .extend({ reason: z.string().trim().min(5).max(2_000) })
  .strict();

function resultPrincipal(request: Parameters<typeof requireAuthenticatedPrincipal>[0]) {
  return principalSummary(requireAuthenticatedPrincipal(request));
}

export function createResultRouter(dependencies: {
  accessTokens: AccessTokenService;
  principals: PrincipalResolver;
  sessions: MongoSessionRepository;
}): Router {
  const router = Router();
  const policy = new MongoResultSettingsPolicy();
  const batches = new ResultBatchService({
    classPositionPolicy: policy,
    schoolIdentity: policy,
  });
  const configuration = new ResultConfigurationService();
  const corrections = new ResultCorrectionService();
  const pdf = new ReportPdfService();

  router.use('/results', createAuthenticationMiddleware(dependencies));

  router.get(
    '/results/assessment-schemes',
    requireAnyPermission('results.configure', 'results.enter', 'results.read_all'),
    async (request, response) => {
      const academicSessionId = optionalObjectId(
        request.query.academicSessionId,
        'Academic session',
      );
      sendData(response, await configuration.listAssessmentSchemes(academicSessionId));
    },
  );
  router.post(
    '/results/assessment-schemes',
    requirePermission('results.configure'),
    validateBody(assessmentSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = assessmentSchema.parse(request.body);
      sendData(
        response,
        await configuration.createAssessmentScheme({
          academicSessionId: objectId(body.academicSessionId, 'Academic session'),
          actorUserId: principal.userId,
          code: body.code,
          components: body.components,
          name: body.name,
          requestId: request.requestId,
          totalMaximum: body.totalMaximum,
        }),
        201,
      );
    },
  );
  router.post(
    '/results/assessment-schemes/:schemeId/activate',
    requirePermission('results.configure'),
    async (request, response) => {
      await configuration.activateAssessmentScheme({
        actorUserId: requireAuthenticatedPrincipal(request).userId,
        requestId: request.requestId,
        schemeId: objectId(request.params.schemeId, 'Assessment scheme'),
      });
      sendData(response, { activated: true });
    },
  );

  router.get(
    '/results/grading-schemes',
    requireAnyPermission('results.configure', 'results.enter', 'results.read_all'),
    async (request, response) => {
      const academicSessionId = optionalObjectId(
        request.query.academicSessionId,
        'Academic session',
      );
      sendData(response, await configuration.listGradingSchemes(academicSessionId));
    },
  );
  router.post(
    '/results/grading-schemes',
    requirePermission('results.configure'),
    validateBody(gradingSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = gradingSchema.parse(request.body);
      sendData(
        response,
        await configuration.createGradingScheme({
          academicSessionId: objectId(body.academicSessionId, 'Academic session'),
          actorUserId: principal.userId,
          bands: body.bands.map((band) => ({
            grade: band.grade,
            maximumPercentage: band.maximumPercentage,
            minimumPercentage: band.minimumPercentage,
            ...(band.remark === undefined ? {} : { remark: band.remark }),
          })),
          code: body.code,
          name: body.name,
          requestId: request.requestId,
        }),
        201,
      );
    },
  );
  router.post(
    '/results/grading-schemes/:schemeId/activate',
    requirePermission('results.configure'),
    async (request, response) => {
      await configuration.activateGradingScheme({
        actorUserId: requireAuthenticatedPrincipal(request).userId,
        requestId: request.requestId,
        schemeId: objectId(request.params.schemeId, 'Grading scheme'),
      });
      sendData(response, { activated: true });
    },
  );

  router.get('/results/batches', async (request, response) => {
    const academicSessionId = optionalObjectId(request.query.academicSessionId, 'Academic session');
    const classLevelId = optionalObjectId(request.query.classLevelId, 'Class level');
    const subjectId = optionalObjectId(request.query.subjectId, 'Subject');
    const termId = optionalObjectId(request.query.termId, 'Term');
    const status = optionalString(request.query.status) as
      | 'APPROVED'
      | 'DRAFT'
      | 'PUBLISHED'
      | 'RETURNED_FOR_CORRECTION'
      | 'SUBMITTED'
      | 'UNDER_REVIEW'
      | undefined;
    sendData(
      response,
      await batches.listBatches(resultPrincipal(request), {
        ...(academicSessionId === undefined ? {} : { academicSessionId }),
        ...(classLevelId === undefined ? {} : { classLevelId }),
        ...(status === undefined ? {} : { status }),
        ...(subjectId === undefined ? {} : { subjectId }),
        ...(termId === undefined ? {} : { termId }),
      }),
    );
  });
  router.get('/results/batches/:batchId', async (request, response) => {
    sendData(
      response,
      await batches.getBatch(
        resultPrincipal(request),
        objectId(request.params.batchId, 'Result batch'),
      ),
    );
  });
  router.post(
    '/results/batches',
    requirePermission('results.enter'),
    validateBody(createBatchSchema),
    async (request, response) => {
      const body = createBatchSchema.parse(request.body);
      const id = await batches.createBatch({
        actor: resultPrincipal(request),
        assessmentSchemeId: objectId(body.assessmentSchemeId, 'Assessment scheme'),
        gradingSchemeId: objectId(body.gradingSchemeId, 'Grading scheme'),
        requestId: request.requestId,
        teachingAssignmentId: objectId(body.teachingAssignmentId, 'Teaching assignment'),
        termId: objectId(body.termId, 'Term'),
      });
      sendData(response, { id }, 201);
    },
  );
  router.put(
    '/results/entries/:entryId',
    requirePermission('results.enter'),
    validateBody(resultEntrySchema),
    async (request, response) => {
      const body = resultEntrySchema.parse(request.body);
      await batches.saveEntry({
        actor: resultPrincipal(request),
        components: body.components.map((component) => ({
          key: component.key,
          state: component.state,
          ...(component.score === undefined ? {} : { score: component.score }),
        })),
        entryId: objectId(request.params.entryId, 'Result entry'),
        exempt: body.exempt,
        requestId: request.requestId,
      });
      sendData(response, { updated: true });
    },
  );
  router.post(
    '/results/batches/:batchId/submit',
    requirePermission('results.submit'),
    async (request, response) => {
      await batches.submit({
        actor: resultPrincipal(request),
        batchId: objectId(request.params.batchId, 'Result batch'),
        requestId: request.requestId,
      });
      sendData(response, { submitted: true });
    },
  );
  router.post(
    '/results/batches/:batchId/start-review',
    requirePermission('results.review'),
    validateBody(optionalNoteSchema),
    async (request, response) => {
      const body = optionalNoteSchema.parse(request.body);
      await batches.startReview({
        actor: resultPrincipal(request),
        batchId: objectId(request.params.batchId, 'Result batch'),
        requestId: request.requestId,
        ...(body.note === undefined ? {} : { note: body.note }),
      });
      sendData(response, { status: 'UNDER_REVIEW' });
    },
  );
  router.post(
    '/results/batches/:batchId/return-for-correction',
    requirePermission('results.review'),
    validateBody(requiredNoteSchema),
    async (request, response) => {
      const body = requiredNoteSchema.parse(request.body);
      await batches.returnForCorrection({
        actor: resultPrincipal(request),
        batchId: objectId(request.params.batchId, 'Result batch'),
        note: body.note,
        requestId: request.requestId,
      });
      sendData(response, { status: 'RETURNED_FOR_CORRECTION' });
    },
  );
  router.post(
    '/results/batches/:batchId/approve',
    requirePermission('results.approve'),
    validateBody(optionalNoteSchema),
    async (request, response) => {
      const body = optionalNoteSchema.parse(request.body);
      await batches.approve({
        actor: resultPrincipal(request),
        batchId: objectId(request.params.batchId, 'Result batch'),
        requestId: request.requestId,
        ...(body.note === undefined ? {} : { note: body.note }),
      });
      sendData(response, { status: 'APPROVED' });
    },
  );
  router.post(
    '/results/batches/:batchId/publish',
    requirePermission('results.publish'),
    async (request, response) => {
      sendData(
        response,
        await batches.publish({
          actor: resultPrincipal(request),
          batchId: objectId(request.params.batchId, 'Result batch'),
          requestId: request.requestId,
        }),
      );
    },
  );

  router.get('/results/subjects', async (request, response) => {
    const principal = requireAuthenticatedPrincipal(request);
    if (principal.accountType !== 'STUDENT') throw new AuthorizationError();
    sendData(response, await batches.listOwnPublishedSubjectResults(principal.userId));
  });
  router.get('/results/reports', async (request, response) => {
    const principal = requireAuthenticatedPrincipal(request);
    if (principal.accountType !== 'STUDENT') throw new AuthorizationError();
    sendData(response, await batches.listOwnPublishedReports(principal.userId));
  });
  router.get('/results/reports/:reportId', async (request, response) => {
    const principal = requireAuthenticatedPrincipal(request);
    if (principal.accountType !== 'STUDENT') throw new AuthorizationError();
    sendData(
      response,
      await batches.getOwnPublishedReport(
        principal.userId,
        objectId(request.params.reportId, 'Term report'),
      ),
    );
  });
  router.get('/results/reports/:reportId/pdf', async (request, response) => {
    const principal = requireAuthenticatedPrincipal(request);
    const reportId = objectId(request.params.reportId, 'Term report');
    const bytes =
      principal.accountType === 'STUDENT'
        ? await pdf.generateOwnReport(principal.userId, reportId)
        : principal.permissions.includes('results.read_all')
          ? await pdf.generateAuthorizedReport(reportId)
          : (() => {
              throw new AuthorizationError();
            })();
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="term-report-${reportId}.pdf"`);
    response.send(Buffer.from(bytes));
  });

  router.get('/results/corrections', async (request, response) => {
    const status = optionalString(request.query.status) as
      'APPLIED' | 'APPROVED' | 'REJECTED' | 'SUBMITTED' | 'UNDER_REVIEW' | undefined;
    sendData(response, await corrections.list(resultPrincipal(request), status));
  });
  router.post(
    '/results/entries/:entryId/correction-requests',
    requirePermission('results.request_correction'),
    validateBody(correctionRequestSchema),
    async (request, response) => {
      const body = correctionRequestSchema.parse(request.body);
      sendData(
        response,
        await corrections.request({
          actor: resultPrincipal(request),
          components: body.components.map((component) => ({
            key: component.key,
            state: component.state,
            ...(component.score === undefined ? {} : { score: component.score }),
          })),
          exempt: body.exempt,
          reason: body.reason,
          requestId: request.requestId,
          resultEntryId: objectId(request.params.entryId, 'Result entry'),
        }),
        201,
      );
    },
  );
  router.post(
    '/results/corrections/:correctionId/start-review',
    requirePermission('results.approve_correction'),
    validateBody(optionalNoteSchema),
    async (request, response) => {
      const body = optionalNoteSchema.parse(request.body);
      await corrections.startReview({
        actor: resultPrincipal(request),
        requestId: request.requestId,
        requestResourceId: objectId(request.params.correctionId, 'Result correction'),
        ...(body.note === undefined ? {} : { note: body.note }),
      });
      sendData(response, { status: 'UNDER_REVIEW' });
    },
  );
  router.post(
    '/results/corrections/:correctionId/approve',
    requirePermission('results.approve_correction'),
    validateBody(optionalNoteSchema),
    async (request, response) => {
      const body = optionalNoteSchema.parse(request.body);
      await corrections.approve({
        actor: resultPrincipal(request),
        requestId: request.requestId,
        requestResourceId: objectId(request.params.correctionId, 'Result correction'),
        ...(body.note === undefined ? {} : { note: body.note }),
      });
      sendData(response, { status: 'APPROVED' });
    },
  );
  router.post(
    '/results/corrections/:correctionId/reject',
    requirePermission('results.approve_correction'),
    validateBody(requiredNoteSchema),
    async (request, response) => {
      const body = requiredNoteSchema.parse(request.body);
      await corrections.reject({
        actor: resultPrincipal(request),
        note: body.note,
        requestId: request.requestId,
        requestResourceId: objectId(request.params.correctionId, 'Result correction'),
      });
      sendData(response, { status: 'REJECTED' });
    },
  );
  router.post(
    '/results/corrections/:correctionId/apply',
    requirePermission('results.approve_correction'),
    async (request, response) => {
      sendData(
        response,
        await corrections.apply({
          actor: resultPrincipal(request),
          requestId: request.requestId,
          requestResourceId: objectId(request.params.correctionId, 'Result correction'),
        }),
      );
    },
  );

  return router;
}
