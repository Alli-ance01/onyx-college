import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  outputDir: '../../../../test-results',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE === undefined
        ? {}
        : {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          },
  },
  webServer: [
    {
      command: 'node --import tsx test/e2e/server.ts',
      cwd: '../..',
      url: 'http://localhost:4001/api/v1/health/ready',
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
    },
    {
      command:
        'pnpm build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort',
      cwd: '../../../web',
      env: { VITE_API_BASE_URL: 'http://localhost:4001/api/v1' },
      url: 'http://localhost:4173',
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
});
