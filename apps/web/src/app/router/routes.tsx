import { RouteLoading } from './route-loading.js';
import { Navigate, type RouteObject } from 'react-router';

import { ChangePasswordPage, LoginPage } from '../../features/auth/auth-pages.js';
import { RequireAuthentication } from '../../features/auth/route-guards.js';
import {
  AdminAcademicSetupPage,
  AdminCorrectionQueuePage,
  AdminStudentDirectoryPage,
  AdminStudentProfilePage,
} from '../../features/admin/student-admin-pages.js';
import {
  AdminRegistrationQueuePage,
  AdminRegistrationReviewPage,
} from '../../features/admin/registration-review-pages.js';
import {
  AdminReferenceStructurePage,
  AdminSessionsPage,
} from '../../features/admin/academic-structure-pages.js';
import {
  AdminResultBatchPage,
  AdminResultCorrectionsPage,
  AdminResultQueuePage,
} from '../../features/admin/result-workflow-pages.js';
import { RouteErrorBoundary } from '../error-boundaries/route-error-boundary.js';
import { PortalLayout } from '../layouts/portal-layout.js';
import { PublicLayout } from '../layouts/public-layout.js';
import { NotFoundPage } from './not-found-page.js';
import { FoundationPage } from './foundation-page.js';
import { AdminDashboardPage } from '../../features/admin/system-admin-pages.js';
import { StudentSignupPage } from '../../features/student-onboarding/student-signup-page.js';
import { PortalNotificationsPage } from '../../features/account/portal-account-pages.js';
import { StudentNotificationsPage } from '../../features/student-portal/account-pages.js';

export const appRoutes: RouteObject[] = [
  {
    HydrateFallback: RouteLoading,
    path: '/',
    element: <PublicLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <FoundationPage />,
      },
      { path: 'auth', element: <Navigate replace to="/auth/login" /> },
      { path: 'auth/login', element: <LoginPage /> },
      { path: 'auth/change-password', element: <ChangePasswordPage /> },
      { path: 'student-signup', element: <StudentSignupPage /> },
      {
        path: 'teacher-setup',
        lazy: async () => ({
          Component: (await import('../../features/teachers/teacher-setup-page.js'))
            .TeacherSetupPage,
        }),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    HydrateFallback: RouteLoading,
    element: <RequireAuthentication portal="STUDENT" />,
    children: [
      {
        path: '/student',
        element: <PortalLayout portalName="Student Portal" />,
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            path: 'timetable',
            lazy: async () => ({
              Component: (await import('../../features/timetable/timetable-page.js')).TimetablePage,
            }),
          },
          { index: true, element: <Navigate replace to="dashboard" /> },
          {
            path: 'dashboard',
            lazy: async () => ({
              Component: (await import('../../features/students/student-pages.js'))
                .StudentDashboardPage,
            }),
          },
          {
            path: 'assignments',
            lazy: async () => ({
              Component: (await import('../../features/student-portal/communication-pages.js'))
                .StudentAssignmentsPage,
            }),
          },
          {
            path: 'announcements',
            lazy: async () => ({
              Component: (await import('../../features/student-portal/communication-pages.js'))
                .StudentAnnouncementsPage,
            }),
          },
          {
            path: 'results',
            lazy: async () => ({
              Component: (await import('../../features/student-portal/results-pages.js'))
                .StudentResultsPage,
            }),
          },
          {
            path: 'results/:reportId',
            lazy: async () => ({
              Component: (await import('../../features/student-portal/results-pages.js'))
                .StudentReportPage,
            }),
          },
          {
            path: 'subjects',
            lazy: async () => ({
              Component: (await import('../../features/student-portal/academic-pages.js'))
                .StudentSubjectsPage,
            }),
          },
          {
            path: 'academic-history',
            lazy: async () => ({
              Component: (await import('../../features/student-portal/academic-pages.js'))
                .StudentAcademicHistoryPage,
            }),
          },
          {
            path: 'documents',
            lazy: async () => ({
              Component: (await import('../../features/student-portal/academic-pages.js'))
                .StudentDocumentsPage,
            }),
          },
          {
            path: 'profile',
            lazy: async () => ({
              Component: (await import('../../features/students/student-pages.js'))
                .StudentProfilePage,
            }),
          },
          { path: 'notifications', element: <StudentNotificationsPage /> },
          {
            path: 'settings',
            lazy: async () => ({
              Component: (await import('../../features/student-portal/account-pages.js'))
                .StudentSettingsPage,
            }),
          },
          { path: '*', element: <NotFoundPage home="/student" /> },
        ],
      },
    ],
  },
  {
    HydrateFallback: RouteLoading,
    element: <RequireAuthentication portal="TEACHER" />,
    children: [
      {
        path: '/teacher',
        element: <PortalLayout portalName="Teacher Portal" />,
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            path: 'timetable',
            lazy: async () => ({
              Component: (await import('../../features/timetable/timetable-page.js')).TimetablePage,
            }),
          },
          {
            index: true,
            lazy: async () => ({
              Component: (await import('../../features/teachers/teacher-overview-pages.js'))
                .TeacherDashboardPage,
            }),
          },
          {
            path: 'classes',
            lazy: async () => ({
              Component: (await import('../../features/teachers/teacher-overview-pages.js'))
                .TeacherClassesPage,
            }),
          },
          {
            path: 'subjects',
            lazy: async () => ({
              Component: (await import('../../features/teachers/teacher-overview-pages.js'))
                .TeacherSubjectsPage,
            }),
          },
          {
            path: 'students',
            lazy: async () => ({
              Component: (await import('../../features/teachers/teacher-overview-pages.js'))
                .TeacherStudentsPage,
            }),
          },
          {
            path: 'assignments',
            lazy: async () => ({
              Component: (await import('../../features/teachers/teacher-work-pages.js'))
                .TeacherAssignmentsPage,
            }),
          },
          {
            path: 'results',
            lazy: async () => ({
              Component: (await import('../../features/teachers/teacher-results-pages.js'))
                .TeacherResultsPage,
            }),
          },
          {
            path: 'results/:batchId',
            lazy: async () => ({
              Component: (await import('../../features/teachers/teacher-results-pages.js'))
                .TeacherResultBatchPage,
            }),
          },
          {
            path: 'announcements',
            lazy: async () => ({
              Component: (await import('../../features/teachers/teacher-work-pages.js'))
                .TeacherAnnouncementsPage,
            }),
          },
          {
            path: 'notifications',
            lazy: async () => ({
              Component: (await import('../../features/account/portal-account-pages.js'))
                .PortalNotificationsPage,
            }),
          },
          {
            path: 'profile',
            lazy: async () => ({
              Component: (await import('../../features/teachers/teacher-overview-pages.js'))
                .TeacherProfilePage,
            }),
          },
          {
            path: 'settings',
            lazy: async () => ({
              Component: (await import('../../features/account/portal-account-pages.js'))
                .PortalSettingsPage,
            }),
          },
          { path: '*', element: <NotFoundPage home="/teacher" /> },
        ],
      },
    ],
  },
  {
    HydrateFallback: RouteLoading,
    element: <RequireAuthentication portal="ADMIN" />,
    children: [
      {
        path: '/admin',
        element: <PortalLayout portalName="Admin Portal" />,
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            path: 'timetable',
            lazy: async () => ({
              Component: (await import('../../features/timetable/timetable-page.js')).TimetablePage,
            }),
          },
          { index: true, element: <AdminDashboardPage /> },
          { path: 'students/registrations', element: <AdminRegistrationQueuePage /> },
          {
            path: 'students/registrations/:registrationId',
            element: <AdminRegistrationReviewPage />,
          },
          { path: 'students/corrections', element: <AdminCorrectionQueuePage /> },
          { path: 'students', element: <AdminStudentDirectoryPage key="all" /> },
          { path: 'students/profiles', element: <AdminStudentDirectoryPage key="profiles" /> },
          {
            path: 'students/academic-history',
            element: <AdminStudentDirectoryPage key="history" />,
          },
          { path: 'students/graduated', element: <AdminStudentDirectoryPage key="graduated" /> },
          { path: 'students/archived', element: <AdminStudentDirectoryPage key="archived" /> },
          { path: 'students/:studentId', element: <AdminStudentProfilePage /> },
          { path: 'academics/setup', element: <AdminAcademicSetupPage /> },
          {
            path: 'teachers',
            lazy: async () => ({
              Component: (await import('../../features/admin/teacher-admin-pages.js'))
                .AdminTeachersPage,
            }),
          },
          {
            path: 'teachers/profiles',
            lazy: async () => ({
              Component: (await import('../../features/admin/teacher-admin-pages.js'))
                .AdminTeachersPage,
            }),
          },
          {
            path: 'teachers/approvals',
            lazy: async () => ({
              Component: (await import('../../features/admin/teacher-admin-pages.js'))
                .AdminTeacherApprovalsPage,
            }),
          },
          {
            path: 'teachers/invitations',
            lazy: async () => ({
              Component: (await import('../../features/admin/teacher-admin-pages.js'))
                .AdminTeacherInvitationsPage,
            }),
          },
          {
            path: 'teachers/assignments',
            lazy: async () => ({
              Component: (await import('../../features/admin/teacher-admin-pages.js'))
                .AdminTeachingAssignmentsPage,
            }),
          },
          { path: 'academics/sessions', element: <AdminSessionsPage /> },
          { path: 'academics/terms', element: <AdminSessionsPage /> },
          { path: 'academics/classes', element: <AdminReferenceStructurePage view="classes" /> },
          { path: 'academics/tracks', element: <AdminReferenceStructurePage view="tracks" /> },
          {
            path: 'academics/subjects',
            lazy: async () => ({
              Component: (await import('../../features/admin/curriculum-admin-pages.js'))
                .AdminSubjectsPage,
            }),
          },
          {
            path: 'academics/subject-offerings',
            lazy: async () => ({
              Component: (await import('../../features/admin/curriculum-admin-pages.js'))
                .AdminSubjectOfferingsPage,
            }),
          },
          {
            path: 'academics/subject-assignments',
            lazy: async () => ({
              Component: (await import('../../features/admin/curriculum-admin-pages.js'))
                .AdminClassSubjectAssignmentPage,
            }),
          },
          {
            path: 'academics/subject-change-requests',
            lazy: async () => ({
              Component: (await import('../../features/admin/subject-change-request-page.js'))
                .AdminSubjectChangeRequestPage,
            }),
          },
          {
            path: 'academics/promotions',
            lazy: async () => ({
              Component: (await import('../../features/admin/promotion-admin-page.js'))
                .AdminPromotionsPage,
            }),
          },
          {
            path: 'assignments',
            lazy: async () => ({
              Component: (await import('../../features/admin/operations-admin-pages.js'))
                .AdminAssignmentsPage,
            }),
          },
          {
            path: 'announcements',
            lazy: async () => ({
              Component: (await import('../../features/admin/operations-admin-pages.js'))
                .AdminAnnouncementsPage,
            }),
          },
          { path: 'results', element: <AdminResultQueuePage mode="all" /> },
          {
            path: 'results/assessment-schemes',
            lazy: async () => ({
              Component: (await import('../../features/admin/result-configuration-pages.js'))
                .AdminAssessmentSchemesPage,
            }),
          },
          {
            path: 'results/grading-schemes',
            lazy: async () => ({
              Component: (await import('../../features/admin/result-configuration-pages.js'))
                .AdminGradingSchemesPage,
            }),
          },
          { path: 'results/submitted', element: <AdminResultQueuePage mode="submitted" /> },
          { path: 'results/review', element: <AdminResultQueuePage mode="review" /> },
          { path: 'results/approval', element: <AdminResultQueuePage mode="approval" /> },
          { path: 'results/publishing', element: <AdminResultQueuePage mode="publishing" /> },
          { path: 'results/corrections', element: <AdminResultCorrectionsPage /> },
          { path: 'results/batches/:batchId', element: <AdminResultBatchPage /> },
          {
            path: 'access/administrators',
            lazy: async () => ({
              Component: (await import('../../features/admin/system-admin-pages.js'))
                .AdminAdministratorsPage,
            }),
          },
          {
            path: 'access/roles',
            lazy: async () => ({
              Component: (await import('../../features/admin/system-admin-pages.js'))
                .AdminRolesPage,
            }),
          },
          {
            path: 'access/permissions',
            lazy: async () => ({
              Component: (await import('../../features/admin/system-admin-pages.js'))
                .AdminPermissionsPage,
            }),
          },
          {
            path: 'documents',
            lazy: async () => ({
              Component: (await import('../../features/admin/document-admin-page.js'))
                .AdminDocumentsPage,
            }),
          },
          {
            path: 'audit',
            lazy: async () => ({
              Component: (await import('../../features/admin/system-admin-pages.js'))
                .AdminAuditPage,
            }),
          },
          {
            path: 'notifications',
            lazy: async () => ({
              Component: (await import('../../features/account/portal-account-pages.js'))
                .PortalNotificationsPage,
            }),
          },
          {
            path: 'settings',
            lazy: async () => ({
              Component: (await import('../../features/admin/system-admin-pages.js'))
                .AdminSchoolSettingsPage,
            }),
          },
          { path: '*', element: <NotFoundPage home="/admin" /> },
        ],
      },
    ],
  },
  {
    HydrateFallback: RouteLoading,
    element: <RequireAuthentication portal="ONBOARDING" />,
    children: [
      {
        path: '/onboarding',
        element: <PublicLayout />,
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import('../../features/student-onboarding/registration-page.js'))
                .RegistrationPage,
            }),
          },
        ],
      },
    ],
  },
];
