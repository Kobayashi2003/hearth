import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Spinner, StatusPanel, Toggle } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { formatSize, formatWhen } from '@/lib/format';
import { useSession } from '@/features/auth/SessionProvider';

/** The recycle-bin browser: restore, purge one, or empty it. */
export function TrashSection() {
  const { can } = useSession();
  const queryClient = useQueryClient();

  const settings = useQuery({ queryKey: ['trash-settings'], queryFn: () => api.trashSettings() });
  const contents = useQuery({ queryKey: ['trash'], queryFn: () => api.trash(), enabled: can('delete') });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['trash'] });
    void queryClient.invalidateQueries({ queryKey: ['listing'] });
  };

  const restore = useMutation({
    mutationFn: (id: string) => api.restoreFromTrash([id]),
    onSuccess: () => {
      toast.success('Restored');
      invalidate();
    },
    onError: (error: Error) => toast.error('Could not restore', { description: error.message }),
  });

  const purge = useMutation({
    mutationFn: (id: string) => api.purgeFromTrash(id),
    onSuccess: () => {
      toast.success('Deleted permanently');
      invalidate();
    },
  });

  const empty = useMutation({
    mutationFn: () => api.emptyTrash(),
    onSuccess: result => {
      toast.success(`Emptied — ${result.removed} item(s) removed`);
      invalidate();
    },
  });

  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) => api.setTrashEnabled(enabled),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['trash-settings'] }),
  });

  return (
    <div className="space-y-4">
      {can('admin') && settings.data ? (
        <Toggle
          checked={settings.data.enabled}
          onChange={enabled => setEnabled.mutate(enabled)}
          label="Use the recycle bin"
          description={
            settings.data.enabled
              ? `Deleted items are kept for ${settings.data.retentionDays} days, up to ${settings.data.maxSizeMB} MB.`
              : 'Deleted items are removed immediately and cannot be recovered.'
          }
        />
      ) : null}

      {!can('delete') ? (
        <p className="text-sm text-muted">You do not have permission to view the recycle bin.</p>
      ) : contents.isPending ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (contents.data?.items.length ?? 0) === 0 ? (
        <StatusPanel
          icon={<Trash2 className="h-8 w-8" />}
          title="The recycle bin is empty"
          description="Deleted files will appear here."
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">
              {contents.data!.items.length} item(s) ·{' '}
              <span className="tabular">{formatSize(contents.data!.totalSize)}</span>
            </p>
            <Button variant="danger" size="sm" onClick={() => empty.mutate()}>
              Empty bin
            </Button>
          </div>

          <ul className="divide-y divide-subtle rounded-md border border-subtle">
            {contents.data!.items.map(item => (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-primary">{item.name}</p>
                  <p className="truncate font-mono text-[0.6875rem] text-muted">
                    {item.originalPath} · {formatWhen(item.deletedAt)}
                  </p>
                </div>
                <span className="tabular hidden text-xs text-muted sm:block">
                  {formatSize(item.size)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => restore.mutate(item.id)}
                  aria-label={`Restore ${item.name}`}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => purge.mutate(item.id)}
                  aria-label={`Permanently delete ${item.name}`}
                  className="text-[var(--color-danger)]"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
