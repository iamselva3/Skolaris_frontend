import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { login } from './helpers/auth';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'snip.png');

/**
 * Image / snipping workflow.
 *
 * Proves the full chain that makes images show up in the exam player:
 *   upload → backend stores under question-images/ → FE builds the public
 *   fake-gcs URL → browser actually fetches & renders it (naturalWidth > 0).
 * The exam player embeds the SAME URL string via dangerouslySetInnerHTML, so a
 * loaded preview here means a loaded image there (also confirmed at the API
 * level: start-attempt serialization carries the <img> HTML).
 */
test.describe('Question image upload (snipping tool)', () => {
  test('uploads a snip and the preview image actually loads from storage', async ({ page }) => {
    await login(page, 'teacher');
    await page.goto('/questions/new');

    // Switch the Question content panel to image mode.
    await page.getByRole('button', { name: /upload snip/i }).click();

    // Feed the snip file input. Two file inputs exist (the OCR dropzone also
    // accepts PDFs); the snip input is image-only, so exclude the pdf one.
    await page
      .locator('input[type="file"]:not([accept*="pdf"])')
      .setInputFiles(FIXTURE);

    // The preview <img> appears once upload+complete resolves.
    const preview = page.getByRole('img', { name: /uploaded question snip/i });
    await expect(preview).toBeVisible({ timeout: 20_000 });

    // It must point at a storage read host and have actually decoded (loaded).
    // Hosts: fake-gcs (4443) / real GCS, OR the S3/R2 read proxy (API :3000/api)
    // / MinIO (:9000) / Cloudflare R2 when STORAGE_PROVIDER=s3.
    await expect(preview).toHaveAttribute(
      'src',
      /localhost:4443|storage\.googleapis|localhost:3000\/api|localhost:9000|r2\.cloudflarestorage/,
    );
    await expect
      .poll(async () => preview.evaluate((el: HTMLImageElement) => el.naturalWidth), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
  });
});
