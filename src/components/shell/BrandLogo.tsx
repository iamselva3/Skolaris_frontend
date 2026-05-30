import { Link } from 'react-router-dom';
import logoImg from '@/assets/Sk Learnings.png';

/**
 * Brand Logo component rendering the premium official The SK Learnings image logo.
 * Click → /.
 */
export const BrandLogo = () => (
  <Link
    to="/"
    aria-label="The SK Learnings home"
    className="flex items-center justify-center overflow-hidden"
    style={{ height: '36px' }}
  >
    <img 
      src={logoImg} 
      alt="The SK Learnings"
      className="h-full object-contain" 
      style={{ maxHeight: '36px' }}
    />
  </Link>
);

