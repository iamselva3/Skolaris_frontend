/**
 * Browser-side defensive helpers for upload mime/extension handling.
 *
 * Why: drag-and-drop on some browsers yields File.type === '' or the
 * non-standard 'image/jpg' (without the 'e'). The backend accepts 'image/jpg'
 * as an alias but the canonical form is 'image/jpeg'. We normalize here so the
 * UI's whitelist check and the network request both use the canonical mime.
 */

const ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
};

const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

export const ALLOWED_UPLOAD_MIMES = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);

const extensionOf = (name: string): string => {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
};

/** Returns the canonical mime to use. Empty string means we couldn't infer one. */
export const resolveMimeType = (file: File): string => {
  const raw = (file.type ?? '').trim().toLowerCase();
  if (raw && ALIASES[raw]) return ALIASES[raw];
  if (raw) return raw;
  // File.type empty — infer from extension.
  const ext = extensionOf(file.name);
  return EXTENSION_MIME[ext] ?? '';
};

export interface UploadDiagnostics {
  fileName: string;
  fileSize: number;
  rawType: string;
  resolvedType: string;
  step: string;
}

const PREFIX = '%c[uploader]';
const STYLE = 'color: #1F4E8C; font-weight: 600';

export const logUploadStep = (msg: string, extra?: Record<string, unknown>): void => {
  if (import.meta.env.PROD) return;
  // eslint-disable-next-line no-console
  console.info(`${PREFIX} ${msg}`, STYLE, extra ?? '');
};

export const logUploadError = (msg: string, err: unknown): void => {
  // eslint-disable-next-line no-console
  console.error(`${PREFIX} ${msg}`, STYLE, err);
};

/**
 * XHR-backed PUT/POST for the actual byte transfer. We use XHR (not fetch)
 * because fetch can't surface real upload-progress events in the browser; the
 * progress UI in the uploader/OCR-assist panel depends on these ticks.
 *
 * `method` must be honoured from the signed-URL response (PUT for real GCS/S3,
 * POST for the fake-gcs emulator) — see reference-ocr-pipeline memory note.
 */
export const sendBytes = (
  url: string,
  method: 'PUT' | 'POST',
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      reject(
        new Error(
          `Upload failed: ${xhr.status} ${xhr.statusText} — ${xhr.responseText.slice(0, 300)}`,
        ),
      );
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
