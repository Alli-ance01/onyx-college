import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { appRoutes } from '../../app/router/routes.js';
import { AuthSessionProvider } from '../../lib/auth/auth-session-provider.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

const config = {
  canonicalFields: [],
  customFields: [],
  id: 'config-1',
  publishedAt: '2026-09-26T00:00:00.000Z',
  versionNumber: 1,
};
const draft = {
  allowedCorrectionFields: [],
  configuration: config,
  createdAt: '2026-09-26T00:00:00.000Z',
  data: {
    academic: {},
    contact: {},
    customResponses: {},
    guardian: { emergencyContact: true },
    medical: {},
    personal: {},
  },
  documents: [],
  duplicateReview: { candidates: [], requiresReview: false },
  id: 'registration-1',
  reviewHistory: [],
  status: 'DRAFT',
  updatedAt: '2026-09-26T00:00:00.000Z',
  version: 0,
};

afterEach(() => {
  cleanup();
});

function renderRoute(
  path: string,
  portal: 'ADMIN' | 'ONBOARDING' | 'STUDENT',
  routeResponses: Record<string, unknown>,
) {
  const principal = {
    accountStatus: 'ACTIVE',
    accountType:
      portal === 'ONBOARDING' ? 'APPLICANT' : portal === 'STUDENT' ? 'STUDENT' : 'ADMINISTRATOR',
    displayName: 'Test User',
    mustChangePassword: false,
    permissions:
      portal === 'ADMIN'
        ? [
            'students.read',
            'students.read_sensitive',
            'students.approve_registration',
            'documents.review',
            'sessions.manage',
            'terms.manage',
            'students.manage_corrections',
          ]
        : [],
    portal,
    roles: portal === 'ADMIN' ? ['SUPER_ADMIN'] : portal === 'STUDENT' ? ['STUDENT'] : [],
    sessionId: 'session',
    userId: 'user',
    username: 'test.user',
  };
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const pathname = new URL(url, 'http://localhost').pathname;
    if (pathname.endsWith('/auth/csrf'))
      return Promise.resolve(json({ data: { csrfToken: 'csrf' } }));
    if (pathname.endsWith('/auth/refresh'))
      return Promise.resolve(
        json({
          data: { accessToken: 'token', csrfToken: 'csrf', expiresInSeconds: 600, principal },
        }),
      );
    const key = `${(init?.method ?? 'GET').toUpperCase()} ${pathname}`;
    const response = routeResponses[key];
    return Promise.resolve(
      response === undefined
        ? json({ error: { code: 'NOT_FOUND', message: 'Missing fixture', requestId: 'req' } }, 404)
        : json({ data: response }),
    );
  });
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthSessionProvider fetchImplementation={fetchMock}>
        <RouterProvider router={router} />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe('student onboarding visible flows', () => {
  it('renders the public student-only account creation experience', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      json(
        {
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Authentication is required.',
            requestId: 'req',
          },
        },
        401,
      ),
    );
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/student-signup'] });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthSessionProvider fetchImplementation={fetchMock}>
          <RouterProvider router={router} />
        </AuthSessionProvider>
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Create your applicant account.' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create account and continue' })).toBeVisible();
    expect(screen.queryByText(/teacher signup/iu)).not.toBeInTheDocument();
  });

  it('renders the seven-step draft registration wizard from server state', async () => {
    renderRoute('/onboarding', 'ONBOARDING', {
      'GET /api/v1/student-registrations/me': draft,
      'GET /api/v1/academic-setup': {
        classLevels: [{ code: 'JSS1', id: 'level-1', name: 'JSS1', stage: 'JUNIOR' }],
        tracks: [],
      },
      'GET /api/v1/document-requirements': [],
    });
    expect(
      await screen.findByRole('heading', { name: 'Complete your Onyx College registration' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /Review & Submit/iu })).toBeVisible();
    expect(screen.getByLabelText('Surname')).toBeVisible();
  });

  it('shows a submitted registration as read-only pending review', async () => {
    renderRoute('/onboarding', 'ONBOARDING', {
      'GET /api/v1/student-registrations/me': {
        ...draft,
        status: 'SUBMITTED',
        submittedAt: '2026-09-26T10:00:00.000Z',
      },
      'GET /api/v1/academic-setup': { classLevels: [], tracks: [] },
      'GET /api/v1/document-requirements': [],
    });
    expect(
      await screen.findByRole('heading', { name: 'Your registration is with the school' }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Surname')).not.toBeInTheDocument();
  });

  it('renders the real student dashboard from approved profile data', async () => {
    renderRoute('/student/dashboard', 'STUDENT', {
      'GET /api/v1/students/me/dashboard': {
        currentEnrollment: {
          classLevel: { code: 'JSS1', id: 'level-1', name: 'JSS1', stage: 'JUNIOR' },
          session: { id: 'session-1', label: '2026/2027' },
        },
        currentTerm: { id: 'term-1', name: 'First Term' },
        lifecycleStatus: 'ACTIVE',
        studentId: 'ONYX/0001',
        studentName: 'Chidi Okafor',
      },
    });
    expect(await screen.findByRole('heading', { name: 'Welcome, Chidi Okafor' })).toBeVisible();
    expect(screen.getByText('ONYX/0001')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Your classwork' })).toBeVisible();
  });

  it('renders the database-backed admin registration queue', async () => {
    renderRoute('/admin/students/registrations', 'ADMIN', {
      'GET /api/v1/student-registrations': [
        {
          ...draft,
          data: {
            ...draft.data,
            academic: { requestedClassLevelCode: 'JSS1' },
            guardian: { phone: '08012345678' },
            personal: { firstName: 'Chidi', surname: 'Okafor' },
          },
          status: 'SUBMITTED',
        },
      ],
    });
    expect(await screen.findByRole('heading', { name: 'Registration review' })).toBeVisible();
    expect(await screen.findByText('Chidi Okafor')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open review' })).toBeVisible();
  });
});
