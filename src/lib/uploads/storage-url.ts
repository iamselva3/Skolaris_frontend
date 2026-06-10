/**
 * Current object-read host — the backend storage read-proxy. Reads stream
 * through `${host}/storage/v1/b/<bucket>/o/<key>?alt=media`. MUST be the API
 * origin + `/api` (see .env / image-delivery-proxy).
 */
const READ_HOST = import.meta.env.VITE_GCS_PUBLIC_HOST ?? 'http://localhost:3000/api';
const SNAPSHOT_BUCKET = import.meta.env.VITE_STORAGE_BUCKET ?? 'skolaris';

// Matches the ORIGIN of any embedded storage read URL (GCS-style or the
// `/download/...` worker variant). Capturing group keeps the path so only the
// host is repointed.
const STORAGE_URL_ORIGIN = /https?:\/\/[^/"'\s]+(\/(?:download\/)?storage\/v1\/b\/)/g;

/**
 * Re-point the host of any storage read URL embedded in `html` (or a bare URL
 * string) to the CURRENT read host.
 */
export const normalizeStorageUrls = (html: string): string =>
  (html ?? '').replace(STORAGE_URL_ORIGIN, `${READ_HOST}$1`);

/** Read-proxy URL for a stored snapshot key. */
export const buildSnapshotUrl = (key: string): string =>
  `${READ_HOST}/storage/v1/b/${SNAPSHOT_BUCKET}/o/${encodeURIComponent(key)}?alt=media`;
