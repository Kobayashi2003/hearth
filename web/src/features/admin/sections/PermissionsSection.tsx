import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PermissionAction, PermissionRule } from '@hearth/shared';

import { Button } from '@/components/ui/Button';
import { Input, Select, Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';

const ACTIONS: PermissionAction[] = ['read', 'write', 'delete', 'admin'];

const EMPTY_RULE: PermissionRule = {
  username: '*',
  path: '/**',
  permissions: ['read'],
  effect: 'allow',
};

/**
 * Path-scoped rules, edited as a list and saved as a whole. Rules are ranked by
 * how specifically their path matches, then user-specific over wildcard, then
 * deny over allow — so a narrow deny beats a broad allow.
 */
export function PermissionsSection() {
  const queryClient = useQueryClient();
  const stored = useQuery({ queryKey: ['permission-rules'], queryFn: () => api.permissionRules() });
  const [rules, setRules] = useState<PermissionRule[]>([]);

  useEffect(() => {
    if (stored.data) setRules(stored.data.rules);
  }, [stored.data]);

  const save = useMutation({
    mutationFn: () => api.savePermissionRules(rules),
    onSuccess: () => {
      toast.success('Permission rules saved');
      void queryClient.invalidateQueries({ queryKey: ['permission-rules'] });
    },
    onError: (error: Error) => toast.error('Could not save', { description: error.message }),
  });

  const patch = (index: number, changes: Partial<PermissionRule>) =>
    setRules(current => current.map((rule, i) => (i === index ? { ...rule, ...changes } : rule)));

  if (stored.isPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        With no rules, each user&apos;s own permissions apply everywhere. A rule narrows that
        for a path. Use <code className="font-mono text-xs">*</code> for every user, and
        <code className="mx-1 font-mono text-xs">/photos/**</code> for a folder and everything under it.
      </p>

      {rules.length === 0 ? (
        <p className="rounded-md border border-dashed border-subtle px-3 py-6 text-center text-sm text-muted">
          No rules yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule, index) => (
            <li key={index} className="rounded-md border border-subtle p-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 text-xs text-secondary">
                  User
                  <Input
                    value={rule.username}
                    onChange={event => patch(index, { username: event.target.value })}
                    className="mt-1"
                  />
                </label>

                <label className="flex-[2] text-xs text-secondary">
                  Path
                  <Input
                    value={rule.path}
                    onChange={event => patch(index, { path: event.target.value })}
                    className="mt-1 font-mono"
                  />
                </label>

                <label className="text-xs text-secondary">
                  Effect
                  <Select
                    value={rule.effect}
                    onChange={event =>
                      patch(index, { effect: event.target.value as PermissionRule['effect'] })
                    }
                    className="mt-1 block"
                  >
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </Select>
                </label>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRules(current => current.filter((_, i) => i !== index))}
                  aria-label="Remove this rule"
                  className="text-[var(--color-danger)]"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-2 flex flex-wrap gap-3">
                {ACTIONS.map(action => (
                  <label key={action} className="flex items-center gap-1.5 text-xs text-secondary">
                    <input
                      type="checkbox"
                      checked={rule.permissions.includes(action)}
                      onChange={event =>
                        patch(index, {
                          permissions: event.target.checked
                            ? [...rule.permissions, action]
                            : rule.permissions.filter(candidate => candidate !== action),
                        })
                      }
                      className="accent-[var(--accent)]"
                    />
                    {action}
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Button onClick={() => setRules(current => [...current, { ...EMPTY_RULE }])}>
          <Plus className="h-4 w-4" /> Add rule
        </Button>
        <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          Save rules
        </Button>
      </div>
    </div>
  );
}
