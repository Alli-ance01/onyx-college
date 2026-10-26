import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../../app/providers/query-client.js';
import { appRoutes } from '../../app/router/routes.js';
import { AuthSessionProvider } from '../../lib/auth/auth-session-provider.js';

const administrator = {
  accountStatus: 'ACTIVE' as const,
  accountType: 'ADMINISTRATOR' as const,
  displayName: 'Amina Okafor',
  mustChangePassword: false,
  permissions: [
    'students.approve_registration',
    'students.read',
    'teachers.approve',
    'teachers.read',
    'sessions.manage',
    'classes.manage',
    'subjects.manage',
    'subject_offerings.manage',
    'settings.manage',
    'results.review',
    'results.approve',
  ],
  portal: 'ADMIN' as const,
  roles: ['SCHOOL_ADMIN'] as const,
  sessionId: 'session-id',
  userId: 'admin-id',
  username: 'amina.admin',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

const registrations = [
  {
    data: {
      academic: { requestedClassLevelCode: 'JSS1' },
      personal: { firstName: 'Sade', surname: 'Adebayo' },
    },
    id: 'registration-1',
    status: 'SUBMITTED',
    submittedAt: '2026-10-01T08:00:00.000Z',
  },
  {
    data: {
      academic: { requestedClassLevelCode: 'SS1' },
      personal: { firstName: 'David', surname: 'Okoro' },
    },
    id: 'registration-2',
    status: 'UNDER_REVIEW',
    submittedAt: '2026-10-02T08:00:00.000Z',
  },
];

function createFetchMock(principal = administrator) {
  return vi.fn<typeof fetch>((input) => {
    const url = input instanceof Request ? input.url : String(input);
    const requestUrl = new URL(url, 'http://localhost');
    const { pathname } = requestUrl;
    if (pathname.endsWith('/auth/csrf')) {
      return Promise.resolve(jsonResponse({ data: { csrfToken: 'csrf-token' } }));
    }
    if (pathname.endsWith('/auth/refresh')) {
      return Promise.resolve(
        jsonResponse({
          data: {
            accessToken: 'access-token',
            csrfToken: 'csrf-token',
            expiresInSeconds: 600,
            principal,
          },
        }),
      );
    }
    if (pathname.endsWith('/academic-sessions')) {
      return Promise.resolve(
        jsonResponse({
          data: [
            {
              id: 'session-2026',
              label: '2026/2027',
              status: 'ACTIVE',
              terms: [
                {
                  academicSessionId: 'session-2026',
                  id: 'term-1',
                  name: 'First Term',
                  ordinal: 1,
                  status: 'ACTIVE',
                  version: 1,
                },
              ],
              version: 1,
            },
          ],
        }),
      );
    }
    if (pathname.endsWith('/teachers')) {
      return Promise.resolve(jsonResponse({ data: [{ id: 'teacher-1' }, { id: 'teacher-2' }] }));
    }
    if (pathname.endsWith('/teacher-registrations')) {
      return Promise.resolve(
        jsonResponse({
          data: [
            { id: 'teacher-registration-1', status: 'SUBMITTED' },
            { id: 'teacher-registration-2', status: 'UNDER_REVIEW' },
            { id: 'teacher-registration-3', status: 'CHANGES_REQUESTED' },
            { id: 'teacher-registration-4', status: 'APPROVED' },
          ],
        }),
      );
    }
    if (pathname.endsWith('/results/batches')) {
      return Promise.resolve(
        jsonResponse({
          data: [
            { id: 'batch-1', status: 'SUBMITTED' },
            { id: 'batch-2', status: 'UNDER_REVIEW' },
            { id: 'batch-3', status: 'APPROVED' },
            { id: 'batch-4', status: 'PUBLISHED' },
          ],
        }),
      );
    }
    if (pathname.endsWith('/student-registrations')) {
      const status =
        requestUrl.searchParams.get('filter[status]') ?? requestUrl.searchParams.get('status');
      return Promise.resolve(
        jsonResponse({ data: registrations.filter((item) => item.status === status) }),
      );
    }
    if (pathname.endsWith('/notifications')) return Promise.resolve(jsonResponse({ data: [] }));
    return Promise.resolve(
      jsonResponse(
        { error: { code: 'NOT_FOUND', message: 'Missing fixture', requestId: 'test' } },
        404,
      ),
    );
  });
}

function renderDashboard(fetchImplementation: typeof fetch) {
  cleanup();
  const router = createMemoryRouter(appRoutes, { initialEntries: ['/admin'] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthSessionProvider fetchImplementation={fetchImplementation}>
        <RouterProvider router={router} />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe('admin dashboard', () => {
  it('puts live review work, academic context, and shortcuts in a clear hierarchy', async () => {
    renderDashboard(createFetchMock());

    expect(await screen.findByRole('heading', { name: 'Needs your attention' })).toBeVisible();
    expect(await screen.findByText('2026/2027')).toBeVisible();
    expect(await screen.findByText('First Term')).toBeVisible();
    expect(await screen.findByText(/applications are waiting for review/u)).toHaveTextContent(
      '2 applications are waiting for review.',
    );
    expect(
      await screen.findByText('2 teacher registrations waiting for a decision.'),
    ).toBeVisible();
    expect(await screen.findByText('2 result batches in a status you can act on.')).toBeVisible();
    expect(screen.getByRole('link', { name: /Student directory/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /Subject offerings/ })).toBeVisible();
  });

  it('does not query or show review areas the administrator cannot access', async () => {
    const limitedPrincipal = { ...administrator, permissions: ['students.read'] };
    const fetchMock = createFetchMock(limitedPrincipal);
    renderDashboard(fetchMock);

    await waitFor(() => {
      expect(screen.queryByText('Checking your secure session…')).not.toBeInTheDocument();
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'No review queues are assigned to this account.',
    );
    expect(screen.getByRole('link', { name: /Student directory/ })).toBeVisible();
    expect(screen.queryByRole('link', { name: /Open teacher approvals/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Results needing action/ })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        /\/(academic-sessions|teachers|teacher-registrations|results\/batches|student-registrations)(\?|$)/u.test(
          input instanceof Request ? input.url : String(input),
        ),
      ),
    ).toBe(false);
  });
});
