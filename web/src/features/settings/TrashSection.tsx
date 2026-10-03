import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Folder, RotateCcw, Trash2 } from 'lucide-react';
import type { TrashSettings } from '@hearth/shared';

import { api } from '@/lib/api';
import { formatSize, formatWhen } from '@/lib/format';
import { useSession } from '@/features/session/session';
import { Button } from '@/ui/Button';
import { SettingsGroup } from '@/ui/Field';
import { SettingNumber, SettingSwitch } from './admin-settings';
import { Spinner } from '@/ui/Feedback';

export function TrashSection() {
  const { can } = useSession();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ['trash-settings'],
    queryFn: () => api.trashSettings(),
    enabled: can('delete') && !can('admin'),
  });
  const contents = useQuery({
    queryKey: ['trash'],
    queryFn: () => api.trash(),
    enabled: can('delete'),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['trash'] });
    void queryClient.invalidateQueries({ queryKey: ['listing'] });
  };
  const report = (done: string) => ({
    onSuccess: () => {
      toast.success(done);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const restore = useMutation({
    mutationFn: (id: string) => api.restoreFromTrash([id]),
    ...report('Restored'),
  });
  const purge = useMutation({
    mutationFn: (id: string) => api.purgeFromTrash(id),
    ...report('Deleted for good'),
  });
  const empty = useMutation({
    mutationFn: () => api.emptyTrash(),
    ...report('Recycle bin emptied'),
  });

  const items = contents.data?.items ?? [];

  return (
    <div>
      {can('admin') ? (
        <SettingsGroup title="Settings">
          <SettingSwitch
            name="trashEnabled"
            title="Use the recycle bin"
            description="Off, deleting cannot be undone."
          />
          <SettingNumber name="trashRetentionDays" title="Keep deleted items for" />
          <SettingNumber
            name="trashMaxSizeMB"
            title="Largest size of the bin"
            description="Past it the oldest items go first."
          />
        </SettingsGroup>
      ) : null}

      {can('delete') ? (
        <SettingsGroup
          title="In the bin"
          description={!can('admin') && settings.data ? retentionText(settings.data) : undefined}
        >
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-2.5">
            <p className="text-[13px] text-ink-2">
              {items.length === 0
                ? 'Nothing in the bin.'
                : `${items.length} items, ${formatSize(contents.data?.totalSize ?? 0)}`}
            </p>
            {items.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="text-danger"
                onClick={() => empty.mutate()}
                disabled={empty.isPending}
              >
                Empty the bin
              </Button>
            ) : null}
          </div>
          {contents.isPending ? <Spinner className="my-6" /> : null}
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 py-2.5">
              {item.isDirectory ? (
                <Folder className="size-4 text-glaze" />
              ) : (
                <Trash2 className="size-4 text-ink-3" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px]">{item.name}</p>
                <p className="truncate text-[12px] text-ink-3">
                  From /{item.originalPath.split('/').slice(0, -1).join('/')}, deleted{' '}
                  {formatWhen(item.deletedAt)}
                </p>
              </div>
              <Button size="sm" onClick={() => restore.mutate(item.id)} disabled={!can('write')}>
                <RotateCcw /> Restore
              </Button>
              <Button
                size="icon"
                onClick={() => purge.mutate(item.id)}
                aria-label={`Delete ${item.name} for good`}
                className="text-danger"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </SettingsGroup>
      ) : null}
    </div>
  );
}

/** What deleting does, for someone who can delete but not change the settings. */
function retentionText({ enabled, retentionDays }: TrashSettings): string {
  if (!enabled) return 'The recycle bin is off: deleting cannot be undone.';
  return retentionDays > 0
    ? `Deleted items are kept here for ${retentionDays} day${retentionDays === 1 ? '' : 's'}.`
    : 'Deleted items are kept here until the bin is emptied.';
}
