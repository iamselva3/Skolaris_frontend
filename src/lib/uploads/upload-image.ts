import { uploadsApi } from '@/lib/api/uploads.api';
import { resolveMimeType, sendBytes } from './upload-helpers';
import { buildSnapshotUrl } from './storage-url';

/**
 * Build the public read URL for a storage object key.
 */
export const buildStorageUrl = (storageKey: string): string => {
  return buildSnapshotUrl(storageKey);
};

export interface UploadImageOptions {
  /** Used as the upload's originalName; defaults to a generic snip name. */
  filename?: string;
  /** Storage folder. Question/solution images use 'question-images'. */
  category?: 'question-images' | 'ocr-papers' | 'uploads';
  programId?: string;
  subjectId?: string;
  onProgress?: (pct: number) => void;
}

/**
 * Upload an in-memory image (e.g. a cropped Blob from the Snipping Tool) through
 * the existing signed-URL pipeline and return its storageKey + public URL.
 *
 * This is the shared core of the legacy `handleImageUpload` so cropped snips and
 * direct file uploads travel the exact same path: create → sendBytes → complete.
 */
export const uploadImageBlob = async (
  blob: Blob,
  opts: UploadImageOptions = {},
): Promise<{ storageKey: string; url: string }> => {
  const filename = opts.filename ?? `snip-${blob.type.split('/')[1] ?? 'png'}.png`;
  const file = blob instanceof File ? blob : new File([blob], filename, { type: blob.type || 'image/png' });
  const mime = resolveMimeType(file) || 'image/png';

  const signed = await uploadsApi.create({
    originalName: file.name,
    mimeType: mime,
    sizeBytes: file.size,
    programId: opts.programId,
    subjectId: opts.subjectId,
    category: opts.category ?? 'question-images',
  });

  await sendBytes(signed.signedUrl, signed.httpMethod ?? 'PUT', file, mime, opts.onProgress ?? (() => {}));
  await uploadsApi.complete(signed.id);

  return { storageKey: signed.storageKey, url: buildStorageUrl(signed.storageKey) };
};

/**
 * Append an image to an existing HTML content string (question stem or solution),
 * preserving any text/markup already present so "text + image" content works.
 * Returns the new HTML.
 */
export const appendImageHtml = (existingHtml: string, imageUrl: string, alt = 'Snip'): string => {
  const imgBlock = `<p><img src="${imageUrl}" alt="${alt}" class="max-w-full rounded border border-border my-2" /></p>`;
  const base = existingHtml?.trim() ?? '';
  return base ? `${base}${imgBlock}` : imgBlock;
};

/* ─── Deferred-upload helpers ────────────────────────────────────────────────
 * Snips/uploads are embedded locally as `data:` URLs and only pushed to storage
 * on Save (one pass), so cropping is instant and an unsaved+refreshed image
 * never lands in the bucket (nothing to orphan). */

/** Read a Blob/File into a base64 data URL. */
export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error ?? new Error('Could not read file'));
    fr.readAsDataURL(blob);
  });

/** Decode a base64 `data:` URL back into a Blob for upload. */
export const dataUrlToBlob = (dataUrl: string): Blob => {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] ?? 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

const DATA_IMG_SRC = /src="(data:image\/[a-zA-Z0-9.+-]+;base64,[^"]+)"/g;

/** True when the HTML embeds at least one deferred (`data:`) image. */
export const hasInlineDataImages = (html: string): boolean => (html ?? '').includes('data:image');

/**
 * Upload every embedded `data:` image to storage and swap each one for its real
 * read URL, returning the rewritten HTML. Called once at Save. HTML with only
 * real URLs (or none) is returned untouched.
 */
export const uploadInlineImages = async (
  html: string,
  opts: Omit<UploadImageOptions, 'filename' | 'onProgress'> = {},
): Promise<string> => {
  if (!hasInlineDataImages(html)) return html;
  let out = html;
  const seen = new Set<string>();
  for (const m of html.matchAll(DATA_IMG_SRC)) {
    const dataUrl = m[1];
    if (seen.has(dataUrl)) continue;
    seen.add(dataUrl);
    const { url } = await uploadImageBlob(dataUrlToBlob(dataUrl), {
      ...opts,
      filename: `snip-${seen.size}.png`,
    });
    out = out.split(dataUrl).join(url); // replace every occurrence of this data URL
  }
  return out;
};
