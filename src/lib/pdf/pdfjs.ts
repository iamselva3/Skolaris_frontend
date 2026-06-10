/**
 * Thin pdfjs-dist wrapper for the Snipping Tool. Renders PDF pages to canvases
 * the crop UI can sample from.
 *
 * Worker setup: pdfjs needs a separate worker script. The `?url` import lets
 * Vite emit `pdf.worker.min.mjs` as its own asset and hand us the served URL,
 * which is the supported pattern (no manual public/ copy, no CDN dependency).
 */
import * as pdfjsLib from 'pdfjs-dist';
// eslint-disable-next-line import/no-unresolved
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDocument = pdfjsLib.PDFDocumentProxy;

/** Parse PDF bytes into a document proxy. Caller owns destroy(). */
export const loadPdfDocument = async (data: ArrayBuffer): Promise<PdfDocument> => {
  // Copy into a fresh Uint8Array — pdfjs transfers/owns the buffer it's given.
  const task = pdfjsLib.getDocument({ data: new Uint8Array(data) });
  return task.promise;
};

/**
 * Render a single page to a detached canvas at the given scale + rotation.
 * Rotation is added to the page's intrinsic rotation, in degrees (0/90/180/270).
 */
export const renderPdfPageToCanvas = async (
  pdf: PdfDocument,
  pageNumber: number,
  scale: number,
  rotation = 0,
): Promise<HTMLCanvasElement> => {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale, rotation });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
};
