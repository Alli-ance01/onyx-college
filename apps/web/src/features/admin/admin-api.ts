import type {
  AcademicSessionDto,
  AnnouncementDto,
  AssessmentSchemeDto,
  AssignmentDto,
  ClassLevelDto,
  ClassTeacherAssignmentDto,
  EnrollmentDto,
  GradingSchemeDto,
  NotificationDto,
  ResultBatchDto,
  ResultCorrectionRequestDto,
  SubjectDto,
  SubjectOfferingDto,
  SuccessEnvelope,
  TeacherDto,
  TeacherInvitationDto,
  TeacherRegistrationDto,
  TeachingAssignmentDto,
  TrackDto,
} from '@onyx/contracts';

import type { ApiClient } from '../../lib/api/api-client.js';

export interface PermissionSummary {
  code: string;
  description: string;
  domain: string;
  id: string;
  sensitivity: 'PRIVILEGED' | 'SENSITIVE' | 'STANDARD';
  status: 'ACTIVE' | 'RETIRED';
  systemManaged: boolean;
}

export interface RoleSummary {
  code: string;
  description: string;
  displayName: string;
  id: string;
  permissions: readonly PermissionSummary[];
  protected: boolean;
  status: 'ACTIVE' | 'RETIRED';
  systemManaged: boolean;
  version: number;
}

export interface UserAccessSummary {
  accountStatus: string;
  accountType: string;
  createdAt: string;
  email?: string;
  id: string;
  lastLoginAt?: string;
  mustChangePassword: boolean;
  phone?: string;
  roles: readonly { code: string; displayName: string; id: string }[];
  updatedAt: string;
  username: string;
  version: number;
}

export interface AuditLogSummary {
  action: string;
  actorType: 'SYSTEM' | 'USER';
  actorUserId?: string;
  changes?: unknown;
  id: string;
  occurredAt: string;
  outcome: 'DENIED' | 'FAILURE' | 'SUCCESS';
  reason?: string;
  requestId?: string;
  targetId: string;
  targetType: string;
}

export interface SchoolSettingsSummary {
  classPositionContexts: readonly {
    academicSessionId: string;
    classLevelId: string;
    enabled: boolean;
    termId: string;
    trackId?: string;
  }[];
  currentAcademicSessionId?: string;
  currentTermId?: string;
  id: string;
  schoolIdentity?: {
    address: string;
    contactEmail?: string;
    contactPhone?: string;
    displayName: string;
    motto?: string;
    websiteUrl?: string;
  };
  updatedAt: string;
  version: number;
}

export interface DocumentRequirementAdminSummary {
  acceptedMimeTypes: readonly string[];
  active: boolean;
  code: string;
  description?: string;
  id: string;
  label: string;
  maximumBytes: number;
  requiredForRegistration: boolean;
}

export interface StudentDocumentAdminSummary {
  createdAt: string;
  displayName: string;
  id: string;
  mimeType: string;
  ownerName: string;
  ownerUserId: string;
  provider: 'CLOUDINARY' | 'LOCAL';
  registrationId: string;
  requirement: { code: string; id: string; label: string };
  reviewNote?: string;
  reviewStatus: 'PENDING_REVIEW' | 'REJECTED' | 'VERIFIED';
  sizeBytes: number;
  status: string;
  uploadStatus: string;
}

async function data<T>(request: Promise<SuccessEnvelope<T>>): Promise<T> {
  return (await request).data;
}

export const adminQueryKeys = {
  academic: ['admin', 'academic'] as const,
  announcements: ['admin', 'announcements'] as const,
  assignments: ['admin', 'assignments'] as const,
  audit: ['admin', 'audit'] as const,
  correctionRequests: ['admin', 'result-corrections'] as const,
  documents: ['admin', 'documents'] as const,
  notifications: ['admin', 'notifications'] as const,
  resultBatches: ['admin', 'result-batches'] as const,
  resultConfiguration: ['admin', 'result-configuration'] as const,
  roles: ['admin', 'roles'] as const,
  settings: ['admin', 'settings'] as const,
  teachers: ['admin', 'teachers'] as const,
  users: ['admin', 'users'] as const,
};

export const adminApi = {
  sessions: (client: ApiClient) =>
    data<readonly AcademicSessionDto[]>(client.request('/academic-sessions')),
  classLevels: (client: ApiClient) =>
    data<readonly ClassLevelDto[]>(client.request('/class-levels')),
  tracks: (client: ApiClient) => data<readonly TrackDto[]>(client.request('/tracks')),
  subjects: (client: ApiClient) => data<readonly SubjectDto[]>(client.request('/subjects')),
  offerings: (client: ApiClient) =>
    data<readonly SubjectOfferingDto[]>(client.request('/subject-offerings')),
  enrollments: (client: ApiClient) =>
    data<readonly EnrollmentDto[]>(client.request('/enrollments')),
  createSession(client: ApiClient, label: string) {
    return data<AcademicSessionDto>(
      client.request('/academic-sessions', { body: { label }, method: 'POST' }),
    );
  },
  activateSession(client: ApiClient, sessionId: string, termId: string) {
    return data<AcademicSessionDto>(
      client.request(`/academic-sessions/${sessionId}/activate`, {
        body: { termId },
        method: 'POST',
      }),
    );
  },
  createSubject(client: ApiClient, input: { code: string; description?: string; name: string }) {
    return data<SubjectDto>(client.request('/subjects', { body: input, method: 'POST' }));
  },
  createOffering(
    client: ApiClient,
    input: {
      academicSessionId: string;
      classification: 'OPTIONAL' | 'REQUIRED';
      classLevelId: string;
      subjectId: string;
      trackId?: string;
    },
  ) {
    return data<{ id: string }>(
      client.request('/subject-offerings', { body: input, method: 'POST' }),
    );
  },
  progressEnrollment(
    client: ApiClient,
    id: string,
    input: {
      destinationClassLevelId?: string;
      destinationSessionId?: string;
      destinationTrackId?: string;
      outcome: 'GRADUATE' | 'PROMOTE' | 'REPEAT' | 'TRANSFER' | 'WITHDRAW';
      reason: string;
    },
  ) {
    return data<EnrollmentDto | { status: string }>(
      client.request(`/enrollments/${id}/progress`, { body: input, method: 'POST' }),
    );
  },

  teachers: (client: ApiClient) => data<readonly TeacherDto[]>(client.request('/teachers')),
  teacherRegistrations: (client: ApiClient) =>
    data<readonly TeacherRegistrationDto[]>(client.request('/teacher-registrations')),
  teacherInvitations: (client: ApiClient) =>
    data<readonly TeacherInvitationDto[]>(client.request('/teacher-invitations')),
  teachingAssignments: (client: ApiClient) =>
    data<readonly (ClassTeacherAssignmentDto | TeachingAssignmentDto)[]>(
      client.request('/teaching-assignments'),
    ),
  inviteTeacher(client: ApiClient, input: { email: string; invitedName: string }) {
    return data<{ invitation: TeacherInvitationDto; setupToken: string }>(
      client.request('/teacher-invitations', { body: input, method: 'POST' }),
    );
  },
  createTeacher(
    client: ApiClient,
    input: {
      email?: string;
      firstName: string;
      lastName: string;
      phone?: string;
      username: string;
    },
  ) {
    return data<{ teacherId: string; temporaryPassword: string; username: string }>(
      client.request('/teachers', { body: input, method: 'POST' }),
    );
  },
  decideTeacher(client: ApiClient, id: string, action: 'approve' | 'reject', note: string) {
    return data<TeacherRegistrationDto>(
      client.request(`/teacher-registrations/${id}/${action}`, { body: { note }, method: 'POST' }),
    );
  },
  assignTeacher(
    client: ApiClient,
    input: {
      academicSessionId: string;
      classLevelId: string;
      subjectId?: string;
      teacherId: string;
      trackId?: string;
      type: 'CLASS_TEACHER' | 'TEACHING';
    },
  ) {
    return data<{ id: string }>(
      client.request('/teaching-assignments', { body: input, method: 'POST' }),
    );
  },
  revokeTeachingAssignment(
    client: ApiClient,
    id: string,
    type: 'CLASS_TEACHER' | 'TEACHING',
    reason: string,
  ) {
    return data<{ revoked: boolean }>(
      client.request(`/teaching-assignments/${id}/revoke`, {
        body: { reason, type },
        method: 'POST',
      }),
    );
  },

  assignments: (client: ApiClient) =>
    data<readonly AssignmentDto[]>(client.request('/assignments')),
  archiveAssignment: (client: ApiClient, id: string) =>
    data<{ archived: boolean }>(client.request(`/assignments/${id}/archive`, { method: 'POST' })),
  announcements: (client: ApiClient) =>
    data<readonly AnnouncementDto[]>(client.request('/announcements')),
  createAnnouncement(
    client: ApiClient,
    input: {
      audience: { classLevelId?: string; trackId?: string; type: string };
      body: string;
      expiresAt?: string;
      title: string;
    },
  ) {
    return data<{ id: string }>(client.request('/announcements', { body: input, method: 'POST' }));
  },
  publishAnnouncement: (client: ApiClient, id: string) =>
    data<{ published: boolean }>(
      client.request(`/announcements/${id}/publish`, { method: 'POST' }),
    ),
  withdrawAnnouncement: (client: ApiClient, id: string) =>
    data<{ withdrawn: boolean }>(
      client.request(`/announcements/${id}/withdraw`, { method: 'POST' }),
    ),

  assessmentSchemes: (client: ApiClient) =>
    data<readonly AssessmentSchemeDto[]>(client.request('/results/assessment-schemes')),
  gradingSchemes: (client: ApiClient) =>
    data<readonly GradingSchemeDto[]>(client.request('/results/grading-schemes')),
  resultBatches: (client: ApiClient) =>
    data<readonly ResultBatchDto[]>(client.request('/results/batches')),
  resultBatch: (client: ApiClient, id: string) =>
    data<ResultBatchDto>(client.request(`/results/batches/${id}`)),
  resultCorrections: (client: ApiClient) =>
    data<readonly ResultCorrectionRequestDto[]>(client.request('/results/corrections')),
  createAssessmentScheme(
    client: ApiClient,
    input: {
      academicSessionId: string;
      code: string;
      components: readonly { key: string; label: string; maximum: string }[];
      name: string;
      totalMaximum: string;
    },
  ) {
    return data<AssessmentSchemeDto>(
      client.request('/results/assessment-schemes', { body: input, method: 'POST' }),
    );
  },
  activateAssessmentScheme: (client: ApiClient, id: string) =>
    data<{ activated: boolean }>(
      client.request(`/results/assessment-schemes/${id}/activate`, { method: 'POST' }),
    ),
  createGradingScheme(
    client: ApiClient,
    input: {
      academicSessionId: string;
      bands: readonly {
        grade: string;
        maximumPercentage: string;
        minimumPercentage: string;
        remark?: string;
      }[];
      code: string;
      name: string;
    },
  ) {
    return data<GradingSchemeDto>(
      client.request('/results/grading-schemes', { body: input, method: 'POST' }),
    );
  },
  activateGradingScheme: (client: ApiClient, id: string) =>
    data<{ activated: boolean }>(
      client.request(`/results/grading-schemes/${id}/activate`, { method: 'POST' }),
    ),
  transitionResultBatch(
    client: ApiClient,
    id: string,
    action: 'approve' | 'publish' | 'return-for-correction' | 'start-review',
    note?: string,
  ) {
    return data<Record<string, unknown>>(
      client.request(`/results/batches/${id}/${action}`, {
        body: action === 'publish' ? undefined : note === undefined ? {} : { note },
        method: 'POST',
      }),
    );
  },
  transitionCorrection(
    client: ApiClient,
    id: string,
    action: 'apply' | 'approve' | 'reject' | 'start-review',
    note?: string,
  ) {
    return data<Record<string, unknown>>(
      client.request(`/results/corrections/${id}/${action}`, {
        body: action === 'apply' ? undefined : note === undefined ? {} : { note },
        method: 'POST',
      }),
    );
  },

  users: (client: ApiClient) =>
    data<{ items: readonly UserAccessSummary[]; nextCursor?: string }>(
      client.request('/access/users?accountType=ADMINISTRATOR'),
    ),
  roles: (client: ApiClient) => data<readonly RoleSummary[]>(client.request('/access/roles')),
  permissions: (client: ApiClient) =>
    data<readonly PermissionSummary[]>(client.request('/access/permissions')),
  createAdministrator(
    client: ApiClient,
    input: { email?: string; phone?: string; roleCodes: readonly string[]; username: string },
  ) {
    return data<{ temporaryPassword: string; user: UserAccessSummary }>(
      client.request('/access/administrators', { body: input, method: 'POST' }),
    );
  },
  setAdministratorRoles(
    client: ApiClient,
    id: string,
    input: { expectedVersion: number; reason: string; roleCodes: readonly string[] },
  ) {
    return data<UserAccessSummary>(
      client.request(`/access/administrators/${id}/roles`, { body: input, method: 'PUT' }),
    );
  },
  setUserState(
    client: ApiClient,
    id: string,
    action: 'reactivate' | 'suspend',
    input: { expectedVersion: number; reason: string },
  ) {
    return data<UserAccessSummary>(
      client.request(`/access/users/${id}/${action}`, { body: input, method: 'POST' }),
    );
  },
  createRole(
    client: ApiClient,
    input: {
      code: string;
      description: string;
      displayName: string;
      permissionCodes: readonly string[];
    },
  ) {
    return data<RoleSummary>(client.request('/access/roles', { body: input, method: 'POST' }));
  },
  setRolePermissions(
    client: ApiClient,
    id: string,
    input: { expectedVersion: number; permissionCodes: readonly string[]; reason: string },
  ) {
    return data<RoleSummary>(
      client.request(`/access/roles/${id}/permissions`, { body: input, method: 'PUT' }),
    );
  },
  audit: (client: ApiClient) =>
    data<{ items: readonly AuditLogSummary[]; nextCursor?: string }>(
      client.request('/audit-logs?pageSize=50'),
    ),
  settings: (client: ApiClient) =>
    data<SchoolSettingsSummary | null>(client.request('/school-settings')),
  updateIdentity(
    client: ApiClient,
    input: {
      expectedVersion: number;
      identity: NonNullable<SchoolSettingsSummary['schoolIdentity']>;
    },
  ) {
    return data<SchoolSettingsSummary>(
      client.request('/school-settings/identity', { body: input, method: 'PUT' }),
    );
  },
  notifications: (client: ApiClient) =>
    data<readonly NotificationDto[]>(client.request('/notifications')),
  documentRequirements: (client: ApiClient) =>
    data<readonly DocumentRequirementAdminSummary[]>(
      client.request('/admin/document-requirements'),
    ),
  studentDocuments: (client: ApiClient) =>
    data<readonly StudentDocumentAdminSummary[]>(client.request('/admin/student-documents')),
  createDocumentRequirement(
    client: ApiClient,
    input: {
      acceptedMimeTypes: readonly ('application/pdf' | 'image/jpeg' | 'image/png')[];
      code: string;
      description?: string;
      label: string;
      maximumBytes: number;
      requiredForRegistration: boolean;
    },
  ) {
    return data<DocumentRequirementAdminSummary>(
      client.request('/admin/document-requirements', { body: input, method: 'POST' }),
    );
  },
  reviewDocument(
    client: ApiClient,
    id: string,
    input: { note?: string; status: 'REJECTED' | 'VERIFIED' },
  ): Promise<void> {
    return client.request(`/student-documents/${id}/review`, { body: input, method: 'POST' });
  },
};
