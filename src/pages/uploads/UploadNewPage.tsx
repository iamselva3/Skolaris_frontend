import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Sparkles, UploadCloud, X } from 'lucide-react';
import { uploadsApi } from '@/lib/api/uploads.api';
import { ocrApi } from '@/lib/api/ocr.api';
import { apiErrorMessage } from '@/lib/api/client';
import {
  ALLOWED_UPLOAD_MIMES,
  logUploadError,
  logUploadStep,
  resolveMimeType,
  sendBytes,
} from '@/lib/uploads/upload-helpers';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Loader } from '@/components/ui/Loader';
import { cn } from '@/lib/utils/cn';

const MAX_BYTES = 25 * 1024 * 1024;

const prettySize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

export const UploadNewPage = () => {
  const navigate = useNavigate();
  // A list so a single import can carry one OR many files. One file → the
  // existing single-upload flow (unchanged). Many → the batch flow.
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  // While a batch uploads, which file we're on ("Uploading file 2 of 5…").
  const [phase, setPhase] = useState<string | null>(null);

  const addFiles = useCallback((picked: FileList | File[] | null) => {
    if (!picked) return;
    const incoming = Array.from(picked);
    if (incoming.length === 0) return;
    const accepted: File[] = [];
    for (const f of incoming) {
      const mime = resolveMimeType(f);
      logUploadStep('file picked', { name: f.name, rawType: f.type, resolvedType: mime, size: f.size });
      if (!mime) {
        toast.error(`Could not determine file type for ${f.name}`);
        continue;
      }
      if (!ALLOWED_UPLOAD_MIMES.has(mime)) {
        toast.error(`${f.name}: unsupported file type (${mime})`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name}: too large (max 25 MB)`);
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length === 0) return;
    // De-dupe by name+size so re-picking the same file doesn't double-add.
    setFiles((cur) => {
      const seen = new Set(cur.map((f) => `${f.name}:${f.size}`));
      return [...cur, ...accepted.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  }, []);

  const removeFile = useCallback((idx: number) => {
    setFiles((cur) => cur.filter((_, i) => i !== idx));
  }, []);

  /** Create the upload row + PUT the bytes; returns the uploadId (PENDING_UPLOAD). */
  const uploadOne = useCallback(async (file: File): Promise<string> => {
    const mime = resolveMimeType(file);
    if (!mime) throw new Error(`Could not determine file type for ${file.name}`);
    const signed = await uploadsApi.create({
      originalName: file.name,
      mimeType: mime,
      sizeBytes: file.size,
    });
    await sendBytes(signed.signedUrl, signed.httpMethod ?? 'PUT', file, mime, setProgress);
    return signed.id;
  }, []);

  const startUpload = useMutation({
    mutationFn: async (): Promise<{ kind: 'single' | 'batch'; uploadId: string; batchId?: string }> => {
      if (files.length === 0) throw new Error('No file selected');

      // ── Single file: the EXISTING flow, unchanged (create → PUT → complete). ──
      if (files.length === 1) {
        const file = files[0];
        logUploadStep('[1/3] requesting signed URL', { name: file.name, size: file.size });
        const uploadId = await uploadOne(file);
        logUploadStep('[3/3] notifying backend complete', { uploadId });
        await uploadsApi.complete(uploadId);
        return { kind: 'single', uploadId };
      }

      // ── Many files: upload each (no complete), then hand the ordered ids to
      // the batch endpoint, which completes + dispatches them one at a time. ──
      const uploadIds: string[] = [];
      for (let i = 0; i < files.length; i += 1) {
        setPhase(`Uploading file ${i + 1} of ${files.length}…`);
        setProgress(0);
        logUploadStep('[batch] uploading file', { index: i + 1, total: files.length, name: files[i].name });
        uploadIds.push(await uploadOne(files[i]));
      }
      setPhase('Queuing batch for OCR…');
      logUploadStep('[batch] creating batch', { count: uploadIds.length });
      const batch = await ocrApi.createBatch(uploadIds);
      return { kind: 'batch', uploadId: uploadIds[0], batchId: batch.batchId };
    },
    onSuccess: (r) => {
      if (r.kind === 'batch') {
        toast.success(`${files.length} files queued for OCR. Redirecting to review…`);
        // Reuse the same review route; the ?batchId switches it to batch mode.
        navigate(`/uploads/${r.uploadId}/review?batchId=${r.batchId}`);
      } else {
        toast.success('Upload queued for OCR. Redirecting to review…');
        navigate(`/uploads/${r.uploadId}/review`);
      }
    },
    onError: (err) => {
      setProgress(null);
      setPhase(null);
      logUploadError('upload mutation failed', err);
      toast.error(apiErrorMessage(err));
    },
  });

  const uploading = startUpload.isPending;
  const multiple = files.length > 1;

  return (
    <>
      <PageHeader
        title="Upload paper"
        description="Upload one or more question papers — questions are extracted automatically"
      />

      <div className="mx-auto max-w-[560px]">
        <Card>
          <CardBody>
            <div className="space-y-4">
              {/* Dropzone */}
              <label
                htmlFor="upload-input"
                className={cn(
                  'flex h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed text-center transition-colors',
                  dragOver ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/50 hover:bg-subtle',
                  uploading && 'pointer-events-none opacity-60',
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  addFiles(e.dataTransfer.files);
                }}
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <UploadCloud size={26} />
                </span>
                <div>
                  <p className="text-[15px] font-medium text-text">
                    Drop your files here, or <span className="text-primary underline">browse</span>
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    PDF, JPG, PNG, WebP or HEIC · up to 25 MB each · select multiple to batch
                  </p>
                </div>
                <input
                  id="upload-input"
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/jpeg,image/png,image/webp,image/heic"
                  className="sr-only"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </label>

              {/* Selected files */}
              {files.length > 0 ? (
                <div className="space-y-2">
                  {files.map((file, idx) => (
                    <div
                      key={`${file.name}:${file.size}:${idx}`}
                      className="flex items-center gap-3 rounded-lg border border-border bg-subtle px-3 py-2.5"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface text-primary">
                        {multiple ? (
                          <span className="text-[12px] font-semibold tabular-nums">{idx + 1}</span>
                        ) : (
                          <FileText size={18} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-text">{file.name}</div>
                        <div className="text-[11px] text-text-muted">
                          {prettySize(file.size)} · {resolveMimeType(file) || 'unknown'}
                        </div>
                      </div>
                      {!uploading ? (
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          title="Remove file"
                          className="rounded p-1 text-text-muted hover:bg-hover hover:text-danger"
                        >
                          <X size={16} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {multiple ? (
                    <p className="text-[11px] text-text-muted">
                      {files.length} files · processed one at a time, in this order. Numbering
                      continues across files (batchSequence) while each file keeps its original
                      question numbers.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* What happens next */}
              <p className="inline-flex items-center gap-1.5 text-[12px] text-text-muted">
                <Sparkles size={13} className="text-primary" />
                You'll tag the program/subject and review the extracted questions on the next screen.
              </p>

              {/* Progress */}
              {progress !== null ? (
                <div>
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Loader /> {phase ?? 'Uploading…'}
                    </span>
                    <span className="tabular-nums">{progress}%</span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded bg-subtle">
                    <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : null}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button variant="secondary" onClick={() => navigate('/uploads')} disabled={uploading}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={files.length === 0 || uploading}
                  loading={uploading}
                  onClick={() => startUpload.mutate()}
                >
                  <UploadCloud size={15} />{' '}
                  {multiple ? `Upload ${files.length} files & extract` : 'Upload & extract'}
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
};
