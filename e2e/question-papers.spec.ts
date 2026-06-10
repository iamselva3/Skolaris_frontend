import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * Question Papers — standalone module, decoupled from Exams.
 *
 * Regression guard: creating a paper used to hit a duplicate `/question-papers`
 * controller in the exams module that created an *Exam*, so the composer's
 * `GET /question-papers/:id` 404'd with "Question paper not found." These tests
 * prove the create → compose → persist lifecycle works end-to-end and that the
 * Papers module never routes into exam composition.
 */
test.describe('Question Papers (standalone)', () => {
  test('create a paper opens its composer and is retrievable (was 404)', async ({ page }) => {
    await login(page, 'teacher');
    await page.goto('/question-papers');
    await expect(page).toHaveURL(/\/question-papers/);

    const title = `E2E Paper ${Date.now()}`;

    // Open the create modal and name the paper (no duration — it's a library asset).
    await page.getByRole('button', { name: /create question paper/i }).click();
    await page.locator('#new-paper-title').fill(title);
    await page.getByRole('button', { name: /create & compose/i }).click();

    // Must land on the composer for a REAL question-paper id...
    await page.waitForURL(/\/question-papers\/[0-9a-f-]{36}\/compose/, { timeout: 15_000 });
    // ...and never bounce into exam composition.
    await expect(page).not.toHaveURL(/\/exams\//);

    // The paper must LOAD — the bug surfaced as this 404 error text.
    await expect(page.getByText(/question paper not found/i)).toHaveCount(0);
    // The editable title field only renders once the paper resolves.
    await expect(page.locator('#paper-title')).toHaveValue(title);

    // Persistence: a fresh GET on reload still resolves the same paper.
    await page.reload();
    await expect(page.getByText(/question paper not found/i)).toHaveCount(0);
    await expect(page.locator('#paper-title')).toHaveValue(title);
  });

  test('add a question to the paper and it persists across reload', async ({ page }) => {
    await login(page, 'teacher');
    await page.goto('/question-papers');

    const title = `E2E Paper Q ${Date.now()}`;
    await page.getByRole('button', { name: /create question paper/i }).click();
    await page.locator('#new-paper-title').fill(title);
    await page.getByRole('button', { name: /create & compose/i }).click();
    await page.waitForURL(/\/question-papers\/[0-9a-f-]{36}\/compose/, { timeout: 15_000 });
    await expect(page.locator('#paper-title')).toHaveValue(title);

    // Open the "Add questions from the bank" modal.
    await page.getByRole('button', { name: /add questions/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const checkboxes = dialog.locator('input[type="checkbox"]');
    const available = await checkboxes.count();
    test.skip(available === 0, 'Seed question bank has no questions to add');

    await checkboxes.first().check();
    await dialog.getByRole('button', { name: /^add/i }).click();

    // The paper now has a question — the empty state disappears...
    await expect(page.getByText(/no questions yet/i)).toHaveCount(0);
    // ...and it survives a reload (server-persisted, not local state).
    await page.reload();
    await expect(page.locator('#paper-title')).toHaveValue(title);
    await expect(page.getByText(/no questions yet/i)).toHaveCount(0);
  });

  test('"From question paper" lives on the exam composer, not the Papers page', async ({ page }) => {
    await login(page, 'teacher');

    // Create an exam → land on the composer, where Option B sits next to "Add questions".
    await page.goto('/exams');
    await page.getByRole('button', { name: /new exam/i }).click();
    await page.waitForURL(/\/exams\/[0-9a-f-]{36}\/compose/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: /from question paper/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add questions/i })).toBeVisible();

    // The Papers page must NOT offer "create exam from this paper" anymore.
    await page.goto('/question-papers');
    await expect(page.getByText(/create exam from this paper/i)).toHaveCount(0);
  });
});
