import { Link } from 'react-router-dom';
import logoImg from '@/assets/Skolaris.png';

/**
 * Brand Logo component rendering the premium official Skolaris image logo.
 * Click → /.
 */
export const BrandLogo = () => (
  <Link
    to="/"
    aria-label="SKOLARIS home"
    className="flex items-center justify-center overflow-hidden"
    style={{ height: '36px' }}
  >
    <img 
      src={logoImg} 
      alt="SKOLARIS" 
      className="h-full object-contain" 
      style={{ maxHeight: '36px' }}
    />
  </Link>
);

