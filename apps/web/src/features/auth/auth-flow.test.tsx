import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  cleanup();
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
    fireEvent.click(screen.getByRole('button', { name: /Continue to workspace/iu }));

    expect(await screen.findByRole('heading', { name: 'Set a new password.' })).toBeVisible();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it('waits for the initial session check before allowing a new login', async () => {
    let finishSessionCheck!: (response: Response) => void;
    const pendingSessionCheck = new Promise<Response>((resolve) => {
      finishSessionCheck = resolve;
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(pendingSessionCheck)
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
      );

    renderApp('/auth/login', fetchMock);

    expect(await screen.findByText('Checking your secure session…')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Continue to workspace/iu })).not.toBeInTheDocument();

    finishSessionCheck(
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
    );

    expect(await screen.findByRole('button', { name: /Continue to workspace/iu })).toBeVisible();
  });

  it('logs safe diagnostics when password change fails before an API response', async () => {
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
      )
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      renderApp('/auth/login', fetchMock);
      fireEvent.change(await screen.findByLabelText('Username, email, or phone'), {
        target: { value: 'super.admin' },
      });
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'temporary-secret' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Continue to workspace/iu }));

      expect(await screen.findByRole('heading', { name: 'Set a new password.' })).toBeVisible();
      fireEvent.change(screen.getByLabelText('Current password'), {
        target: { value: 'temporary-secret' },
      });
      fireEvent.change(screen.getByLabelText('New password'), {
        target: { value: 'a-secure-new-password-2026' },
      });
      fireEvent.change(screen.getByLabelText('Confirm new password'), {
        target: { value: 'a-secure-new-password-2026' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Save new password/iu }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The service is taking longer than expected. Check your connection and try again.',
      );
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('[Onyx auth] Password change failed', {
          message: 'Failed to fetch',
          name: 'TypeError',
        });
      });
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('temporary-secret');
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('a-secure-new-password-2026');
    } finally {
      consoleError.mockRestore();
    }
  });
});
