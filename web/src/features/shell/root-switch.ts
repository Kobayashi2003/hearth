import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '@/lib/api';

/** Query families whose keys are paths inside the active root. */
const ROOT_SCOPED = new Set([
  'listing',
  'archive',
  'comic',
  'content',
  'html',
  'office',
  'probe',
  'trash',
]);

/**
 * Switching roots: listings and file contents are keyed by root-relative
 * path, so the old root's would pass for the new one's. They are dropped
 * rather than refetched, and `then` moves to where to be in the new root
 * before anything asks for it again; everything else is refetched.
 */
export function useRootSwitch() {
  const queryClient = useQueryClient();
  return async (id: string, then: () => void) => {
    try {
      queryClient.setQueryData(['roots'], await api.switchRoot(id));
      queryClient.removeQueries({
        predicate: query => ROOT_SCOPED.has(String(query.queryKey[0])),
      });
      then();
      await queryClient.invalidateQueries({
        predicate: query => {
          const family = String(query.queryKey[0]);
          return family !== 'roots' && !ROOT_SCOPED.has(family);
        },
      });
    } catch (error) {
      toast.error('The root could not be switched', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };
}
