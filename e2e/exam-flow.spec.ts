import { test, expect } from '@playwright/test';
import { login, BROKEN_STEM_RE } from './helpers/auth';

const EXAM_TITLE = 'Term 1 Quiz'; // seeded LIVE exam with 6 real questions

/**
 * Item-1 regression + student exam workflow.
 *
 * Critical guard: a student in an attempt NEVER sees the broken "(TYPE) <uuid>"
 * stem — they see rendered question content. Tolerant of shared seed state: a
 * startable attempt runs the full open → render → answer → submit → result
 * flow; an already-submitted exam validates the results path. The no-UUID
 * guard runs in both branches.
 */
test.describe('Student exam attempt (item-1 render regression)', () => {
  test('renders real question content in an attempt — never a UUID', async ({ page }) => {
    await login(page, 'student');
    await expect(page).toHaveURL(/\/me\/exams/);

    // Wait for the async exam list to render before inspecting links.
    await expect(page.getByText(EXAM_TITLE).first()).toBeVisible({ timeout: 15_000 });

    // Target the seeded exam specifically. NB: attempt URLs END with
    // "/attempt" while result URLs are "/me/attempts/<id>/result" — use $=
    // so the result link doesn't match the attempt selector via "attempts".
    const attemptLink = page.locator('a[href$="/attempt"]', { hasText: EXAM_TITLE });
    const resultLink = page.locator('a[href*="/attempts/"]', { hasText: EXAM_TITLE });

    if (await attemptLink.count()) {
      await attemptLink.first().click();
      await expect(page).toHaveURL(/\/me\/exams\/.+\/attempt/);

      const body = page.locator('.attempt-body');
      await expect(body).toBeVisible();

      // Real stem renders (seeded Q1 is "What is 4 × 6?").
      await expect(page.getByText(/what is 4/i)).toBeVisible();
      // Regression guard: no "(TYPE) <uuid>" anywhere in the question area.
      expect(await body.innerText()).not.toMatch(BROKEN_STEM_RE);

      // Answer Q1, then page through the rest, guarding each one.
      await page.getByRole('radio').first().check().catch(() => {});
      const next = page.getByRole('button', { name: 'Next' });
      for (let i = 0; i < 10 && (await next.isEnabled().catch(() => false)); i++) {
        await next.click();
        expect(await body.innerText()).not.toMatch(BROKEN_STEM_RE);
        // If this exam includes an image question, the <img> must actually
        // render (loaded from storage), not appear as a broken icon.
        const img = body.locator('img').first();
        if (await img.count()) {
          await expect
            .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), {
              timeout: 10_000,
            })
            .toBeGreaterThan(0);
        }
      }

      // Submit → confirm dialog → result page.
      await page.getByRole('button', { name: 'Submit' }).first().click();
      await page.getByRole('button', { name: 'Submit' }).last().click();
      await page.waitForURL(/\/result/, { timeout: 15_000 });
      expect(await page.locator('body').innerText()).not.toMatch(BROKEN_STEM_RE);
    } else if (await resultLink.count()) {
      await resultLink.first().click();
      await expect(page).toHaveURL(/\/result/);
      expect(await page.locator('body').innerText()).not.toMatch(BROKEN_STEM_RE);
    } else {
      test.skip(true, 'Seeded exam not available to the student — nothing to attempt.');
    }
  });
});
