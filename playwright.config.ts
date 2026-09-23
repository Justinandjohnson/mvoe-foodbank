import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Mvoe Food Bank Platform.
 * All tests hit live Render URLs — no mocks, no local servers.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,       // sequential to respect rate limits
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'line',

  use: {
    // Default base URL — overridden per project where needed
    baseURL: process.env.TEST_FRONTEND_URL || 'http://localhost:8081',
    trace: 'on-first-retry',
    // Free-tier Render services can be slow to respond
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },

  // Global test timeout — Render free tier can spin up slowly
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
