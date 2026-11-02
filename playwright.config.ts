import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Local secrets and overrides come from the gitignored env file. In CI the file
// is absent and the variables come from the job.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

// expo serve defaults to 8081, which is taken on this machine; E2E_PORT overrides it.
const PORT = Number(process.env.E2E_PORT ?? 8081);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Production-like static web export served by Expo's own static server.
    command: `npx expo export --platform web && npx expo serve --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
