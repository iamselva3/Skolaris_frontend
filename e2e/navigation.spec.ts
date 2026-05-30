import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Navigation & route guards', () => {
  test('student hitting a teacher-only route is redirected to their own home (not a forbidden dead-end)', async ({
    page,
  }) => {
    await login(page, 'student');
    await page.goto('/dashboard'); // teacher/admin only
    // Intelligent redirect: lands on the student home, never /forbidden.
    await expect(page).toHaveURL(/\/me\/exams/);
    await expect(page).not.toHaveURL(/\/forbidden/);
  });

  test('teacher hitting a student-only route is redirected to the dashboard', async ({ page }) => {
    await login(page, 'teacher');
    await page.goto('/me/exams');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).not.toHaveURL(/\/forbidden/);
  });

  test('browser back after a guarded redirect does not trap the user on forbidden', async ({
    page,
  }) => {
    await login(page, 'student');
    await page.goto('/me/results');
    await expect(page).toHaveURL(/\/me\/results/);
    // Try to reach a teacher route, get bounced home, then go back.
    await page.goto('/questions');
    await expect(page).toHaveURL(/\/me\/exams/); // bounced to student home
    await page.goBack();
    // Must not be stuck on /forbidden; should be on a usable student page.
    await expect(page).not.toHaveURL(/\/forbidden/);
    await expect(page.locator('#email')).toHaveCount(0); // still authenticated
  });

  test('teacher can navigate between core ERP pages from the dashboard', async ({ page }) => {
    await login(page, 'teacher');
    await page.goto('/questions');
    await expect(page).toHaveURL(/\/questions/);
    await page.goto('/exams');
    await expect(page).toHaveURL(/\/exams/);
    await page.goto('/uploads');
    await expect(page).toHaveURL(/\/uploads/);
    // Sanity: none of these dumped us at login or forbidden.
    await expect(page).not.toHaveURL(/\/(login|forbidden)/);
  });

  test('unauthenticated access to a protected route redirects to login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
