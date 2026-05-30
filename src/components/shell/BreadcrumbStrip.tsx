import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useReadPageHeader } from '@/lib/page-header/use-page-header';

/**
 * 64px row directly under TopBar. Reads {title, breadcrumb, actions} from the
 * page-header context populated by routed pages via `usePageHeader(...)`.
 * Sticky so the page identity stays visible while body scrolls.
 */
export const BreadcrumbStrip = () => {
  const { title, breadcrumb, actions } = useReadPageHeader();

  return (
    <div className="sticky top-topbar z-20 flex h-breadcrumb flex-col justify-center gap-1 border-b border-border-soft bg-surface px-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs leading-none text-text-muted">
        <Link to="/" aria-label="Home" className="inline-flex items-center text-text-faint hover:text-text">
          <Home size={14} />
        </Link>
        {breadcrumb.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <ChevronRight size={12} className="text-text-faint" />
            {c.to && i < breadcrumb.length - 1 ? (
              <Link to={c.to} className="hover:text-text">
                {c.label}
              </Link>
            ) : (
              <span className="text-text">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex items-center justify-between gap-4">
        <h1 className="truncate text-xl font-semibold leading-none text-text">{title}</h1>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
};
