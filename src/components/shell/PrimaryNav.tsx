import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api/dashboard.api';
import { cn } from '@/lib/utils/cn';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { MegaMenu, type MegaMenuColumn } from './MegaMenu';

interface PrimaryTab {
  key: 'home' | 'erp' | 'digital' | 'settings';
  label: string;
  to?: string;
  buildColumns?: (counts: Counts) => MegaMenuColumn[];
}

interface Counts {
  reviewQueue: number;
  draftsPending: number;
  uploadedToday: number;
  liveExams: number;
  weakTopics: number;
}

/**
 * Top-bar primary navigation. Four pill tabs (Home / ERP ▾ / DIGITAL ▾ / Settings).
 * ERP and DIGITAL open 640px mega-menus. Live counts populate from the
 * batched /dashboard/summary endpoint.
 */
export const PrimaryNav = () => {
  const location = useLocation();
  const [openKey, setOpenKey] = useState<PrimaryTab['key'] | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const { user } = useCurrentUser();
  const isStudent = user?.role === 'STUDENT';

  const summary = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: dashboardApi.summary,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: !isStudent && !!user,
  });
  const counts: Counts = {
    reviewQueue: summary.data?.uploads.reviewQueueCount ?? 0,
    draftsPending: summary.data?.questionBank.draftsPending ?? 0,
    uploadedToday: summary.data?.uploads.uploadedToday ?? 0,
    liveExams: summary.data?.exams.liveNow ?? 0,
    weakTopics: summary.data?.students.weakTopicAlerts ?? 0,
  };

  const allTabs: PrimaryTab[] = [
    { key: 'home', label: 'Home', to: '/' },
    {
      key: 'erp',
      label: 'Academics',
      buildColumns: () => [
        {
          header: 'PEOPLE',
          links: [
            { label: 'Students', to: '/students' },
            { label: 'Teachers', to: '/teachers' },
            { label: 'Classrooms', to: '/classrooms' },
            ...(user?.role === 'SUPER_ADMIN' ? [{ label: 'Branches', to: '/branches' }] : []),
          ],
        },
        {
          header: 'CONFIGURATION',
          links: [
            { label: 'Programs & Subjects', to: '/taxonomy' },
            { label: 'Tenant settings', to: '/settings' },
          ],
        },
      ],
    },
    {
      key: 'digital',
      label: 'Workspace',
      buildColumns: (c) => [
        {
          header: 'QUESTION BANK',
          links: [
            { label: 'Uploads', to: '/uploads' },
            { label: 'Review queue', to: '/uploads?status=READY_FOR_REVIEW', count: c.reviewQueue, attention: true },
            { label: 'All questions', to: '/questions' },
            { label: 'Add question', to: '/questions/new' },
          ],
        },
        {
          header: 'ASSESSMENTS',
          links: [
            { label: 'Compose exam', to: '/exams/new' },
            { label: 'Exams', to: '/exams', count: c.liveExams },
            { label: 'Attempts', to: '/attempts' },
            { label: 'Analytics', to: '/analytics' },
          ],
        },
        {
          header: 'REPORTS',
          links: [
            { label: 'Exam reports', to: '/reports/exams' },
            { label: 'Student performance', to: '/reports/students' },
            { label: 'Topic-wise analysis', to: '/reports/topics' },
            { label: 'All reports →', to: '/reports', count: c.weakTopics, attention: true },
          ],
        },
      ],
    },
    { key: 'settings', label: 'Settings', to: '/settings' },
  ];

  const TABS = allTabs.filter(() => {
    if (isStudent) {
      return false; // Hide ALL tabs for students
    }
    return true;
  });

  const onTabClick = (tab: PrimaryTab): void => {
    if (tab.to) return; // Link handles navigation
    if (openKey === tab.key) {
      setOpenKey(null);
      return;
    }
    const el = refs.current[tab.key];
    if (el) {
      const r = el.getBoundingClientRect();
      setAnchor({ left: r.left, top: r.bottom + 12 });
    }
    setOpenKey(tab.key);
  };

  const isActive = (tab: PrimaryTab): boolean => {
    if (tab.key === 'home') return location.pathname === '/' || location.pathname === '/dashboard';
    if (tab.key === 'settings') return location.pathname.startsWith('/settings');
    if (tab.key === 'erp') {
      return ['/students', '/teachers', '/classrooms', '/taxonomy', '/branches'].some((p) =>
        location.pathname.startsWith(p),
      );
    }
    return ['/uploads', '/questions', '/exams', '/attempts', '/analytics', '/reports'].some((p) =>
      location.pathname.startsWith(p),
    );
  };

  const openTab = TABS.find((t) => t.key === openKey);
  const columns = openTab?.buildColumns?.(counts) ?? [];

  return (
    <>
      <nav className="flex items-center gap-4" aria-label="Primary">
        {TABS.map((tab) => {
          const active = isActive(tab);
          const baseCls = cn(
            'inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-base font-medium transition-colors',
            active ? 'bg-hover text-text font-semibold' : 'text-text-muted hover:bg-hover hover:text-text',
          );
          if (tab.to) {
            return (
              <Link key={tab.key} to={tab.to} className={baseCls}>
                {tab.label}
              </Link>
            );
          }
          return (
            <button
              key={tab.key}
              type="button"
              ref={(el) => (refs.current[tab.key] = el)}
              aria-haspopup="menu"
              aria-expanded={openKey === tab.key}
              onClick={() => onTabClick(tab)}
              className={baseCls}
            >
              {tab.label}
              <ChevronDown size={12} />
            </button>
          );
        })}
      </nav>

      <MegaMenu
        open={!!openTab && columns.length > 0}
        columns={columns}
        anchor={anchor}
        onClose={() => setOpenKey(null)}
      />
    </>
  );
};
