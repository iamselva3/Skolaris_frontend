import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Layers } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CourseSelector } from '@/components/ui/CourseSelector';
import { Select } from '@/components/ui/Select';
import { apiErrorMessage } from '@/lib/api/client';
import { ocrApi, type AssignTaxonomyBody } from '@/lib/api/ocr.api';
import type { TaxonomySelection } from '@/lib/api/taxonomy.api';
import type { Difficulty } from '@/lib/types';

/**
 * Bulk taxonomy — set Program/Subject/Chapter/Topic + difficulty once and apply
 * across the whole OCR batch (or just the selected drafts), so teachers don't
 * configure every question. Backed by POST /ocr/jobs/:id/taxonomy.
 */
export const BulkTaxonomyPanel = ({
  jobId,
  totalCount,
  selectedIds,
  pendingIds,
  onApplied,
  assign,
}: {
  /** Single-job target. Omit when `assign` is supplied (multi-file batch). */
  jobId?: string;
  totalCount: number;
  selectedIds: string[];
  pendingIds: string[];
  onApplied: () => void;
  /** Batch override: apply the body across many jobs. When given, used instead
   *  of POST /ocr/jobs/:id/taxonomy so the panel is identical for one or many files. */
  assign?: (body: AssignTaxonomyBody) => Promise<{ updated: number }>;
}) => {
  const [taxonomy, setTaxonomy] = useState<TaxonomySelection>({});
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');

  const hasAnything =
    Boolean(taxonomy.programId || taxonomy.subjectId || taxonomy.topicId || taxonomy.chapterId) ||
    difficulty !== '';

  const body = (draftIds?: string[]): AssignTaxonomyBody => ({
    draftIds,
    programId: taxonomy.programId ?? undefined,
    subjectId: taxonomy.subjectId ?? undefined,
    topicId: taxonomy.topicId ?? undefined,
    chapterId: taxonomy.chapterId ?? undefined,
    difficulty: difficulty || undefined,
  });

  const apply = useMutation({
    mutationFn: (draftIds?: string[]) =>
      assign ? assign(body(draftIds)) : ocrApi.assignTaxonomy(jobId!, body(draftIds)),
    onSuccess: (r) => {
      toast.success(`Taxonomy applied to ${r.updated} question${r.updated === 1 ? '' : 's'}`);
      onApplied();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <div className="rounded border border-border bg-surface p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-text">
        <Layers size={13} className="text-primary" /> Bulk taxonomy
        <span className="font-normal text-text-faint">— set once, apply to many</span>
      </div>

      <CourseSelector value={taxonomy} onChange={setTaxonomy} size="sm" />

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-0.5 block text-[10px] uppercase tracking-[0.4px] text-text-faint">Difficulty</label>
          <Select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}
            className="h-8 text-xs"
          >
            <option value="">— keep —</option>
            <option value="EASY">EASY</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HARD">HARD</option>
          </Select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasAnything || selectedIds.length === 0}
            loading={apply.isPending && apply.variables !== undefined}
            onClick={() => apply.mutate(selectedIds)}
            title={selectedIds.length === 0 ? 'Select drafts first' : `Apply to ${selectedIds.length} selected`}
          >
            Apply to selected ({selectedIds.length})
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!hasAnything || totalCount === 0}
            loading={apply.isPending && apply.variables === pendingIds}
            onClick={() => apply.mutate(pendingIds)}
          >
            Apply to all ({totalCount})
          </Button>
        </div>
      </div>
    </div>
  );
};
