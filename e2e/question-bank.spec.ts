import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Teacher Question Bank & authoring', () => {
  test('Question Bank list loads', async ({ page }) => {
    await login(page, 'teacher');
    await page.goto('/questions');
    await expect(page).toHaveURL(/\/questions/);
    await expect(page).not.toHaveURL(/\/(login|forbidden)/);
  });

  test('Add Question shows the bulk OCR ingest panel AND the manual editor', async ({ page }) => {
    await login(page, 'teacher');
    await page.goto('/questions/new');
    await expect(page).toHaveURL(/\/questions\/new/);

    // OCR ingestion entry point (dropzone) — the connected OCR workflow.
    await expect(page.getByText(/drop a question paper/i)).toBeVisible();

    // Manual authoring still present (the editor coexists with OCR).
    await expect(page.getByText(/question content/i)).toBeVisible();
  });

  test('Exams list loads for the teacher', async ({ page }) => {
    await login(page, 'teacher');
    await page.goto('/exams');
    await expect(page).toHaveURL(/\/exams/);
    await expect(page).not.toHaveURL(/\/(login|forbidden)/);
  });
});
