import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * Smoke coverage for the DIGITAL → Reports workspace. Drives the real stack
 * (teacher account, seeded tenant 'acme'). Asserts each report renders its
 * KPIs + signature chart, the mega-menu exposes Reports, drill-down works,
 * and CSV export produces a download.
 */
test.describe('Reports workspace', () => {
  test('DIGITAL mega-menu exposes Reports and navigates into a report', async ({ page }) => {
    await login(page, 'teacher');
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'DIGITAL' }).click();
    await expect(page.getByText('REPORTS', { exact: true })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Exam reports' }).click();
    await expect(page).toHaveURL(/\/reports\/exams/);
    await expect(page.getByText('Exams (filtered)')).toBeVisible();
  });

  test('launcher shows grouped report categories', async ({ page }) => {
    await login(page, 'teacher');
    await page.goto('/reports');
    await expect(page.getByText('PERFORMANCE', { exact: true })).toBeVisible();
    await expect(page.getByText('CONTENT INSIGHT', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Exam reports/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Weak topic detection/ })).toBeVisible();
  });

  const pages: Array<{ path: string; marker: string }> = [
    { path: '/reports/exams', marker: 'Status mix (page)' },
    { path: '/reports/students', marker: 'Top students by average score' },
    { path: '/reports/topics', marker: 'Performance heatmap' },
    { path: '/reports/questions', marker: 'Difficulty-flag mix (page)' },
    { path: '/reports/classes', marker: 'Average score by class' },
    { path: '/reports/weak-topics', marker: 'Weak-topic heatmap' },
  ];

  for (const { path, marker } of pages) {
    test(`renders ${path}`, async ({ page }) => {
      await login(page, 'teacher');
      await page.goto(path);
      await expect(page.getByText(marker)).toBeVisible();
      // Export controls are present (CSV + PDF).
      await expect(page.getByRole('button', { name: /CSV/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /PDF/ })).toBeVisible();
      await expect(page).not.toHaveURL(/\/(login|forbidden)/);
    });
  }

  test('exam report drills into per-question detail', async ({ page }) => {
    await login(page, 'teacher');
    await page.goto('/reports/exams');
    await page.locator('table tbody tr td a').first().click();
    await expect(page).toHaveURL(/\/reports\/exams\/[0-9a-f-]+/);
    await expect(page.getByText('Per-question performance')).toBeVisible();
  });

  test('CSV export triggers a download', async ({ page }) => {
    await login(page, 'teacher');
    await page.goto('/reports/exams');
    await expect(page.getByText('Exams (filtered)')).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /CSV/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/exam-reports.*\.csv/);
  });
});
