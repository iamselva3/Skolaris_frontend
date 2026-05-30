import { useCurrentUser } from './use-current-user';
import { useBranchStore } from '../store/branch.store';

/**
 * Returns the effective branch ID to be used for filtering.
 * - SUPER_ADMIN: returns the globally selected branch from the topbar (or null for all)
 * - TEACHER: returns their assigned branchId
 * - STUDENT: returns null (students are tenant-scoped in this context, or their branch is handled server-side)
 */
export const useActiveBranch = () => {
  const { user } = useCurrentUser();
  const { activeBranchId } = useBranchStore();

  if (!user) return null;
  if (user.role === 'SUPER_ADMIN') return activeBranchId;
  if (user.role === 'TEACHER') return user.branchId;
  return null;
};
