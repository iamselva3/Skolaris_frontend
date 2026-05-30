import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { ListChecks, Bell, Zap } from 'lucide-react';

export const QuickActionsPage = () => {
  return (
    <>
      <PageHeader title="Quick Actions" description="Fast access to common tasks." />

      <section className="mt-4 rounded-md border border-border bg-surface">
        <header className="flex h-12 items-center justify-between border-b border-border-soft px-4">
          <span className="flex items-center gap-2 text-base font-semibold text-text">
            <Zap size={18} className="text-primary" aria-hidden /> Actions
          </span>
        </header>
        <div className="flex flex-col items-start gap-4 p-6">
          <Link to="/me/results" className="w-full sm:w-auto">
            <Button variant="secondary" className="w-full justify-start">
              <ListChecks size={18} className="mr-2" /> All my results
            </Button>
          </Link>
          <Link to="/notifications" className="w-full sm:w-auto">
            <Button variant="ghost" className="w-full justify-start">
              <Bell size={18} className="mr-2" /> Notifications
            </Button>
          </Link>
        </div>
      </section>
    </>
  );
};
