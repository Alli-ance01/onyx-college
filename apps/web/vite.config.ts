import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5_173,
    proxy: {
      '/api': {
        changeOrigin: true,
        target: 'http://127.0.0.1:4000',
      },
    },
  },
  test: {
    css: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
