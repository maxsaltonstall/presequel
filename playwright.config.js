import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.js',
  timeout: 30000,
  webServer: {
    command: 'node server.js',
    env: { PORT: '5299', RATE_LIMIT_CAPACITY: '200' },
    url: 'http://localhost:5299',
    reuseExistingServer: false,
    timeout: 10000,
  },
  use: {
    baseURL: 'http://localhost:5299',
    headless: true,
  },
});
