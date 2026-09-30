import type {
  AcademicSessionDto,
  AnnouncementDto,
  AssessmentSchemeDto,
  AssignmentDto,
  AuthSessionSummary,
  ClassTeacherAssignmentDto,
  EnrollmentDto,
  GradingSchemeDto,
  NotificationDto,
  ResultBatchDto,
  SuccessEnvelope,
  TeacherDto,
  TeacherRegistrationDto,
  TeachingAssignmentDto,
} from '@onyx/contracts';

import type { ApiClient } from '../../lib/api/api-client.js';

export interface TeacherProfileResponse {
  registration: TeacherRegistrationDto;
  teacher: TeacherDto;
}

async function data<T>(request: Promise<SuccessEnvelope<T>>): Promise<T> {
  return (await request).data;
}

export const teacherQueryKeys = {
  announcements: ['teacher', 'announcements'] as const,
  assignments: ['teacher', 'assignments'] as const,
  batches: ['teacher', 'result-batches'] as const,
  notifications: ['teacher', 'notifications'] as const,
  profile: ['teacher', 'profile'] as const,
  roster: ['teacher', 'roster'] as const,
  schemes: ['teacher', 'result-schemes'] as const,
  sessions: ['teacher', 'sessions'] as const,
  teachingAssignments: ['teacher', 'academic-assignments'] as const,
  resultBatch: (batchId: string) => ['teacher', 'result-batch', batchId] as const,
};

export const teacherApi = {
  profile(client: ApiClient): Promise<TeacherProfileResponse> {
    return data(client.request('/teachers/me'));
  },
  academicAssignments(
    client: ApiClient,
  ): Promise<readonly (ClassTeacherAssignmentDto | TeachingAssignmentDto)[]> {
    return data(client.request('/teachers/me/academic-assignments'));
  },
  roster(client: ApiClient, assignmentId?: string): Promise<readonly EnrollmentDto[]> {
    const query =
      assignmentId === undefined ? '' : `?assignmentId=${encodeURIComponent(assignmentId)}`;
    return data(client.request(`/teachers/me/students${query}`));
  },
  assignments(client: ApiClient): Promise<readonly AssignmentDto[]> {
    return data(client.request('/assignments'));
  },
  createAssignment(
    client: ApiClient,
    input: { dueAt: string; instructions: string; teachingAssignmentId: string; title: string },
  ): Promise<{ id: string }> {
    return data(client.request('/assignments', { body: input, method: 'POST' }));
  },
  publishAssignment(client: ApiClient, id: string): Promise<{ published: boolean }> {
    return data(client.request(`/assignments/${id}/publish`, { method: 'POST' }));
  },
  archiveAssignment(client: ApiClient, id: string): Promise<{ archived: boolean }> {
    return data(client.request(`/assignments/${id}/archive`, { method: 'POST' }));
  },
  uploadAssignmentAttachment(
    client: ApiClient,
    assignmentId: string,
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<SuccessEnvelope<{ id: string }>> {
    return client.uploadWithMethod(
      `/assignments/${assignmentId}/attachments`,
      file,
      'POST',
      onProgress,
    );
  },
  announcements(client: ApiClient): Promise<readonly AnnouncementDto[]> {
    return data(client.request('/announcements'));
  },
  createAnnouncement(
    client: ApiClient,
    input: {
      audience: { classLevelId?: string; trackId?: string; type: 'CLASS' | 'CLASS_TRACK' };
      body: string;
      expiresAt?: string;
      title: string;
    },
  ): Promise<{ id: string }> {
    return data(client.request('/announcements', { body: input, method: 'POST' }));
  },
  publishAnnouncement(client: ApiClient, id: string): Promise<{ published: boolean }> {
    return data(client.request(`/announcements/${id}/publish`, { method: 'POST' }));
  },
  withdrawAnnouncement(client: ApiClient, id: string): Promise<{ withdrawn: boolean }> {
    return data(client.request(`/announcements/${id}/withdraw`, { method: 'POST' }));
  },
  sessions(client: ApiClient): Promise<readonly AcademicSessionDto[]> {
    return data(client.request('/academic-sessions'));
  },
  assessmentSchemes(client: ApiClient): Promise<readonly AssessmentSchemeDto[]> {
    return data(client.request('/results/assessment-schemes'));
  },
  gradingSchemes(client: ApiClient): Promise<readonly GradingSchemeDto[]> {
    return data(client.request('/results/grading-schemes'));
  },
  resultBatches(client: ApiClient): Promise<readonly ResultBatchDto[]> {
    return data(client.request('/results/batches'));
  },
  resultBatch(client: ApiClient, batchId: string): Promise<ResultBatchDto> {
    return data(client.request(`/results/batches/${batchId}`));
  },
  createResultBatch(
    client: ApiClient,
    input: {
      assessmentSchemeId: string;
      gradingSchemeId: string;
      teachingAssignmentId: string;
      termId: string;
    },
  ): Promise<{ id: string }> {
    return data(client.request('/results/batches', { body: input, method: 'POST' }));
  },
  saveResultEntry(
    client: ApiClient,
    entryId: string,
    input: {
      components: readonly { key: string; score?: string; state: 'ABSENT' | 'SCORED' }[];
      exempt: boolean;
    },
  ): Promise<{ updated: boolean }> {
    return data(client.request(`/results/entries/${entryId}`, { body: input, method: 'PUT' }));
  },
  submitResultBatch(client: ApiClient, batchId: string): Promise<{ submitted: boolean }> {
    return data(client.request(`/results/batches/${batchId}/submit`, { method: 'POST' }));
  },
  requestResultCorrection(
    client: ApiClient,
    entryId: string,
    input: {
      components: readonly { key: string; score?: string; state: 'ABSENT' | 'SCORED' }[];
      exempt: boolean;
      reason: string;
    },
  ): Promise<{ id: string }> {
    return data(
      client.request(`/results/entries/${entryId}/correction-requests`, {
        body: input,
        method: 'POST',
      }),
    );
  },
  notifications(client: ApiClient): Promise<readonly NotificationDto[]> {
    return data(client.request('/notifications'));
  },
  markNotificationRead(client: ApiClient, id: string): Promise<{ updated: boolean }> {
    return data(client.request(`/notifications/${id}/read`, { method: 'POST' }));
  },
  markAllNotificationsRead(client: ApiClient): Promise<{ updated: boolean }> {
    return data(client.request('/notifications/read-all', { method: 'POST' }));
  },
  accountSessions(client: ApiClient): Promise<readonly AuthSessionSummary[]> {
    return data(client.request('/auth/sessions'));
  },
  revokeSession(client: ApiClient, id: string): Promise<void> {
    return client.request(`/auth/sessions/${id}`, { method: 'DELETE' });
  },
  logoutOthers(client: ApiClient): Promise<{ revokedCount: number }> {
    return data(client.request('/auth/logout-others', { method: 'POST' }));
  },
};
