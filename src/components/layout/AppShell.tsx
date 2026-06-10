import { Outlet } from 'react-router-dom';
import { TopBar } from '@/components/shell/TopBar';
import { BreadcrumbStrip } from '@/components/shell/BreadcrumbStrip';
import { PageHeaderProvider } from '@/lib/page-header/page-header-context';
import { useThemeStore } from '@/lib/theme/theme-store';
import unitedLogo from '@/assets/United.png';

/**
 * ERP shell: 64px top bar + 64px breadcrumb strip + scrollable body.
 * Locked layout per project_product_identity.md (2026-05-27).
 */
export const AppShell = () => {
  const theme = useThemeStore((s) => s.theme);

  return (
    <PageHeaderProvider>
      <div className="flex min-h-screen flex-col bg-app text-text">
      <TopBar />
      {/* Structural placement for breadcrumb strip */}
      <BreadcrumbStrip />
      {/* Increased top and bottom padding for a beautiful, spacious layout */}
      <main className="flex-1 px-6 pt-6 pb-8">
        <Outlet />
      </main>
      {/* <footer className=" mt-auto border-t border-border-soft flex flex-row items-center justify-center gap-3 bg-subtle/30">
        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mt-0.5">
          Developed and Maintained by
        </span>
          <img 
            src={unitedLogo} 
            alt="United Nexa Tech Logo" 
            className="h-20 md:h-18 w-auto object-contain transition-all duration-300 pointer-events-none" 
            style={{ filter: theme === 'dark' ? 'brightness(0) invert(1)' : 'brightness(0)' }}
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
          />
        </footer> */}
      </div>
    </PageHeaderProvider>
  );
};
