import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for the SKOLARIS ERP platform.
 *
 * Prerequisites (the suite drives the REAL stack, it does not mock):
 *   1. Backend API running at http://localhost:3000  (`npm run dev:full` in the
 *      backend repo — API + OCR worker + docker postgres/redis/fake-gcs).
 *   2. DB seeded (`npm run prisma:seed`) — provides the test accounts and the
 *      "Term 1 Quiz — Mathematics" live exam used by the attempt specs.
 *
 * The Vite dev server is started/​reused automatically via `webServer` below.
 *
 * Run:  npm run e2e            (headless)
 *       npm run e2e:headed     (watch it drive the browser)
 *       npm run e2e:ui         (Playwright UI mode)
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // shared seed data — keep serial to avoid cross-test interference
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
