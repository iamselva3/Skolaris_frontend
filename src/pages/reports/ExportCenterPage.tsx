import { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Download } from 'lucide-react';
import { reportsApi } from '@/lib/api/reports.api';
import { apiErrorMessage } from '@/lib/api/client';
import { exportCsv, exportPdf, type ExportColumn } from '@/lib/reports/export';
import { durationText, filterSubtitle } from '@/lib/reports/format';
import { usePageHeader } from '@/lib/page-header/use-page-header';
import { ReportFilterBar, type ReportFilterValue } from '@/components/reports/ReportFilterBar';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

type Fmt = 'csv' | 'pdf';
type Kind = 'exams' | 'students' | 'topics' | 'questions' | 'classes' | 'weak-topics';

const CATALOG: Array<{ key: Kind; title: string; description: string }> = [
  { key: 'exams', title: 'Exam reports', description: 'Participation, completion & scores per exam' },
  { key: 'students', title: 'Student performance', description: 'Per-student scoring, accuracy & weak load' },
  { key: 'classes', title: 'Batch / class performance', description: 'Classroom participation & average score' },
  { key: 'topics', title: 'Topic-wise analysis', description: 'Cohort performance by subject & topic' },
  { key: 'questions', title: 'Question-wise analytics', description: 'Difficulty, accuracy & timing per question' },
  { key: 'weak-topics', title: 'Weak topic detection', description: 'Topics with the most underperformance' },
];

export const ExportCenterPage = () => {
  usePageHeader({
    title: 'Export center',
    breadcrumb: [{ label: 'Reports', to: '/reports' }, { label: 'Export center' }],
    description: 'Download any report as CSV or PDF with the filters below applied',
  });

  const [filter, setFilter] = useState<ReportFilterValue>({});
  const [busy, setBusy] = useState<string | null>(null);

  const base = {
    dateFrom: filter.dateFrom,
    dateTo: filter.dateTo,
    branchId: filter.branchId,
    limit: 1000,
  };
  const subtitle = filterSubtitle(filter);

  const emit = <T,>(fmt: Fmt, name: string, title: string, columns: ExportColumn<T>[], rows: T[]) => {
    if (rows.length === 0) {
      toast.message('Nothing to export', { description: 'No rows for the current filters.' });
      return;
    }
    if (fmt === 'csv') exportCsv(name, columns, rows);
    else void exportPdf(name, { title, subtitle, columns, rows });
  };

  const run = async (key: Kind, fmt: Fmt) => {
    setBusy(`${key}-${fmt}`);
    try {
      switch (key) {
        case 'exams': {
          const r = await reportsApi.exams(base);
          emit<(typeof r.data)[number]>(fmt, 'exam-reports', 'Exam reports', [
            { header: 'Exam', value: (x) => x.title },
            { header: 'Program', value: (x) => x.program ?? '' },
            { header: 'Subject', value: (x) => x.subject ?? '' },
            { header: 'Status', value: (x) => x.status },
            { header: 'Attempts', value: (x) => x.attemptCount },
            { header: 'Submitted', value: (x) => x.submittedCount },
            { header: 'Completion %', value: (x) => x.completionPercent },
            { header: 'Avg score %', value: (x) => x.avgScorePercent },
            { header: 'Avg time', value: (x) => durationText(x.avgTimeSeconds) },
          ], r.data);
          break;
        }
        case 'students': {
          const r = await reportsApi.students(base);
          emit<(typeof r.data)[number]>(fmt, 'student-reports', 'Student performance reports', [
            { header: 'Student', value: (x) => x.name },
            { header: 'Class', value: (x) => x.classLabel ?? '' },
            { header: 'Attempts', value: (x) => x.attemptsTotal },
            { header: 'Avg score %', value: (x) => x.avgScorePercent },
            { header: 'Accuracy %', value: (x) => x.accuracyPercent },
            { header: 'Weak topics', value: (x) => x.weakTopicCount },
          ], r.data);
          break;
        }
        case 'classes': {
          const r = await reportsApi.classes(base);
          emit<(typeof r.data)[number]>(fmt, 'class-performance', 'Batch / class performance', [
            { header: 'Class', value: (x) => x.name },
            { header: 'Section', value: (x) => x.section ?? '' },
            { header: 'Students', value: (x) => x.studentCount },
            { header: 'Exams assigned', value: (x) => x.examsAssigned },
            { header: 'Completion %', value: (x) => x.completionPercent },
            { header: 'Avg score %', value: (x) => x.avgScorePercent },
          ], r.data);
          break;
        }
        case 'topics': {
          const r = await reportsApi.topics(base);
          emit<(typeof r.data)[number]>(fmt, 'topic-analysis', 'Topic-wise analysis', [
            { header: 'Subject', value: (x) => x.subject },
            { header: 'Topic', value: (x) => x.topic },
            { header: 'Students', value: (x) => x.studentsAssessed },
            { header: 'Avg score %', value: (x) => x.avgScorePercent },
            { header: 'Accuracy %', value: (x) => x.accuracyPercent },
            { header: 'Weak share %', value: (x) => x.weakSharePercent },
          ], r.data);
          break;
        }
        case 'questions': {
          const r = await reportsApi.questions(base);
          emit<(typeof r.data)[number]>(fmt, 'question-analytics', 'Question-wise analytics', [
            { header: 'Question', value: (x) => x.stem || x.questionId.slice(0, 8) },
            { header: 'Subject', value: (x) => x.subject ?? '' },
            { header: 'Topic', value: (x) => x.topic ?? '' },
            { header: 'Attempts', value: (x) => x.totalAttempts },
            { header: 'Correct %', value: (x) => x.correctPercent },
            { header: 'Avg time', value: (x) => durationText(x.avgTimeSeconds) },
            { header: 'Flag', value: (x) => x.flag },
          ], r.data);
          break;
        }
        case 'weak-topics': {
          const r = await reportsApi.weakTopics(base);
          emit<(typeof r.data)[number]>(fmt, 'weak-topics', 'Weak topic detection', [
            { header: 'Subject', value: (x) => x.subject },
            { header: 'Topic', value: (x) => x.topic },
            { header: 'Weak students', value: (x) => x.weakStudents },
            { header: 'Weak share %', value: (x) => x.weakSharePercent },
            { header: 'Avg score %', value: (x) => x.avgScorePercent },
          ], r.data);
          break;
        }
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ReportFilterBar value={filter} onChange={setFilter} fields={['date', 'branch']} />

      <Card>
        <CardHeader>Available reports</CardHeader>
        <CardBody className="flex flex-col divide-y divide-border-soft p-0">
          {CATALOG.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">{c.title}</p>
                <p className="text-xs text-text-muted">{c.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === `${c.key}-csv`}
                  onClick={() => run(c.key, 'csv')}
                >
                  <FileText size={12} /> CSV
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === `${c.key}-pdf`}
                  onClick={() => run(c.key, 'pdf')}
                >
                  <Download size={12} /> PDF
                </Button>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
};
