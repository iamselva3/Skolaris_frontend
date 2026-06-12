import 'react-image-crop/dist/ReactCrop.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactCrop, { type Crop } from 'react-image-crop';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCw,
  Scissors,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { loadPdfDocument, renderPdfPageToCanvas, type PdfDocument } from '@/lib/pdf/pdfjs';
import { Button } from './Button';
import { cn } from '@/lib/utils/cn';

export type SnipSource =
  | { kind: 'file'; file: File }
  | { kind: 'url'; url: string; mime?: string; name?: string };

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional initial source (e.g. the OCR original document). */
  source?: SnipSource | null;
  /** Show an in-modal file picker so the user can choose/replace a PDF or image. */
  allowSourcePicker?: boolean;
  /**
   * Receives the cropped PNG blob. May be async (e.g. uploads to storage); the
   * modal shows a working state until it resolves, then closes.
   */
  onCropped: (blob: Blob) => void | Promise<void>;
  title?: string;
}

const PDF_BASE_SCALE = 1.5;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

const looksLikePdf = (mime?: string, name?: string): boolean =>
  !!mime?.toLowerCase().includes('pdf') || !!name?.toLowerCase().endsWith('.pdf');

/** Draw an image element to a fresh canvas at the given scale + rotation (deg). */
const drawImageToCanvas = (
  img: HTMLImageElement,
  scale: number,
  rotation: number,
): HTMLCanvasElement => {
  const rad = ((rotation % 360) * Math.PI) / 180;
  const swap = rotation % 180 !== 0;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(swap ? h : w);
  canvas.height = Math.ceil(swap ? w : h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return canvas;
};

/**
 * Snipping Tool — crop a region from a PDF page or image entirely in-app.
 *
 * Both source kinds are normalized to a single "base canvas" displayed 1:1, so
 * the crop rectangle maps directly to source pixels. Zoom re-renders the base
 * canvas (crisp for PDFs); the cropped region is exported as a PNG Blob.
 *
 * Reusable across the Question form and OCR review — the caller decides what to
 * do with the blob (typically uploadImageBlob → insert <img>).
 */
export const SnippingTool = ({
  open,
  onClose,
  source,
  allowSourcePicker = true,
  onCropped,
  title = 'Snipping Tool',
}: Props): JSX.Element | null => {
  const [activeSource, setActiveSource] = useState<SnipSource | null>(source ?? null);
  const [kind, setKind] = useState<'image' | 'pdf' | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  // Stored as a percentage crop so the selection stays correct across zoom,
  // rotation and page changes (it's view-independent).
  const [crop, setCrop] = useState<Crop>();
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pdfRef = useRef<PdfDocument | null>(null);
  const imageElRef = useRef<HTMLImageElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  // Sync the incoming source when the modal (re)opens — but key on the source's
  // CONTENT, not the object identity. Callers pass a fresh `{kind:'url',...}`
  // object every render, so depending on identity would reset `activeSource`
  // (and wipe the in-progress crop) on every parent re-render. Keying on the
  // url/file means we only reset when the actual source changes.
  const sourceKey = source
    ? source.kind === 'file'
      ? `file:${source.file.name}:${source.file.size}`
      : `url:${source.url}`
    : 'none';
  const sourceRef = useRef<SnipSource | null>(source ?? null);
  sourceRef.current = source ?? null;
  useEffect(() => {
    if (open) setActiveSource(sourceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceKey]);

  const cleanup = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (pdfRef.current) {
      pdfRef.current.destroy().catch(() => {});
      pdfRef.current = null;
    }
    imageElRef.current = null;
    baseCanvasRef.current = null;
  }, []);

  // Reset everything when the modal closes.
  useEffect(() => {
    if (open) return;
    cleanup();
    setKind(null);
    setBaseUrl(null);
    setCrop(undefined);
    setScale(1);
    setRotation(0);
    setPageNum(1);
    setNumPages(1);
    setError(null);
  }, [open, cleanup]);

  /* ── Load the active source (file or fetched URL) into pdf/image ── */
  useEffect(() => {
    if (!open || !activeSource) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCrop(undefined);
    setScale(1);
    setRotation(0);
    setPageNum(1);

    (async () => {
      try {
        // Resolve bytes/blob. URL sources are fetched to a same-origin blob so
        // the export canvas isn't CORS-tainted.
        let blob: Blob;
        let mime: string | undefined;
        let name: string | undefined;
        if (activeSource.kind === 'file') {
          blob = activeSource.file;
          mime = activeSource.file.type;
          name = activeSource.file.name;
        } else {
          const res = await fetch(activeSource.url);
          if (!res.ok) throw new Error(`Could not load source (${res.status})`);
          blob = await res.blob();
          mime = activeSource.mime ?? blob.type;
          name = activeSource.name ?? activeSource.url;
        }

        cleanup();

        if (looksLikePdf(mime, name)) {
          const buf = await blob.arrayBuffer();
          if (cancelled) return;
          const pdf = await loadPdfDocument(buf);
          if (cancelled) {
            pdf.destroy().catch(() => {});
            return;
          }
          pdfRef.current = pdf;
          setNumPages(pdf.numPages);
          setKind('pdf');
        } else {
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Could not decode image'));
            img.src = url;
          });
          if (cancelled) return;
          imageElRef.current = img;
          setNumPages(1);
          setKind('image');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load source');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, activeSource, cleanup]);

  /* ── Rebuild the base canvas on page / zoom / rotation change ── */
  useEffect(() => {
    if (!open || !kind) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        let canvas: HTMLCanvasElement;
        if (kind === 'pdf' && pdfRef.current) {
          canvas = await renderPdfPageToCanvas(
            pdfRef.current,
            pageNum,
            PDF_BASE_SCALE * scale,
            rotation,
          );
        } else if (kind === 'image' && imageElRef.current) {
          canvas = drawImageToCanvas(imageElRef.current, scale, rotation);
        } else {
          return;
        }
        if (cancelled) return;
        baseCanvasRef.current = canvas;
        setBaseUrl(canvas.toDataURL('image/png'));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to render');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, kind, pageNum, scale, rotation]);

  const onPickFile = (file: File | null): void => {
    if (!file) return;
    setActiveSource({ kind: 'file', file });
  };

  // Map the percentage crop onto the full-resolution base canvas.
  const pixelRect = (canvas: HTMLCanvasElement, c: Crop) => ({
    x: Math.round((c.x / 100) * canvas.width),
    y: Math.round((c.y / 100) * canvas.height),
    width: Math.round((c.width / 100) * canvas.width),
    height: Math.round((c.height / 100) * canvas.height),
  });

  const handleCrop = async (): Promise<void> => {
    const canvas = baseCanvasRef.current;
    if (!canvas || !crop || crop.width < 1 || crop.height < 1) {
      setError('Draw a selection box first.');
      return;
    }
    const r = pixelRect(canvas, crop);
    if (r.width < 2 || r.height < 2) {
      setError('Selection too small.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const out = document.createElement('canvas');
      out.width = r.width;
      out.height = r.height;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('Could not get 2D canvas context');
      ctx.drawImage(canvas, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        out.toBlob((b) => resolve(b), 'image/png'),
      );
      if (!blob) throw new Error('Could not produce image');
      await onCropped(blob);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Crop failed');
    } finally {
      setWorking(false);
    }
  };

  // Live selection size in source pixels, for the footer readout.
  const selectionPx =
    crop && crop.width > 0 && baseCanvasRef.current
      ? pixelRect(baseCanvasRef.current, crop)
      : null;

  if (!open) return null;

  const hasSource = !!activeSource;

  // Render through a portal on document.body so the snipping overlay escapes any
  // parent stacking context (transformed/filtered cards, sticky toolbars) and
  // is layered above EVERYTHING — `z-[100]` beats the app's `z-50` ceiling
  // (drawers, mega-menu, dropdown/select popovers). The full-viewport overlay
  // then intercepts all clicks, so the page's taxonomy selects, navigators and
  // bulk-action controls can neither show through nor be opened underneath it.
  return createPortal(
    <div className="modal-overlay z-[100]" role="dialog" aria-modal="true">
      <div
        className="modal max-w-5xl flex h-[88vh] flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <span className="inline-flex items-center gap-2">
            <Scissors size={16} className="text-primary" /> {title}
          </span>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose} disabled={working}>
            <X size={16} />
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border-soft bg-subtle px-3 py-2 text-xs">
          {kind === 'pdf' && (
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={pageNum <= 1 || loading}
                onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                title="Previous page"
              >
                <ChevronLeft size={14} />
              </Button>
              <span className="px-1 font-mono tabular-nums text-text-muted">
                {pageNum} / {numPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={pageNum >= numPages || loading}
                onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                title="Next page"
              >
                <ChevronRight size={14} />
              </Button>
              <span className="mx-1 h-4 w-px bg-border" />
            </div>
          )}

          <Button
            variant="secondary"
            size="sm"
            disabled={scale <= MIN_ZOOM || loading || !kind}
            onClick={() => setScale((s) => Math.max(MIN_ZOOM, +(s - ZOOM_STEP).toFixed(2)))}
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </Button>
          <span className="w-12 text-center font-mono tabular-nums text-text-muted">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={scale >= MAX_ZOOM || loading || !kind}
            onClick={() => setScale((s) => Math.min(MAX_ZOOM, +(s + ZOOM_STEP).toFixed(2)))}
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </Button>

          <span className="mx-1 h-4 w-px bg-border" />
          <Button
            variant="secondary"
            size="sm"
            disabled={loading || !kind}
            onClick={() => setRotation((r) => (r + 90) % 360)}
            title="Rotate 90°"
          >
            <RotateCw size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading || (!crop && scale === 1 && rotation === 0)}
            onClick={() => {
              setCrop(undefined);
              setScale(1);
              setRotation(0);
            }}
            title="Reset zoom, rotation and selection"
          >
            Reset
          </Button>

          {allowSourcePicker && (
            <>
              <span className="mx-1 h-4 w-px bg-border" />
              <Button
                variant="secondary"
                size="sm"
                disabled={working}
                onClick={() => pickerRef.current?.click()}
                title="Choose a PDF or image to snip from"
              >
                <UploadCloud size={14} className="mr-1" /> {hasSource ? 'Change source' : 'Choose file'}
              </Button>
            </>
          )}
          <input
            ref={pickerRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {/* Canvas area */}
        <div className="relative flex-1 overflow-auto bg-[repeating-conic-gradient(theme(colors.subtle)_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] p-4">
          {!hasSource ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Scissors size={26} />
              </div>
              <div className="text-sm font-medium text-text">Choose a PDF or image to snip from</div>
              <p className="max-w-sm text-xs text-text-muted">
                Then drag a box over the region you need — graph, formula, diagram, table or
                handwriting — and crop it straight into your question.
              </p>
              {allowSourcePicker && (
                <Button variant="primary" size="sm" onClick={() => pickerRef.current?.click()}>
                  <UploadCloud size={14} className="mr-1" /> Choose file
                </Button>
              )}
            </div>
          ) : loading && !baseUrl ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
              <Loader2 size={18} className="animate-spin" /> Loading…
            </div>
          ) : baseUrl ? (
            <div className="inline-block">
              <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)}>
                {/* Displayed 1:1 with the base canvas — no max-width so crop px == source px. */}
                <img
                  src={baseUrl}
                  alt="Snip source"
                  style={{ display: 'block', maxWidth: 'none' }}
                />
              </ReactCrop>
            </div>
          ) : null}

          {loading && baseUrl ? (
            <div className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1.5 rounded bg-surface/90 px-2 py-1 text-xs text-text-muted shadow">
              <Loader2 size={12} className="animate-spin" /> Rendering…
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="modal-footer flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-[16px] text-xs">
            {error ? (
              <span className="text-danger">{error}</span>
            ) : selectionPx && selectionPx.width > 1 ? (
              <span className="text-text-muted">
                Selection: {selectionPx.width}×{selectionPx.height} px
              </span>
            ) : hasSource ? (
              <span className="text-text-faint">Drag a box over the region you want.</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={working}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCrop}
              loading={working}
              disabled={!crop || crop.width < 1 || loading}
            >
              <Scissors size={14} className="mr-1" /> Crop &amp; attach
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
