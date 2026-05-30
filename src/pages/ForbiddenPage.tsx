import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';

export const ForbiddenPage = () => (
  <>
    <PageHeader title="Forbidden" description="You don't have access to this page." />
    <Link to="/">
      <Button variant="primary">Go home</Button>
    </Link>
  </>
);
