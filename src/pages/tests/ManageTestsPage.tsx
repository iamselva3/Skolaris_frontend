import { usePageHeader } from '@/lib/page-header/use-page-header';

/**
 * Phase 2A stub. The richer Manage Tests workspace (4 KPIs, Test Configuration
 * sub-row, Subject Weightage counts, Test Validity, Management Tools drawer,
 * Create-Test-from-Paper flow) lands in Phase 2C.
 *
 * Until then, the existing Exams list at /exams remains the working test
 * management surface — link to it directly.
 */
export const ManageTestsPage = () => {
  usePageHeader({
    title: 'Manage Tests',
    description: 'Operational workspace for scheduled, live, and closed tests.',
    breadcrumb: [{ label: 'Workspace' }, { label: 'Test Management' }, { label: 'Manage Tests' }],
  });

  return (
    <div className="rounded-md border border-border bg-surface p-6">
      <div className="text-sm text-text-muted">
        <p className="mb-2 text-base font-medium text-text">Coming soon</p>
        <p>
          The rich Manage Tests workspace will surface Test Configuration, Subject Weightage, Test
          Validity, and printing/cloning tools — and will let you publish a completed question
          paper as a test in one step.
        </p>
        <p className="mt-3">
          Until it ships, the existing{' '}
          <a className="text-primary hover:underline" href="/exams">
            Exams list
          </a>{' '}
          remains the operational surface for scheduled and live tests.
        </p>
      </div>
    </div>
  );
};
