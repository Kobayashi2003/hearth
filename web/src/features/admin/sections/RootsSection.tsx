import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Check, HardDrive } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * Switching the active root changes what the whole app is looking at, so every
 * cached listing and search is dropped when it happens.
 */
export function RootsSection() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const roots = useQuery({ queryKey: ['roots'], queryFn: () => api.roots() });

  const switchRoot = useMutation({
    mutationFn: (id: string) => api.switchRoot(id),
    onSuccess: async () => {
      // The path in the URL belongs to the root we just left. Keeping it means
      // landing on "that file or folder no longer exists" in a drive where it
      // never existed — so go to the new root's top, and drop the search and any
      // open preview with it.
      await navigate({
        to: '/',
        search: {
          path: '',
          q: '',
          sort: 'name',
          direction: 'asc',
          recursive: false,
          type: undefined,
          preview: undefined,
        },
      });
      toast.success('Root switched');
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error('Could not switch root', { description: error.message }),
  });

  if (roots.isPending) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Hearth serves one root at a time. Roots are configured with
        <code className="mx-1 font-mono text-xs">HEARTH_ROOT_DIRECTORIES</code>.
      </p>

      <ul className="divide-y divide-subtle rounded-md border border-subtle">
        {roots.data?.roots.map(root => (
          <li key={root.id} className="flex items-center gap-3 px-3 py-2.5">
            <HardDrive className={cn('h-4 w-4', root.active ? 'text-accent' : 'text-muted')} />
            <span className="flex-1 truncate text-sm text-primary">{root.label}</span>
            {root.active ? (
              <span className="flex items-center gap-1 text-xs text-accent">
                <Check className="h-3.5 w-3.5" /> Active
              </span>
            ) : (
              <Button size="sm" onClick={() => switchRoot.mutate(root.id)} disabled={switchRoot.isPending}>
                Switch to this
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
