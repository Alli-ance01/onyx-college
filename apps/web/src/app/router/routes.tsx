import { Navigate, type RouteObject } from 'react-router';

import { ChangePasswordPage, LoginPage } from '../../features/auth/auth-pages.js';
import { RequireAuthentication } from '../../features/auth/route-guards.js';
import {
  PortalNotificationsPage,
  PortalSettingsPage,
} from '../../features/account/portal-account-pages.js';
import {
  AdminAcademicSetupPage,
  AdminCorrectionQueuePage,
  AdminRegistrationQueuePage,
  AdminRegistrationReviewPage,
  AdminStudentDirectoryPage,
  AdminStudentProfilePage,
} from '../../features/admin/student-admin-pages.js';
import {
  AdminReferenceStructurePage,
  AdminSessionsPage,
} from '../../features/admin/academic-structure-pages.js';
import {
  AdminSubjectOfferingsPage,
  AdminSubjectsPage,
} from '../../features/admin/curriculum-admin-pages.js';
import { AdminDocumentsPage } from '../../features/admin/document-admin-page.js';
import {
  AdminAnnouncementsPage,
  AdminAssignmentsPage,
} from '../../features/admin/operations-admin-pages.js';
import { AdminPromotionsPage } from '../../features/admin/promotion-admin-page.js';
import {
  AdminAssessmentSchemesPage,
  AdminGradingSchemesPage,
} from '../../features/admin/result-configuration-pages.js';
import {
  AdminResultBatchPage,
  AdminResultCorrectionsPage,
  AdminResultQueuePage,
} from '../../features/admin/result-workflow-pages.js';
import {
  AdminAdministratorsPage,
  AdminAuditPage,
  AdminDashboardPage,
  AdminPermissionsPage,
  AdminRolesPage,
  AdminSchoolSettingsPage,
} from '../../features/admin/system-admin-pages.js';
import {
  AdminTeacherApprovalsPage,
  AdminTeacherInvitationsPage,
  AdminTeachersPage,
  AdminTeachingAssignmentsPage,
} from '../../features/admin/teacher-admin-pages.js';
import { RegistrationPage } from '../../features/student-onboarding/registration-page.js';
import { StudentSignupPage } from '../../features/student-onboarding/student-signup-page.js';
import { StudentDashboardPage, StudentProfilePage } from '../../features/students/student-pages.js';
import {
  TeacherClassesPage,
  TeacherDashboardPage,
  TeacherProfilePage,
  TeacherStudentsPage,
  TeacherSubjectsPage,
} from '../../features/teachers/teacher-overview-pages.js';
import {
  TeacherResultBatchPage,
  TeacherResultsPage,
} from '../../features/teachers/teacher-results-pages.js';
import { TeacherSetupPage } from '../../features/teachers/teacher-setup-page.js';
import {
  TeacherAnnouncementsPage,
  TeacherAssignmentsPage,
} from '../../features/teachers/teacher-work-pages.js';
import {
  StudentNotificationsPage,
  StudentSettingsPage,
} from '../../features/student-portal/account-pages.js';
import {
  StudentAcademicHistoryPage,
  StudentDocumentsPage,
  StudentSubjectsPage,
} from '../../features/student-portal/academic-pages.js';
import {
  StudentAnnouncementsPage,
  StudentAssignmentsPage,
} from '../../features/student-portal/communication-pages.js';
import {
  StudentReportPage,
  StudentResultsPage,
} from '../../features/student-portal/results-pages.js';
import { RouteErrorBoundary } from '../error-boundaries/route-error-boundary.js';
import { PortalLayout } from '../layouts/portal-layout.js';
import { PublicLayout } from '../layouts/public-layout.js';
import { FoundationPage } from './foundation-page.js';

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <PublicLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: (
          <FoundationPage
            description="Students can create an applicant account, complete registration, and enter the Student Portal after school approval. Staff use the same secure system for review and administration."
            eyebrow="Onyx College"
            title="One secure portal for your school community"
          />
        ),
      },
      { path: 'auth', element: <Navigate replace to="/auth/login" /> },
      { path: 'auth/login', element: <LoginPage /> },
      { path: 'auth/change-password', element: <ChangePasswordPage /> },
      { path: 'student-signup', element: <StudentSignupPage /> },
      { path: 'teacher-setup', element: <TeacherSetupPage /> },
    ],
  },
  {
    element: <RequireAuthentication portal="STUDENT" />,
    children: [
      {
        path: '/student',
        element: <PortalLayout portalName="Student Portal" />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { index: true, element: <Navigate replace to="dashboard" /> },
          { path: 'dashboard', element: <StudentDashboardPage /> },
          { path: 'assignments', element: <StudentAssignmentsPage /> },
          { path: 'announcements', element: <StudentAnnouncementsPage /> },
          { path: 'results', element: <StudentResultsPage /> },
          { path: 'results/:reportId', element: <StudentReportPage /> },
          { path: 'subjects', element: <StudentSubjectsPage /> },
          { path: 'academic-history', element: <StudentAcademicHistoryPage /> },
          { path: 'documents', element: <StudentDocumentsPage /> },
          { path: 'profile', element: <StudentProfilePage /> },
          { path: 'notifications', element: <StudentNotificationsPage /> },
          { path: 'settings', element: <StudentSettingsPage /> },
        ],
      },
    ],
  },
  {
    element: <RequireAuthentication portal="TEACHER" />,
    children: [
      {
        path: '/teacher',
        element: <PortalLayout portalName="Teacher Portal" />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { index: true, element: <TeacherDashboardPage /> },
          { path: 'classes', element: <TeacherClassesPage /> },
          { path: 'subjects', element: <TeacherSubjectsPage /> },
          { path: 'students', element: <TeacherStudentsPage /> },
          { path: 'assignments', element: <TeacherAssignmentsPage /> },
          { path: 'results', element: <TeacherResultsPage /> },
          { path: 'results/:batchId', element: <TeacherResultBatchPage /> },
          { path: 'announcements', element: <TeacherAnnouncementsPage /> },
          { path: 'notifications', element: <PortalNotificationsPage /> },
          { path: 'profile', element: <TeacherProfilePage /> },
          { path: 'settings', element: <PortalSettingsPage /> },
        ],
      },
    ],
  },
  {
    element: <RequireAuthentication portal="ADMIN" />,
    children: [
      {
        path: '/admin',
        element: <PortalLayout portalName="Admin Portal" />,
        errorElement: <RouteErrorBoundary />,
        children: [
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
          { path: 'teachers', element: <AdminTeachersPage /> },
          { path: 'teachers/profiles', element: <AdminTeachersPage /> },
          { path: 'teachers/approvals', element: <AdminTeacherApprovalsPage /> },
          { path: 'teachers/invitations', element: <AdminTeacherInvitationsPage /> },
          { path: 'teachers/assignments', element: <AdminTeachingAssignmentsPage /> },
          { path: 'academics/sessions', element: <AdminSessionsPage /> },
          { path: 'academics/terms', element: <AdminSessionsPage /> },
          { path: 'academics/classes', element: <AdminReferenceStructurePage view="classes" /> },
          { path: 'academics/tracks', element: <AdminReferenceStructurePage view="tracks" /> },
          { path: 'academics/subjects', element: <AdminSubjectsPage /> },
          { path: 'academics/subject-offerings', element: <AdminSubjectOfferingsPage /> },
          { path: 'academics/promotions', element: <AdminPromotionsPage /> },
          { path: 'assignments', element: <AdminAssignmentsPage /> },
          { path: 'announcements', element: <AdminAnnouncementsPage /> },
          { path: 'results', element: <AdminResultQueuePage mode="all" /> },
          { path: 'results/assessment-schemes', element: <AdminAssessmentSchemesPage /> },
          { path: 'results/grading-schemes', element: <AdminGradingSchemesPage /> },
          { path: 'results/submitted', element: <AdminResultQueuePage mode="submitted" /> },
          { path: 'results/review', element: <AdminResultQueuePage mode="review" /> },
          { path: 'results/approval', element: <AdminResultQueuePage mode="approval" /> },
          { path: 'results/publishing', element: <AdminResultQueuePage mode="publishing" /> },
          { path: 'results/corrections', element: <AdminResultCorrectionsPage /> },
          { path: 'results/batches/:batchId', element: <AdminResultBatchPage /> },
          { path: 'access/administrators', element: <AdminAdministratorsPage /> },
          { path: 'access/roles', element: <AdminRolesPage /> },
          { path: 'access/permissions', element: <AdminPermissionsPage /> },
          { path: 'documents', element: <AdminDocumentsPage /> },
          { path: 'audit', element: <AdminAuditPage /> },
          { path: 'notifications', element: <PortalNotificationsPage /> },
          { path: 'settings', element: <AdminSchoolSettingsPage /> },
          { path: '*', element: <Navigate replace to="/admin" /> },
        ],
      },
    ],
  },
  {
    element: <RequireAuthentication portal="ONBOARDING" />,
    children: [
      {
        path: '/onboarding',
        element: <PublicLayout />,
        children: [{ index: true, element: <RegistrationPage /> }],
      },
    ],
  },
];
