import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { accounts, testPassword } from './accounts.js';
test('bounded concurrent student reads produce a local latency baseline without errors', async ({
  request,
}, testInfo) => {
  const base = 'http://localhost:4001/api/v1';
  const login = await request.post(`${base}/auth/login`, {
    headers: { Origin: 'http://localhost:4173' },
    data: { identifier: accounts.student, password: testPassword },
  });
  expect(login.status()).toBe(200);
  const token = z.object({ data: z.object({ accessToken: z.string() }) }).parse(await login.json())
    .data.accessToken;
  const times: number[] = [];
  const paths = [
    '/students/me/dashboard',
    '/timetables',
    '/assignments',
    '/notifications',
    '/results/reports',
  ];
  for (let round = 0; round < 10; round++) {
    await Promise.all(
      paths.map(async (path) => {
        const start = performance.now();
        const response = await request.get(`${base}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        expect(response.status()).toBe(200);
        times.push(performance.now() - start);
      }),
    );
  }
  times.sort((a, b) => a - b);
  const evidence = {
    environment: 'disposable local fixture, not production capacity',
    concurrency: 5,
    requests: times.length,
    p50Ms: times[24],
    p95Ms: times[47],
    maximumMs: times[49],
  };
  await writeFile(
    testInfo.outputPath('local-read-latency.json'),
    JSON.stringify(evidence, null, 2),
  );
  await testInfo.attach('local-read-latency', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
});
