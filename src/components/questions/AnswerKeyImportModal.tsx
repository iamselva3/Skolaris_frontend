import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Image as ImageIcon, Type, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { apiErrorMessage } from '@/lib/api/client';
import { ocrApi, type ImportAnswerKeyResult } from '@/lib/api/ocr.api';
import { uploadImageBlob } from '@/lib/uploads/upload-image';
import {
  indexToLabel,
  normalizeToText,
  parseCsvKey,
  parseExcelKey,
  parseTextKey,
  type ParsedKey,
} from '@/lib/ocr/answer-key-parse';

type ImportMode = 'EXCEL' | 'CSV' | 'TXT' | 'PASTE' | 'IMAGE';

const MODES: Array<{ id: ImportMode; label: string; icon: typeof FileText; hint: string }> = [
  { id: 'EXCEL', label: 'Excel', icon: FileSpreadsheet, hint: '.xlsx / .xls — fastest & most accurate' },
  { id: 'CSV', label: 'CSV', icon: FileText, hint: 'Question,Answer columns' },
  { id: 'TXT', label: 'Text file', icon: FileText, hint: '.txt — one "1-A" per line' },
  { id: 'PASTE', label: 'Paste', icon: Type, hint: 'Paste the key directly' },
  { id: 'IMAGE', label: 'Image / PDF', icon: ImageIcon, hint: 'Scanned key — OCR fallback' },
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
}: {
  open: boolean;
  /** Single-job target. Omit when `applyKey` is supplied (multi-file batch). */
  jobId?: string;
  /** Number of OCR drafts in this job — used to flag count mismatch. */
  draftCount: number;
  /** Authoritative question numbers present in the drafts — used to detect a
   *  numbering mismatch (e.g. an offset) BEFORE applying the key. */
  draftNumbers: number[];
  onClose: () => void;
  onImported: (result: ImportAnswerKeyResult) => void;
  /** Batch override: apply the parsed key across many jobs (translating the
   *  continuous numbering back to each file's original numbers). When given,
   *  used instead of POST /ocr/jobs/:id/answer-key. */
  applyKey?: (input: { text?: string; storageKey?: string }) => Promise<ImportAnswerKeyResult>;
}) => {
  const [mode, setMode] = useState<ImportMode>('EXCEL');
  const [pasteText, setPasteText] = useState('');
  const [parsed, setParsed] = useState<ParsedKey | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  // Image/PDF path: uploaded answer-key file → storageKey (no client preview).
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportAnswerKeyResult | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setPasteText('');
    setParsed(null);
    setFileName(null);
    setParseError(null);
    setImageFile(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const switchMode = (m: ImportMode) => {
    setMode(m);
    reset();
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setParseError(null);
    setResult(null);
    try {
      if (mode === 'IMAGE') {
        setImageFile(file);
        setParsed(null);
        return;
      }
      let p: ParsedKey;
      if (mode === 'EXCEL') p = parseExcelKey(await file.arrayBuffer());
      else if (mode === 'CSV') p = parseCsvKey(await file.text());
      else p = parseTextKey(await file.text()); // TXT
      setParsed(p);
      if (p.entries.length === 0) setParseError('No answer mappings were found in this file.');
    } catch (e) {
      setParsed(null);
      setParseError(apiErrorMessage(e));
    }
  };

  const handlePaste = (text: string) => {
    setPasteText(text);
    setResult(null);
    const p = parseTextKey(text);
    setParsed(text.trim() ? p : null);
    setParseError(text.trim() && p.entries.length === 0 ? 'No answer mappings recognized.' : null);
  };

  const countMismatch = parsed && draftCount > 0 ? parsed.entries.length !== draftCount : false;

  // Numbering-mismatch guard: compare the key's question numbers with the drafts'
  // actual question numbers. Low overlap means the key is for a different paper or
  // is offset — applying it would map answers to the WRONG questions, so block it.
  const keyNums = parsed ? [...parsed.entries.keys()] : [];
  const draftNumSet = new Set(draftNumbers);
  const overlap = keyNums.filter((n) => draftNumSet.has(n)).length;
  const severeMismatch =
    keyNums.length > 0 && draftNumbers.length > 0 && overlap / keyNums.length < 0.5;

  const canApply =
    mode === 'IMAGE'
      ? Boolean(imageFile)
      : Boolean(parsed && parsed.entries.length > 0) && !severeMismatch;

  const send = (input: { text?: string; storageKey?: string }): Promise<ImportAnswerKeyResult> =>
    applyKey ? applyKey(input) : ocrApi.importAnswerKey(jobId!, input);

  const apply = useMutation({
    mutationFn: async (): Promise<ImportAnswerKeyResult> => {
      if (mode === 'IMAGE') {
        if (!imageFile) throw new Error('Choose an answer-key image or PDF first.');
        // 'question-images' so uploading the answer-key image doesn't spawn its
        // own OCR job — it's read by the answer-key endpoint, not the paper pipeline.
        const { storageKey } = await uploadImageBlob(imageFile, {
          category: 'question-images',
          filename: imageFile.name,
        });
        return send({ storageKey });
      }
      if (!parsed || parsed.entries.length === 0) throw new Error('Nothing to import.');
      return send({ text: normalizeToText(parsed) });
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success(`Mapped ${r.matched} answer${r.matched === 1 ? '' : 's'}`);
      onImported(r);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

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
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result ? (
            <Button variant="primary" disabled={!canApply} loading={apply.isPending} onClick={() => apply.mutate()}>
              {mode === 'IMAGE' ? 'Upload & map' : `Apply ${parsed?.entries.length ?? 0} answers`}
            </Button>
          ) : null}
        </>
      }
    >
      {/* Mode picker (Excel → CSV → TXT → Paste → Image/PDF) */}
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
                (mode === m.id
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-border bg-surface text-text-muted hover:bg-hover')
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
            placeholder={'1-A\n2-C\n3-D\n4-B\n\nor\n\n1-1\n2-3\n3-4\n4-2'}
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
          </div>
        )}
      </div>

      {parseError ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-danger">
          <AlertTriangle size={13} /> {parseError}
        </p>
      ) : null}

      {severeMismatch && !result ? (
        <div className="mt-2 rounded border border-danger bg-danger-soft p-2 text-[12px] text-danger">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <AlertTriangle size={13} /> Question numbering mismatch detected
          </span>
          <p className="mt-0.5">
            Only {overlap} of {keyNums.length} answer-key numbers match a question in this paper —
            applying could map answers to the wrong questions. Check the key matches this paper (it
            may be offset or for a different paper). Assignment is blocked until this is resolved.
          </p>
        </div>
      ) : null}

      {/* Image/PDF note (no client preview — backend OCRs it) */}
      {mode === 'IMAGE' && imageFile && !result ? (
        <p className="mt-2 text-[12px] text-text-muted">
          The key will be uploaded and read by OCR on the server. Mapped answers and any exceptions
          appear after you run the import.
        </p>
      ) : null}

      {/* Client-side preview + validation (text formats) */}
      {parsed && parsed.entries.length > 0 && !result ? (
        <PreviewBlock parsed={parsed} draftCount={draftCount} mismatch={countMismatch} />
      ) : null}

      {/* Post-import summary from the API */}
      {result ? <ResultBlock result={result} /> : null}
    </Modal>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'danger' }) => (
  <div className="rounded border border-border bg-surface px-2.5 py-1.5">
    <div
      className={
        'text-[15px] font-semibold tabular-nums ' +
        (tone === 'ok' ? 'text-success' : tone === 'warn' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-text')
      }
    >
      {value}
    </div>
    <div className="text-[10px] uppercase tracking-[0.4px] text-text-faint">{label}</div>
  </div>
);

const PreviewBlock = ({ parsed, draftCount, mismatch }: { parsed: ParsedKey; draftCount: number; mismatch: boolean }) => {
  const showLetters = parsed.format === 'LETTER' || parsed.format === 'MIXED';
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-text">
          Preview · {parsed.entries.length} answer{parsed.entries.length === 1 ? '' : 's'}
          <span className="ml-1.5 rounded bg-subtle px-1.5 py-0.5 text-[10px] text-text-muted">
            {parsed.format === 'NUMERIC' ? 'Numeric (1-1)' : parsed.format === 'LETTER' ? 'Letter (1-A)' : parsed.format}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <Stat label="Mapped" value={parsed.entries.length} tone="ok" />
        <Stat label="Drafts" value={draftCount || '—'} tone={mismatch ? 'warn' : undefined} />
        <Stat label="Duplicates" value={parsed.duplicates.length} tone={parsed.duplicates.length ? 'danger' : undefined} />
        <Stat label="Invalid" value={parsed.invalid.length} tone={parsed.invalid.length ? 'danger' : undefined} />
      </div>

      {mismatch ? (
        <p className="inline-flex items-center gap-1.5 text-[11px] text-warning">
          <AlertTriangle size={12} /> Answer count ({parsed.entries.length}) differs from draft count ({draftCount}).
          Unmatched questions will be reported after import.
        </p>
      ) : null}
      {parsed.duplicates.length ? (
        <p className="text-[11px] text-danger">Conflicting duplicate Q#: {parsed.duplicates.join(', ')} (skipped)</p>
      ) : null}
      {parsed.missingNumbers.length ? (
        <p className="text-[11px] text-text-muted">
          Missing Q#: {parsed.missingNumbers.slice(0, 30).join(', ')}
          {parsed.missingNumbers.length > 30 ? `, +${parsed.missingNumbers.length - 30} more` : ''}
        </p>
      ) : null}

      <div className="max-h-40 overflow-auto rounded border border-border">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-subtle text-text-muted">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Q#</th>
              <th className="px-2 py-1 text-left font-medium">Answer</th>
              <th className="px-2 py-1 text-left font-medium">Option</th>
            </tr>
          </thead>
          <tbody>
            {parsed.entries.map((e) => (
              <tr key={e.num} className="border-t border-border-soft">
                <td className="px-2 py-0.5 tabular-nums">{e.num}</td>
                <td className="px-2 py-0.5">{showLetters ? indexToLabel(e.index) : e.index}</td>
                <td className="px-2 py-0.5 text-text-muted">Option {e.index}</td>
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
      <CheckCircle2 size={15} /> {result.matched} answer{result.matched === 1 ? '' : 's'} mapped from {result.keyEntries} key entr
      {result.keyEntries === 1 ? 'y' : 'ies'}.
    </p>
    {result.unmatchedDrafts > 0 ? (
      <p className="text-[12px] text-text-muted">{result.unmatchedDrafts} draft(s) left without an answer (review manually).</p>
    ) : null}
    {result.unmatchedKeyNumbers.length ? (
      <p className="text-[12px] text-warning">
        Key #s with no matching question: {result.unmatchedKeyNumbers.slice(0, 30).join(', ')}
        {result.unmatchedKeyNumbers.length > 30 ? '…' : ''}
      </p>
    ) : null}
    {result.outOfRange.length ? (
      <p className="text-[12px] text-danger">Answer out of option range for Q#: {result.outOfRange.join(', ')}</p>
    ) : null}
    {result.conflicts.length ? (
      <p className="text-[12px] text-danger">Conflicting key entries for Q#: {result.conflicts.join(', ')}</p>
    ) : null}
  </div>
);
