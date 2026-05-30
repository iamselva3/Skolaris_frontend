import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Download,
  FileBarChart2,
  GraduationCap,
  HelpCircle,
  Layers,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { reportsApi } from '@/lib/api/reports.api';
import { pctText } from '@/lib/reports/format';
import { usePageHeader } from '@/lib/page-header/use-page-header';
import { KpiStrip } from '@/components/reports/KpiStrip';

interface ReportLink {
  to: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  metric?: string;
}

interface ReportGroup {
  header: string;
  links: ReportLink[];
}

export const ReportsLauncherPage = () => {
  usePageHeader({ title: 'Reports', breadcrumb: [{ label: 'Reports' }] });

  const overview = useQuery({
    queryKey: ['reports', 'overview'],
    queryFn: reportsApi.overview,
    staleTime: 60_000,
  });
  const o = overview.data;

  const kpis = o
    ? [
        { label: 'Exams', value: o.totalExams.toLocaleString(), href: '/reports/exams' },
        { label: 'Students', value: o.totalStudents.toLocaleString(), href: '/reports/students' },
        { label: 'Avg score', value: pctText(o.avgScorePercent) },
        { label: 'Avg accuracy', value: pctText(o.avgAccuracyPercent) },
        { label: 'Weak topics', value: o.weakTopicCount.toLocaleString(), href: '/reports/weak-topics' },
      ]
    : undefined;

  const groups: ReportGroup[] = [
    {
      header: 'PERFORMANCE',
      links: [
        {
          to: '/reports/exams',
          title: 'Exam reports',
          subtitle: 'Participation, completion & scores per exam',
          icon: FileBarChart2,
          metric: o ? `${o.liveExams} live · ${o.totalExams} total` : undefined,
        },
        {
          to: '/reports/students',
          title: 'Student performance',
          subtitle: 'Per-student scoring, accuracy & weak load',
          icon: Users,
          metric: o ? `${o.totalStudents} students` : undefined,
        },
        {
          to: '/reports/classes',
          title: 'Batch / class performance',
          subtitle: 'Classroom participation & average score',
          icon: GraduationCap,
          metric: o ? `${o.classCount} classes` : undefined,
        },
      ],
    },
    {
      header: 'CONTENT INSIGHT',
      links: [
        {
          to: '/reports/topics',
          title: 'Topic-wise analysis',
          subtitle: 'Cohort performance by subject & topic',
          icon: Layers,
        },
        {
          to: '/reports/questions',
          title: 'Question-wise analytics',
          subtitle: 'Difficulty, accuracy & timing per question',
          icon: HelpCircle,
          metric: o ? `${o.questionsTracked} tracked` : undefined,
        },
        {
          to: '/reports/weak-topics',
          title: 'Weak topic detection',
          subtitle: 'Topics with the most underperformance',
          icon: AlertTriangle,
          metric: o ? `${o.weakTopicCount} flags` : undefined,
        },
      ],
    },
    {
      header: 'OPERATIONS',
      links: [
        {
          to: '/reports/export',
          title: 'Export center',
          subtitle: 'Download any report as CSV or PDF',
          icon: Download,
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <KpiStrip items={kpis} loading={overview.isLoading} />

      {groups.map((g) => (
        <section key={g.header} className="flex flex-col gap-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.6px] text-text-faint">
            {g.header}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.links.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className="card flex items-start gap-3 p-4 transition-colors hover:border-border-strong hover:bg-hover"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-subtle text-primary">
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-md font-semibold text-text">{l.title}</span>
                    <span className="text-xs text-text-muted">{l.subtitle}</span>
                    {l.metric ? (
                      <span className="mt-1 text-[11px] font-medium text-primary">{l.metric}</span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};
