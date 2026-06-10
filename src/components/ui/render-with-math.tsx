import { useMemo } from 'react';
import katex from 'katex';
import { normalizeStorageUrls } from '@/lib/uploads/storage-url';

/** Inline-math regex: `$...$` (non-greedy, no nesting). Avoid `$$` blocks for now. */
const INLINE_MATH = /\$([^$]+)\$/g;

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
