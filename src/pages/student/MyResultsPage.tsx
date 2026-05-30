import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { attemptsApi, type MyExamItem } from '@/lib/api/attempts.api';
import { analyticsApi } from '@/lib/api/analytics.api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table } from '@/components/ui/Table';
import { formatDateTime } from '@/lib/utils/format';

export const MyResultsPage = () => {
  const list = useQuery({ queryKey: ['me', 'exams'], queryFn: attemptsApi.listMyExams });
  const weak = useQuery({ queryKey: ['me', 'weak'], queryFn: analyticsApi.myWeakTopics });

  const completed = (list.data ?? []).filter(
    (e) => e.status === 'GRADED' || e.status === 'FLAGGED' || e.status === 'SUBMITTED',
  );

  const columns: ColumnDef<MyExamItem>[] = [
    { header: 'Exam', accessorKey: 'examTitle' },
    { header: 'Status', cell: (c) => <StatusBadge value={c.row.original.status} /> },
    { header: 'Score', cell: (c) => c.row.original.score ?? '—' },
    { header: 'Submitted', cell: (c) => formatDateTime(c.row.original.submittedAt) },
    {
      header: '',
      id: 'action',
      cell: (c) => (
        <Link to={`/me/attempts/${c.row.original.attemptId}/result`}>
          <Button size="sm">View →</Button>
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="My results" description="Past attempts and weak topics" />
      <Card>
        <CardHeader>Results</CardHeader>
        <CardBody>
          <Table columns={columns} data={completed} empty={<>You have no completed exams yet.</>} />
        </CardBody>
      </Card>

      <div className="mt-4">
        <Card>
          <CardHeader>Topics to revisit</CardHeader>
          <CardBody>
            {weak.data && weak.data.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-[13px]">
                {weak.data.map((t) => (
                  <li key={`${t.subject}-${t.topic}`}>{t.recommendation}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-text-muted">
                Weak topics appear after you complete graded exams.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
};
