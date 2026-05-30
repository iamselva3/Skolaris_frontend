import type { Role } from '../types';

export const isAdmin = (role: Role | undefined): boolean =>
  role === 'SUPER_ADMIN' || role === 'TEACHER';

export const isStudent = (role: Role | undefined): boolean => role === 'STUDENT';

export const isSuperAdmin = (role: Role | undefined): boolean => role === 'SUPER_ADMIN';

export const homePathFor = (_role: Role): string => '/dashboard';
