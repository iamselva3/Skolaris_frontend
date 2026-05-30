import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UploadCloud } from 'lucide-react';
import { uploadsApi } from '@/lib/api/uploads.api';
import { apiErrorMessage } from '@/lib/api/client';
import type { TaxonomySelection } from '@/lib/api/taxonomy.api';
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
import { CourseSelector } from '@/components/ui/CourseSelector';
import { FormField } from '@/components/ui/FormField';
import { Loader } from '@/components/ui/Loader';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/lib/utils/cn';

const MAX_BYTES = 25 * 1024 * 1024;

export const UploadNewPage = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [taxonomy, setTaxonomy] = useState<TaxonomySelection>({});
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState<number | null>(null);

  const onPick = useCallback((f: File | null) => {
    if (!f) return setFile(null);
    const mime = resolveMimeType(f);
    logUploadStep('file picked', { name: f.name, rawType: f.type, resolvedType: mime, size: f.size });
    if (!mime) {
      toast.error(`Could not determine file type for ${f.name}`);
      return;
    }
    if (!ALLOWED_UPLOAD_MIMES.has(mime)) {
      toast.error(`Unsupported file type: ${mime}`);
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error('File too large (max 25 MB)');
      return;
    }
    setFile(f);
  }, []);

  const startUpload = useMutation({
    mutationFn: async (): Promise<{ id: string }> => {
      if (!file) throw new Error('No file selected');
      const mime = resolveMimeType(file);
      logUploadStep('[1/3] requesting signed URL', { mime, size: file.size });

      const signed = await uploadsApi.create({
        originalName: file.name,
        mimeType: mime,
        sizeBytes: file.size,
        programId: taxonomy.programId ?? undefined,
        subjectId: taxonomy.subjectId ?? undefined,
      });
      logUploadStep('[2/3] uploading bytes', {
        uploadId: signed.id,
        httpMethod: signed.httpMethod,
        urlHost: new URL(signed.signedUrl).host,
      });

      try {
        await sendBytes(signed.signedUrl, signed.httpMethod ?? 'PUT', file, mime, setProgress);
      } catch (err) {
        logUploadError('PUT/POST to signed URL failed', err);
        throw err;
      }

      logUploadStep('[3/3] notifying backend complete', { uploadId: signed.id });
      await uploadsApi.complete(signed.id);
      return { id: signed.id };
    },
    onSuccess: ({ id }) => {
      logUploadStep('done — redirecting to review', { uploadId: id });
      toast.success('Upload queued for OCR. Redirecting to review…');
      navigate(`/uploads/${id}/review`);
    },
    onError: (err) => {
      setProgress(null);
      logUploadError('upload mutation failed', err);
      toast.error(apiErrorMessage(err));
    },
  });

  return (
    <>
      <PageHeader title="Upload paper" description="Drop a past paper to extract questions" />

      <div className="mx-auto max-w-[640px]">
        <Card>
          <CardBody>
            <label
              htmlFor="upload-input"
              className={cn(
                'flex h-40 cursor-pointer flex-col items-center justify-center rounded border border-dashed border-border text-center transition-colors',
                dragOver && 'border-primary bg-primary-soft',
                !dragOver && 'hover:bg-subtle',
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                onPick(e.dataTransfer.files[0] ?? null);
              }}
            >
              <UploadCloud size={18} className="text-text-muted" />
              <p className="mt-2 text-base text-text">
                Drop file here or <span className="text-primary underline">click to browse</span>
              </p>
              <p className="mt-1 text-xs text-text-muted">
                PDF, JPG, PNG, WebP, HEIC · max 25 MB
              </p>
              <input
                id="upload-input"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/jpeg,image/png,image/webp,image/heic"
                className="sr-only"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
            </label>

            {file ? (
              <div className="mt-3 rounded border border-border bg-subtle px-3 py-2 text-xs">
                <div className="font-medium">{file.name}</div>
                <div className="text-text-muted">
                  {(file.size / 1024).toFixed(1)} KB · {resolveMimeType(file) || 'unknown'}
                </div>
              </div>
            ) : null}

            <FormField label="Pre-tag taxonomy" help="Optional. Drafts will inherit these tags on approval.">
              <CourseSelector
                value={taxonomy}
                onChange={setTaxonomy}
                levels={['programId', 'subjectId']}
              />
            </FormField>
            <FormField label="Notes" help="Private notes shown only on the review screen.">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </FormField>

            {progress !== null ? (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Loader /> Uploading… {progress}%
                  </span>
                </div>
                <div className="mt-1 h-px w-full bg-subtle">
                  <div
                    className="h-px bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => navigate('/uploads')}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!file || startUpload.isPending}
                loading={startUpload.isPending}
                onClick={() => startUpload.mutate()}
              >
                Start upload
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
};
