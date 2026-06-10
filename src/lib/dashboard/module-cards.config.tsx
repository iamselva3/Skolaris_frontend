import type { ReactNode } from 'react';
import {
  FcApproval,
  FcCalendar,
  FcClock,
  FcConferenceCall,
  FcGraduationCap,
  FcOnlineSupport,
  FcReadingEbook,
  FcServices,
  FcSettings,
  FcSmartphoneTablet,
  FcTodoList,
  FcUpload,
} from 'react-icons/fc';
import { Bell, Library } from 'lucide-react';
import type { DashboardSummary } from '@/lib/api/dashboard.api';
import type { Role } from '@/lib/types';
import { formatDate } from '@/lib/utils/format';

/* ─────────────────────────────── Types ─────────────────────────────── */

export type MetricTone = 'neutral' | 'positive' | 'attention' | 'critical';

export interface DashboardMetric {
  label: string;
  value: number | string;
  tone: MetricTone;
}

export interface DashboardModuleCard {
  id: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  href: string;
  metrics: (data: any) => DashboardMetric[];
}

/* ─────────────────────────────── Helpers ─────────────────────────────── */

const neutral = (label: string, value: number | string): DashboardMetric => ({ label, value, tone: 'neutral' });
const positive = (label: string, value: number | string): DashboardMetric => ({ label, value, tone: 'positive' });
const attention = (label: string, value: number | string): DashboardMetric => ({ label, value, tone: 'attention' });
const critical = (label: string, value: number | string): DashboardMetric => ({ label, value, tone: 'critical' });

const v = <T, U>(
  data: DashboardSummary | null,
  get: (d: DashboardSummary) => T,
  fallback: U,
): T | U => (data ? get(data) : fallback);

/* ─────────────────────────────── Card sets ─────────────────────────────── */

const TEACHER_CARDS: DashboardModuleCard[] = [
  {
    id: 'students',
    icon: <FcGraduationCap size={56} aria-hidden />,
    title: 'Students',
    subtitle: 'Your assigned students',
    href: '/students',
    metrics: (d) => [
      neutral('total', v(d, (x) => x.students.total, '—')),
      (v(d, (x) => x.students.weakTopicAlerts, 0) > 0 ? attention : positive)(
        'weak-topic alerts',
        v(d, (x) => x.students.weakTopicAlerts, 0),
      ),
    ],
  },
  {
    id: 'question-bank',
    icon: <Library size={56} className="text-primary" strokeWidth={1.5} aria-hidden />,
    title: 'Question Library',
    subtitle: 'Inventory + add new',
    href: '/questions',
    metrics: (d) => [
      neutral('approved', v(d, (x) => x.questionBank.totalApproved, '—')),
      (v(d, (x) => x.questionBank.draftsPending, 0) > 0 ? attention : positive)(
        'drafts pending',
        v(d, (x) => x.questionBank.draftsPending, 0),
      ),
    ],
  },
  {
    id: 'uploads',
    icon: <FcUpload size={56} aria-hidden />,
    title: 'Bulk Upload Questions',
    subtitle: 'OCR pipeline',
    href: '/uploads',
    metrics: (d) => [
      neutral('today', v(d, (x) => x.uploads.uploadedToday, '—')),
      (v(d, (x) => x.uploads.reviewQueueCount, 0) > 0 ? critical : positive)(
        'review queue',
        v(d, (x) => x.uploads.reviewQueueCount, 0),
      ),
    ],
  },
  {
    id: 'create-exam',
    icon: <FcTodoList size={56} aria-hidden />,
    title: 'Create Exam',
    subtitle: 'Compose new assessment',
    href: '/exams/new',
    metrics: (d) => [
      neutral('drafts', v(d, (x) => x.createExam.drafts, '—')),
      neutral(
        'last published',
        d?.createExam.lastPublishedAt ? formatDate(d.createExam.lastPublishedAt) : '—',
      ),
    ],
  },
  {
    id: 'notifications',
    icon: <Bell size={56} className="text-primary" strokeWidth={1.5} aria-hidden />,
    title: 'Notifications',
    subtitle: 'Your alerts',
    href: '/notifications',
    metrics: (d) => [
      (v(d, (x) => x.notifications.unread, 0) > 0 ? critical : positive)(
        'unread',
        v(d, (x) => x.notifications.unread, 0),
      ),
      neutral('today', v(d, (x) => x.notifications.totalToday, '—')),
    ],
  },
];

const SUPER_ADMIN_CARDS: DashboardModuleCard[] = [
  {
    id: 'students',
    icon: <FcGraduationCap size={56} aria-hidden />,
    title: 'Students',
    subtitle: 'Manage enrolled students',
    href: '/students',
    metrics: (d) => [
      neutral('total', v(d, (x) => x.students.total, '—')),
      neutral('new this week', v(d, (x) => x.students.newThisWeek, '—')),
    ],
  },
  {
    id: 'teachers',
    icon: <FcConferenceCall size={56} aria-hidden />,
    title: 'Teachers',
    subtitle: 'Manage teaching staff',
    href: '/teachers',
    metrics: (d) => [
      neutral('total', v(d, (x) => x.teachers.total, '—')),
      positive('active today', v(d, (x) => x.teachers.activeToday, 0)),
    ],
  },
  {
    id: 'classrooms',
    icon: <FcReadingEbook size={56} aria-hidden />,
    title: 'Classrooms',
    subtitle: 'Manage classrooms',
    href: '/classrooms',
    metrics: () => [],
  },
  {
    id: 'question-bank',
    icon: <Library size={56} className="text-primary" strokeWidth={1.5} aria-hidden />,
    title: 'Question Library',
    subtitle: 'Inventory + add new',
    href: '/questions',
    metrics: (d) => [
      neutral('approved', v(d, (x) => x.questionBank.totalApproved, '—')),
      (v(d, (x) => x.questionBank.draftsPending, 0) > 0 ? attention : positive)(
        'drafts pending',
        v(d, (x) => x.questionBank.draftsPending, 0),
      ),
    ],
  },
  {
    id: 'uploads',
    icon: <FcUpload size={56} aria-hidden />,
    title: 'Bulk Upload Questions',
    subtitle: 'OCR pipeline',
    href: '/uploads',
    metrics: (d) => [
      neutral('today', v(d, (x) => x.uploads.uploadedToday, '—')),
      (v(d, (x) => x.uploads.reviewQueueCount, 0) > 0 ? critical : positive)(
        'review queue',
        v(d, (x) => x.uploads.reviewQueueCount, 0),
      ),
    ],
  },

  {
    id: 'create-exam',
    icon: <FcTodoList size={56} aria-hidden />,
    title: 'Create Exam',
    subtitle: 'Compose new assessment',
    href: '/exams/new',
    metrics: (d) => [
      neutral('drafts', v(d, (x) => x.createExam.drafts, '—')),
      neutral(
        'last published',
        d?.createExam.lastPublishedAt ? formatDate(d.createExam.lastPublishedAt) : '—',
      ),
    ],
  },
  {
    id: 'system',
    icon: <FcSettings size={56} aria-hidden />,
    title: 'System',
    subtitle: 'Health, queues, settings',
    href: '/settings',
    metrics: (d) => [
      neutral('OCR queue', v(d, (x) => x.uploads.reviewQueueCount, '—')),
      neutral('drafts pending', v(d, (x) => x.questionBank.draftsPending, '—')),
    ],
  },
];

const STUDENT_CARDS: DashboardModuleCard[] = [
  {
    id: 'live-now',
    icon: <FcClock size={56} aria-hidden />,
    title: 'Live Now',
    subtitle: 'Exams in progress',
    href: '/me/live',
    metrics: (d) => {
      const live = d?.studentExams?.filter((e: any) => e.status === 'IN_PROGRESS').length ?? 0;
      return [(live > 0 ? attention : neutral)('in progress', live)];
    },
  },
  {
    id: 'upcoming',
    icon: <FcCalendar size={56} aria-hidden />,
    title: 'Upcoming',
    subtitle: 'Scheduled exams',
    href: '/me/upcoming',
    metrics: (d) => [
      neutral('not started', d?.studentExams?.filter((e: any) => e.status === 'NOT_STARTED').length ?? '—'),
    ],
  },
  {
    id: 'recent-results',
    icon: <FcApproval size={56} aria-hidden />,
    title: 'Recent Results',
    subtitle: 'Your scores',
    href: '/me/results',
    metrics: (d) => [
      neutral('completed', d?.studentExams?.filter((e: any) => ['SUBMITTED', 'GRADED', 'FLAGGED'].includes(e.status)).length ?? '—'),
    ],
  },
];

/** Role → 3 or 5 cards. Keep dashboard variants explicit so the launcher pattern stays honest. */
export const getModuleCardsForRole = (role: Role): DashboardModuleCard[] => {
  if (role === 'SUPER_ADMIN') return SUPER_ADMIN_CARDS;
  if (role === 'STUDENT') return STUDENT_CARDS;
  return TEACHER_CARDS;
};

// Re-exported so we can ban unused-import warnings if the icon set changes.
export const _ALL_ICONS = [FcServices];
