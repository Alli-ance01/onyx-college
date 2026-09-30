import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { appRoutes } from '../../app/router/routes.js';
import { createQueryClient } from '../../app/providers/query-client.js';
import { AuthSessionProvider } from '../../lib/auth/auth-session-provider.js';

const principal = {
  accountStatus: 'ACTIVE' as const,
  accountType: 'ADMINISTRATOR' as const,
  displayName: 'System Administrator',
  mustChangePassword: false,
  permissions: ['settings.manage'],
  portal: 'ADMIN' as const,
  roles: ['SUPER_ADMIN'] as const,
  sessionId: 'session-id',
  userId: 'user-id',
  username: 'super.admin',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function renderApp(initialEntry: string, fetchImplementation: typeof fetch) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [initialEntry] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthSessionProvider fetchImplementation={fetchImplementation}>
        <RouterProvider router={router} />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );
}

describe('browser authentication lifecycle', () => {
  it('restores a refresh-cookie session and enters its role-aware shell', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: { csrfToken: 'csrf' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            accessToken: 'memory-access-token',
            csrfToken: 'csrf',
            expiresInSeconds: 600,
            principal,
          },
        }),
      );

    renderApp('/admin', fetchMock);

    expect(await screen.findByRole('heading', { name: 'School operations' })).toBeVisible();
    expect(screen.getByText('System Administrator')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      credentials: 'include',
      method: 'POST',
    });
  });

  it('routes a temporary-password login directly to forced password change', async () => {
    const temporaryPrincipal = { ...principal, mustChangePassword: true };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: 'AUTHENTICATION_REQUIRED',
              message: 'Authentication is required.',
              requestId: 'req_test',
            },
          },
          401,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            accessToken: 'memory-access-token',
            csrfToken: 'csrf',
            expiresInSeconds: 600,
            principal: temporaryPrincipal,
          },
        }),
      );

    renderApp('/auth/login', fetchMock);
    fireEvent.change(await screen.findByLabelText('Username, email, or phone'), {
      target: { value: 'super.admin' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'temporary-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Change your password' })).toBeVisible();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
