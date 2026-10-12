import type {
  AnnouncementDto,
  AssignmentDto,
  AuthSessionSummary,
  CurriculumSubjectDto,
  NotificationDto,
  StudentProfileDto,
  SubjectChangeRequestDto,
  SubjectOfferingDto,
  SuccessEnvelope,
  TermReportDto,
} from '@onyx/contracts';

import type { ApiClient } from '../../lib/api/api-client.js';

export const studentPortalQueryKeys = {
  announcements: ['student-portal', 'announcements'] as const,
  assignments: ['student-portal', 'assignments'] as const,
  notifications: ['student-portal', 'notifications'] as const,
  profile: ['student-profile', 'mine'] as const,
  reports: ['student-portal', 'reports'] as const,
  sessions: ['student-portal', 'account-sessions'] as const,
  curriculum: (enrollmentId: string) => ['student-portal', 'curriculum', enrollmentId] as const,
  subjectChangeRequests: ['student-portal', 'subject-change-requests'] as const,
  report: (reportId: string) => ['student-portal', 'report', reportId] as const,
};

async function data<T>(request: Promise<SuccessEnvelope<T>>): Promise<T> {
  return (await request).data;
}

export const studentPortalApi = {
  announcements(client: ApiClient): Promise<readonly AnnouncementDto[]> {
    return data(client.request('/announcements'));
  },
  assignments(client: ApiClient): Promise<readonly AssignmentDto[]> {
    return data(client.request('/assignments'));
  },
  curriculum(client: ApiClient, enrollmentId: string): Promise<readonly CurriculumSubjectDto[]> {
    return data(client.request(`/enrollments/${enrollmentId}/curriculum`));
  },
  subjectChangeOptions(
    client: ApiClient,
    enrollmentId: string,
  ): Promise<readonly SubjectOfferingDto[]> {
    return data(client.request(`/enrollments/${enrollmentId}/subject-change-options`));
  },
  subjectChangeRequests(client: ApiClient): Promise<readonly SubjectChangeRequestDto[]> {
    return data(client.request('/subject-change-requests/mine'));
  },
  requestSubjectChange(
    client: ApiClient,
    enrollmentId: string,
    input: { action: 'ADD' | 'REMOVE'; reason: string; subjectId: string },
  ): Promise<SubjectChangeRequestDto> {
    return data(
      client.request(`/enrollments/${enrollmentId}/subject-change-requests`, {
        body: input,
        method: 'POST',
      }),
    );
  },
  markAllNotificationsRead(client: ApiClient): Promise<{ updated: boolean }> {
    return data(client.request('/notifications/read-all', { method: 'POST' }));
  },
  markNotificationRead(client: ApiClient, notificationId: string): Promise<{ updated: boolean }> {
    return data(client.request(`/notifications/${notificationId}/read`, { method: 'POST' }));
  },
  notifications(client: ApiClient): Promise<readonly NotificationDto[]> {
    return data(client.request('/notifications'));
  },
  profile(client: ApiClient): Promise<StudentProfileDto> {
    return data(client.request('/students/me/profile'));
  },
  report(client: ApiClient, reportId: string): Promise<TermReportDto> {
    return data(client.request(`/results/reports/${reportId}`));
  },
  reports(client: ApiClient): Promise<readonly TermReportDto[]> {
    return data(client.request('/results/reports'));
  },
  revokeSession(client: ApiClient, sessionId: string): Promise<void> {
    return client.request(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
  },
  sessions(client: ApiClient): Promise<readonly AuthSessionSummary[]> {
    return data(client.request('/auth/sessions'));
  },
  logoutOtherSessions(client: ApiClient): Promise<{ revokedCount: number }> {
    return data(client.request('/auth/logout-others', { method: 'POST' }));
  },
};
