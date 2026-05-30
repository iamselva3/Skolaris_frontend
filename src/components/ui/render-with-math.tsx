import { useMemo } from 'react';
import katex from 'katex';

/** Inline-math regex: `$...$` (non-greedy, no nesting). Avoid `$$` blocks for now. */
const INLINE_MATH = /\$([^$]+)\$/g;

// Legacy storage-host compatibility (GCS → R2 read-proxy migration). Questions
// authored before the storage host changed have an absolute GCS-style image URL
// frozen in contentHtml. Re-point the ORIGIN of any embedded
// `…/storage/v1/b/<bucket>/o/<key>?alt=media` (or `/download/…`) URL to the
// CURRENT read host so old questions still render. Path/bucket/key are
// preserved, so this is a no-op for content authored under the current host.
const READ_HOST = import.meta.env.VITE_GCS_PUBLIC_HOST ?? 'http://localhost:4443';
const STORAGE_URL_ORIGIN = /https?:\/\/[^/"'\s]+(\/(?:download\/)?storage\/v1\/b\/)/g;
const normalizeStorageUrls = (html: string): string =>
  html.replace(STORAGE_URL_ORIGIN, `${READ_HOST}$1`);

/**
 * Render HTML with inline math segments converted via KaTeX. Returns a safe
 * dangerouslySetInnerHTML wrapper. Used by the question detail / review screens
 * to preview formulas the teacher typed into the RichTextEditor.
 */
export const renderWithMath = (html: string): JSX.Element => {
  const out = useMemo(() => {
    if (!html) return '';
    return normalizeStorageUrls(html).replace(INLINE_MATH, (_match, expr) => {
      try {
        return katex.renderToString(expr, { throwOnError: false, output: 'html' });
      } catch {
        return `<code>${expr}</code>`;
      }
    });
  }, [html]);
  // eslint-disable-next-line react/no-danger
  return <div className="tiptap-content text-sm leading-6" dangerouslySetInnerHTML={{ __html: out }} />;
};
