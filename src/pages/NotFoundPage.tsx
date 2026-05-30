import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export const NotFoundPage = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg text-text">
    <div className="text-lg font-semibold">Page not found</div>
    <Link to="/">
      <Button variant="primary">Go home</Button>
    </Link>
  </div>
);
