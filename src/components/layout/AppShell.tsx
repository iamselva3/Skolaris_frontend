import { Outlet } from 'react-router-dom';
import { TopBar } from '@/components/shell/TopBar';
import { BreadcrumbStrip } from '@/components/shell/BreadcrumbStrip';
import { PageHeaderProvider } from '@/lib/page-header/page-header-context';

/**
 * ERP shell: 64px top bar + 64px breadcrumb strip + scrollable body.
 * Locked layout per project_product_identity.md (2026-05-27).
 */
export const AppShell = () => (
  <PageHeaderProvider>
    <div className="flex min-h-screen flex-col bg-app text-text">
      <TopBar />
      {/* Structural margin to make some space below the nav header TopBar */}
      <div className="mt-1">
        <BreadcrumbStrip />
      </div>
      {/* Increased top and bottom padding for a beautiful, spacious layout */}
      <main className="flex-1 px-6 pt-6 pb-8">
        <Outlet />
      </main>
    </div>
  </PageHeaderProvider>
);
