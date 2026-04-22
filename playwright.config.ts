import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration.
 *
 * - Uses the PRODUCTION build (next build + next start) for realism —
 *   dev server has extra React warnings + slower HMR that distort tests.
 * - webServer: Playwright starts the app before tests and shuts it down after.
 * - Retries on CI only, not locally.
 * - Set PLAYWRIGHT_BASE_URL=<url> to test against an external URL (e.g.
 *   Vercel preview) instead of localhost.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined // skip webServer when testing an external URL
    : {
        command: 'npm run build && npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
