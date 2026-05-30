import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Session recovery & responsive sanity', () => {
  test('hard refresh re-bootstraps the session from the stored token (no bounce to login)', async ({
    page,
  }) => {
    await login(page, 'teacher');
    await expect(page).toHaveURL(/\/dashboard/);

    await page.reload();
    // The app must re-resolve /auth/me from the persisted token and stay put,
    // not dump the user at /login.
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('#email')).toHaveCount(0);
  });

  test('deep-linking to a protected route while authenticated works after refresh', async ({
    page,
  }) => {
    await login(page, 'teacher');
    await page.goto('/questions');
    await page.reload();
    await expect(page).toHaveURL(/\/questions/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('responsive: login renders on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone-ish
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('responsive: student dashboard renders its panels on a narrow viewport', async ({ page }) => {
    await login(page, 'student');
    await page.setViewportSize({ width: 414, height: 896 });
    await page.goto('/me/exams');
    await expect(page.getByRole('heading', { name: /my exams/i })).toBeVisible();
    await expect(page.getByText(/attempt progress/i)).toBeVisible();
  });
});
