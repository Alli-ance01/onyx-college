import type { AuthTokensResponse } from '@onyx/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthSessionProvider } from './auth-session-provider.js';
import { useAuthSession } from './use-auth-session.js';

const authentication: AuthTokensResponse = {
  accessToken: 'test-access',
  csrfToken: 'test-csrf',
  expiresInSeconds: 600,
  principal: {
    accountStatus: 'ACTIVE',
    accountType: 'STUDENT',
    displayName: 'Student One',
    mustChangePassword: false,
    permissions: [],
    portal: 'STUDENT',
    roles: ['STUDENT'],
    sessionId: 'session-one',
    userId: 'student-one',
    username: 'student.one',
  },
};
function json(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
function Controls() {
  const auth = useAuthSession();
  return (
    <>
      <p>{auth.status}</p>
      <button onClick={() => void auth.logout()}>Sign out</button>
      <button onClick={() => void auth.refreshSession()}>Refresh session</button>
      <button
        onClick={() => void auth.login({ identifier: 'student.two', password: 'test-password' })}
      >
        Switch account
      </button>
    </>
  );
}
async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetcher = vi.fn<typeof fetch>((input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith('/auth/logout')) return Promise.resolve(new Response(null, { status: 204 }));
    if (url.endsWith('/auth/csrf')) return Promise.resolve(json({ csrfToken: 'test-csrf' }));
    return Promise.resolve(json(authentication));
  });
  render(
    <QueryClientProvider client={client}>
      <AuthSessionProvider fetchImplementation={fetcher}>
        <Controls />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );
  await screen.findByText('authenticated');
  return { client, fetcher };
}
afterEach(cleanup);
describe('authenticated query cache isolation', () => {
  it('removes private cached data when signing out', async () => {
    const { client } = await setup();
    client.setQueryData(['student-profile', 'mine'], { studentName: 'Private Student One' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByText('anonymous');
    expect(client.getQueryData(['student-profile', 'mine'])).toBeUndefined();
  });
  it('retains cached data during an ordinary refresh of the same account', async () => {
    const { client, fetcher } = await setup();
    client.setQueryData(['student-profile', 'mine'], { studentName: 'Student One' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh session' }));
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(4);
    });
    expect(client.getQueryData(['student-profile', 'mine'])).toEqual({
      studentName: 'Student One',
    });
  });
  it('clears the cache before another account enters the portal', async () => {
    const { client, fetcher } = await setup();
    client.setQueryData(['student-profile', 'mine'], { studentName: 'Private Student One' });
    fetcher.mockResolvedValueOnce(
      json({
        ...authentication,
        principal: { ...authentication.principal, userId: 'student-two' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Switch account' }));
    await waitFor(() => {
      expect(client.getQueryData(['student-profile', 'mine'])).toBeUndefined();
    });
  });
});
