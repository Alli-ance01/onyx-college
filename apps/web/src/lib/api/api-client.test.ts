import { describe, expect, it, vi } from 'vitest';

import { ApiClient, ApiClientError } from './api-client.js';

function response(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('ApiClient authentication recovery', () => {
  it('refreshes and retries an idempotent read once', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          {
            error: {
              code: 'AUTHENTICATION_REQUIRED',
              message: 'Authentication is required.',
              requestId: 'req_one',
            },
          },
          401,
        ),
      )
      .mockResolvedValueOnce(response({ data: { ok: true } }, 200));
    const refreshSession = vi.fn(() => Promise.resolve(true));
    const client = new ApiClient({
      baseUrl: '/api/v1',
      fetchImplementation: fetchMock,
      sessionRefresher: { refreshSession },
    });

    await expect(client.request('/resource')).resolves.toEqual({ data: { ok: true } });
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refreshes session state but never replays a failed mutation', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response(
        {
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Authentication is required.',
            requestId: 'req_two',
          },
        },
        401,
      ),
    );
    const refreshSession = vi.fn(() => Promise.resolve(true));
    const client = new ApiClient({
      baseUrl: '/api/v1',
      fetchImplementation: fetchMock,
      sessionRefresher: { refreshSession },
    });

    await expect(client.request('/command', { body: {}, method: 'POST' })).rejects.toBeInstanceOf(
      ApiClientError,
    );
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
