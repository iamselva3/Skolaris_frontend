import { test, expect } from '@playwright/test';
import { ACCOUNTS, login, logout } from './helpers/auth';

test.describe('Auth lifecycle', () => {
  test('teacher logs in and lands on the dashboard', async ({ page }) => {
    await login(page, 'teacher');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('student logs in and lands on My Exams', async ({ page }) => {
    await login(page, 'student');
    await expect(page).toHaveURL(/\/me\/exams/);
    await expect(page.getByRole('heading', { name: /my exams/i })).toBeVisible();
  });

  test('rejects bad credentials without navigating away', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(ACCOUNTS.teacher.email);
    await page.locator('#password').fill('WrongPassword1!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('#email')).toBeVisible();
  });

  test('logout returns to login and re-login works (no infinite render loop)', async ({ page }) => {
    await login(page, 'teacher');
    await logout(page);

    // Regression: after logout the login page must render normally (not get
    // stuck redirecting/loading). The form must be interactable and the URL
    // must STAY on /login for a beat (no bounce back to a protected route).
    await expect(page.locator('#email')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('#email')).toBeEnabled();

    // And we can immediately log back in.
    await login(page, 'teacher');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
