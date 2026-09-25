import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Folder, RotateCcw, Trash2 } from 'lucide-react';

import { api } from '@/lib/api';
import { formatSize, formatWhen } from '@/lib/format';
import { useSession } from '@/features/session/session';
import { Button } from '@/ui/Button';
import { SettingRow, Switch } from '@/ui/Field';
import { Spinner } from '@/ui/Feedback';

export function TrashSection() {
  const { can } = useSession();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['trash-settings'], queryFn: () => api.trashSettings() });
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
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.setTrashEnabled(enabled),
    onSuccess: data => queryClient.setQueryData(['trash-settings'], data),
  });

  const items = contents.data?.items ?? [];

  return (
    <div>
      <SettingRow
        title="Use the recycle bin"
        description={
          settings.data
            ? `Deleted items are kept for ${settings.data.retentionDays} days${settings.data.maxSizeMB > 0 ? `, up to ${formatSize(settings.data.maxSizeMB * 1024 * 1024)} in total` : ''}.`
            : undefined
        }
      >
        <Switch
          checked={settings.data?.enabled ?? false}
          onChange={value => toggle.mutate(value)}
          label="Use the recycle bin"
          disabled={!can('admin')}
        />
      </SettingRow>

      {can('delete') ? (
        <>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
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
          {contents.isPending ? <Spinner className="mt-6" /> : null}
          <ul className="mt-2">
            {items.map(item => (
              <li
                key={item.id}
                className="flex items-center gap-3 border-b border-line py-2.5 last:border-0"
              >
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
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
