import { useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Image as ImageIcon, Type, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { apiErrorMessage } from '@/lib/api/client';
import { ocrApi, type ImportAnswerKeyResult, type ParseReport, type PreviewAnswerKeyResult } from '@/lib/api/ocr.api';
import { uploadImageBlob } from '@/lib/uploads/upload-image';
import { csvToText, excelToText } from '@/lib/ocr/answer-key-parse';

type ImportMode = 'EXCEL' | 'CSV' | 'TXT' | 'PASTE' | 'IMAGE';
type KeyInput = { text?: string; storageKey?: string };

const MODES: Array<{ id: ImportMode; label: string; icon: typeof FileText; hint: string }> = [
  { id: 'EXCEL', label: 'Excel', icon: FileSpreadsheet, hint: '.xlsx / .xls — all sheets, fastest & most accurate' },
  { id: 'CSV', label: 'CSV', icon: FileText, hint: 'Question,Answer columns' },
  { id: 'TXT', label: 'Text file', icon: FileText, hint: '.txt — one "1-A" per line' },
  { id: 'PASTE', label: 'Paste', icon: Type, hint: 'Paste the key directly' },
  { id: 'IMAGE', label: 'Image / PDF', icon: ImageIcon, hint: 'Scanned key — OCR (answer-key pages only)' },
];

const ACCEPT: Record<ImportMode, string> = {
  EXCEL: '.xlsx,.xls',
  CSV: '.csv,text/csv',
  TXT: '.txt,text/plain',
  PASTE: '',
  IMAGE: 'image/*,application/pdf',
};

export const AnswerKeyImportModal = ({
  open,
  jobId,
  draftCount,
  draftNumbers,
  onClose,
  onImported,
  applyKey,
  previewKey,
}: {
  open: boolean;
  /** Single-job target. Omit when `applyKey`/`previewKey` are supplied (batch). */
  jobId?: string;
  draftCount: number;
  /** Authoritative question numbers in the drafts — used to detect a numbering mismatch. */
  draftNumbers: number[];
  onClose: () => void;
  onImported: (result: ImportAnswerKeyResult) => void;
  /** Batch override for APPLY (translates continuous numbering to each file). */
  applyKey?: (input: KeyInput) => Promise<ImportAnswerKeyResult>;
  /** Batch override for PREVIEW. When neither this nor `jobId` is given, preview
   *  is unavailable and apply proceeds directly (graceful degrade). */
  previewKey?: (input: KeyInput) => Promise<PreviewAnswerKeyResult>;
}) => {
  const [mode, setMode] = useState<ImportMode>('EXCEL');
  const [pasteText, setPasteText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [input, setInput] = useState<KeyInput | null>(null);
  const [preview, setPreview] = useState<PreviewAnswerKeyResult | null>(null);
  const [result, setResult] = useState<ImportAnswerKeyResult | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const canPreview = Boolean(jobId || previewKey);

  const reset = () => {
    setPasteText('');
    setFileName(null);
    setError(null);
    setUploading(false);
    setInput(null);
    setPreview(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const switchMode = (m: ImportMode) => {
    setMode(m);
    reset();
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setError(null);
    setResult(null);
    setPreview(null);
    try {
      if (mode === 'IMAGE') {
        setUploading(true);
        // 'question-images' so uploading the answer-key file doesn't spawn its
        // own OCR job — it's read by the answer-key endpoint, not the pipeline.
        const { storageKey } = await uploadImageBlob(file, { category: 'question-images', filename: file.name });
        setInput({ storageKey });
        setUploading(false);
        return;
      }
      const text =
        mode === 'EXCEL' ? excelToText(await file.arrayBuffer()) : mode === 'CSV' ? csvToText(await file.text()) : await file.text();
      setInput(text.trim() ? { text } : null);
      if (!text.trim()) setError('No content could be read from this file.');
    } catch (e) {
      setUploading(false);
      setInput(null);
      setError(apiErrorMessage(e));
    }
  };

  const handlePaste = (text: string) => {
    setPasteText(text);
    setResult(null);
    setPreview(null);
    setInput(text.trim() ? { text } : null);
  };

  const runPreview = useMutation({
    mutationFn: async (): Promise<PreviewAnswerKeyResult> => {
      if (!input) throw new Error('Provide an answer key first.');
      if (previewKey) return previewKey(input);
      if (jobId) return ocrApi.previewAnswerKey(jobId, input);
      throw new Error('Preview is not available here.');
    },
    onSuccess: (p) => setPreview(p),
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const apply = useMutation({
    mutationFn: async (): Promise<ImportAnswerKeyResult> => {
      if (!input) throw new Error('Nothing to import.');
      return applyKey ? applyKey(input) : ocrApi.importAnswerKey(jobId as string, input);
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success(`Mapped ${r.matched} answer${r.matched === 1 ? '' : 's'}`);
      onImported(r);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const report = preview?.report ?? null;

  // Numbering-mismatch guard: low overlap means a different/offset paper.
  const severeMismatch = useMemo(() => {
    if (!report || draftNumbers.length === 0 || report.entries.length === 0) return false;
    const set = new Set(draftNumbers);
    const overlap = report.entries.filter((e) => set.has(e.questionNumber)).length;
    return overlap / report.entries.length < 0.5;
  }, [report, draftNumbers]);

  const canApply = canPreview
    ? Boolean(report && report.totalDetected > 0) && !severeMismatch
    : Boolean(input); // graceful degrade when preview unavailable (batch)

  return (
    <Modal
      open={open}
      title="Import answer key"
      onClose={() => {
        reset();
        onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={() => { reset(); onClose(); }}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result ? (
            <>
              {canPreview && !preview ? (
                <Button variant="secondary" disabled={!input || uploading} loading={runPreview.isPending} onClick={() => runPreview.mutate()}>
                  Preview
                </Button>
              ) : null}
              <Button variant="primary" disabled={!canApply} loading={apply.isPending} onClick={() => apply.mutate()}>
                {preview ? `Confirm import (${preview.willMatch})` : 'Import'}
              </Button>
            </>
          ) : null}
        </>
      }
    >
      {/* Mode picker */}
      <div className="flex flex-wrap gap-1.5">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => switchMode(m.id)}
              className={
                'inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[12px] font-medium transition-colors ' +
                (mode === m.id ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-text-muted hover:bg-hover')
              }
            >
              <Icon size={13} /> {m.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-text-faint">{MODES.find((m) => m.id === mode)?.hint}</p>

      {/* Input */}
      <div className="mt-3">
        {mode === 'PASTE' ? (
          <Textarea
            value={pasteText}
            onChange={(e) => handlePaste(e.target.value)}
            rows={6}
            placeholder={'1-A\n2-C\n3-D\n\nor\n\n1 (A)  2 (B)  46 (C)  69 (B)'}
            className="font-mono text-[12px]"
          />
        ) : (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT[mode]}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-1.5 rounded border border-dashed border-border bg-subtle px-4 py-6 text-[12px] text-text-muted hover:border-primary hover:text-primary"
            >
              <Upload size={18} />
              {fileName ? <span className="font-medium text-text">{fileName}</span> : <span>Choose a {MODES.find((m) => m.id === mode)?.label} file</span>}
              <span className="text-[11px] text-text-faint">Accepted: {ACCEPT[mode]}</span>
            </button>
            {uploading ? <p className="mt-2 text-[12px] text-text-muted">Uploading…</p> : null}
          </div>
        )}
      </div>

      {error ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-danger">
          <AlertTriangle size={13} /> {error}
        </p>
      ) : null}

      {input && !preview && !result && mode === 'IMAGE' ? (
        <p className="mt-2 text-[12px] text-text-muted">Ready. Click <b>Preview</b> — the server reads the answer-key pages (solutions are ignored).</p>
      ) : null}

      {severeMismatch && !result ? (
        <div className="mt-2 rounded border border-danger bg-danger-soft p-2 text-[12px] text-danger">
          <span className="inline-flex items-center gap-1.5 font-semibold"><AlertTriangle size={13} /> Question numbering mismatch</span>
          <p className="mt-0.5">Fewer than half of the key's numbers match this paper — it may be offset or for a different paper. Import is blocked.</p>
        </div>
      ) : null}

      {report && !result ? <ReportBlock report={report} draftCount={draftCount} willMatch={preview?.willMatch ?? 0} /> : null}
      {result ? <ResultBlock result={result} /> : null}
    </Modal>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'danger' }) => (
  <div className="rounded border border-border bg-surface px-2.5 py-1.5">
    <div className={'text-[15px] font-semibold tabular-nums ' + (tone === 'ok' ? 'text-success' : tone === 'warn' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-text')}>
      {value}
    </div>
    <div className="text-[10px] uppercase tracking-[0.4px] text-text-faint">{label}</div>
  </div>
);

const answerLabel = (a: ParseReport['entries'][number]['answer']): string =>
  a.kind === 'boolean' ? (a.value ? 'TRUE' : 'FALSE') : `${a.label} (option ${a.index})`;

const ReportBlock = ({ report, draftCount, willMatch }: { report: ParseReport; draftCount: number; willMatch: number }) => {
  const countMismatch = draftCount > 0 && report.totalDetected !== draftCount;
  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-4 gap-1.5">
        <Stat label="Detected" value={report.totalDetected} tone="ok" />
        <Stat label="Will map" value={willMatch} tone={willMatch === 0 ? 'danger' : undefined} />
        <Stat label="Drafts" value={draftCount || '—'} tone={countMismatch ? 'warn' : undefined} />
        <Stat label="Invalid" value={report.invalid.length} tone={report.invalid.length ? 'danger' : undefined} />
      </div>

      {report.zeroOrNegative.length ? (
        <p className="text-[11px] text-danger">Rejected (number &lt; 1): {report.zeroOrNegative.join(', ')}</p>
      ) : null}
      {report.conflicts.length ? (
        <p className="text-[11px] text-danger">Conflicting duplicate Q#: {report.conflicts.join(', ')} (skipped)</p>
      ) : null}
      {report.duplicates.length ? (
        <p className="text-[11px] text-text-muted">Duplicate Q#: {report.duplicates.join(', ')}</p>
      ) : null}
      {report.invalid.length ? (
        <p className="text-[11px] text-danger">Invalid answers: {report.invalid.map((i) => `${i.questionNumber}→${i.raw}`).join(', ')}</p>
      ) : null}
      {report.outOfRange.length ? (
        <p className="text-[11px] text-danger">Answer out of option range for Q#: {report.outOfRange.join(', ')}</p>
      ) : null}
      {report.missingNumbers.length ? (
        <p className="text-[11px] text-text-muted">
          Missing Q#: {report.missingNumbers.slice(0, 30).join(', ')}
          {report.missingNumbers.length > 30 ? `, +${report.missingNumbers.length - 30} more` : ''}
        </p>
      ) : null}

      {/* PDF/image page selection */}
      {report.pagesUsed.length || report.pagesIgnored.length ? (
        <p className="text-[11px] text-text-muted">
          Pages used: {report.pagesUsed.join(', ') || '—'}
          {report.pagesIgnored.length ? ` · ignored: ${report.pagesIgnored.map((p) => `${p.page} (${p.reason})`).join(', ')}` : ''}
        </p>
      ) : null}

      <div className="max-h-40 overflow-auto rounded border border-border">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-subtle text-text-muted">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Q#</th>
              <th className="px-2 py-1 text-left font-medium">Answer</th>
            </tr>
          </thead>
          <tbody>
            {report.entries.map((e) => (
              <tr key={e.questionNumber} className="border-t border-border-soft">
                <td className="px-2 py-0.5 tabular-nums">{e.questionNumber}</td>
                <td className="px-2 py-0.5">{answerLabel(e.answer)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ResultBlock = ({ result }: { result: ImportAnswerKeyResult }) => (
  <div className="mt-3 space-y-2 rounded border border-border bg-subtle p-3">
    <p className="inline-flex items-center gap-1.5 text-[13px] font-medium text-success">
      <CheckCircle2 size={15} /> {result.matched} answer{result.matched === 1 ? '' : 's'} mapped from {result.keyEntries} key entr{result.keyEntries === 1 ? 'y' : 'ies'}.
    </p>
    {result.unmatchedDrafts > 0 ? <p className="text-[12px] text-text-muted">{result.unmatchedDrafts} draft(s) left without an answer (review manually).</p> : null}
    {result.unmatchedKeyNumbers.length ? (
      <p className="text-[12px] text-warning">Key #s with no matching question: {result.unmatchedKeyNumbers.slice(0, 30).join(', ')}{result.unmatchedKeyNumbers.length > 30 ? '…' : ''}</p>
    ) : null}
    {result.outOfRange.length ? <p className="text-[12px] text-danger">Answer out of option range for Q#: {result.outOfRange.join(', ')}</p> : null}
    {result.conflicts.length ? <p className="text-[12px] text-danger">Conflicting key entries for Q#: {result.conflicts.join(', ')}</p> : null}
  </div>
);
