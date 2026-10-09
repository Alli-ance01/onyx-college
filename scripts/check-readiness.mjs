// Read-only readiness probe. No credentials, response bodies or student data are logged.
const raw = process.env.ONYX_HEALTH_URL;
if (!raw) throw new Error('Set ONYX_HEALTH_URL to the API /api/v1/health/ready endpoint.');
const url = new URL(raw);
if (
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  url.pathname !== '/api/v1/health/ready' ||
  (url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
) {
  throw new Error(
    'Use an HTTPS readiness URL without credentials or query parameters (HTTP allowed only on localhost).',
  );
}
const startedAt = Date.now();
try {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  });
  const body = await response.json();
  if (!response.ok || body?.data?.status !== 'ready') throw new Error('Readiness check failed');
  console.log(`API ready in ${Date.now() - startedAt}ms`);
} catch {
  console.error(
    'API readiness failed or exceeded 15 seconds. Check provider health and request logs.',
  );
  process.exitCode = 1;
}
