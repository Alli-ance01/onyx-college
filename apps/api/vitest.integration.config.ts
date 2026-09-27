import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['test/**/*.integration.test.ts'],
    restoreMocks: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
