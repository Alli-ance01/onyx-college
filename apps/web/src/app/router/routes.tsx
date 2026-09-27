import { Navigate, type RouteObject } from 'react-router';

import { ChangePasswordPage, LoginPage } from '../../features/auth/auth-pages.js';
import { RequireAuthentication } from '../../features/auth/route-guards.js';
import {
  AdminAcademicSetupPage,
  AdminCorrectionQueuePage,
  AdminRegistrationQueuePage,
  AdminRegistrationReviewPage,
  AdminStudentDirectoryPage,
  AdminStudentProfilePage,
} from '../../features/admin/student-admin-pages.js';
import { RegistrationPage } from '../../features/student-onboarding/registration-page.js';
import { StudentSignupPage } from '../../features/student-onboarding/student-signup-page.js';
import { StudentDashboardPage, StudentProfilePage } from '../../features/students/student-pages.js';
import { RouteErrorBoundary } from '../error-boundaries/route-error-boundary.js';
import { PortalLayout } from '../layouts/portal-layout.js';
import { PublicLayout } from '../layouts/public-layout.js';
import { FoundationPage } from './foundation-page.js';
import { PortalHome } from './portal-home.js';

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
          { path: 'profile', element: <StudentProfilePage /> },
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
        children: [{ index: true, element: <PortalHome /> }],
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
          { index: true, element: <PortalHome /> },
          { path: 'students/registrations', element: <AdminRegistrationQueuePage /> },
          {
            path: 'students/registrations/:registrationId',
            element: <AdminRegistrationReviewPage />,
          },
          { path: 'students/corrections', element: <AdminCorrectionQueuePage /> },
          { path: 'students', element: <AdminStudentDirectoryPage /> },
          { path: 'students/:studentId', element: <AdminStudentProfilePage /> },
          { path: 'academics/setup', element: <AdminAcademicSetupPage /> },
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
