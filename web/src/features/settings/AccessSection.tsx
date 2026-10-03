import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PermissionAction, PermissionRule } from '@hearth/shared';

import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/Button';
import { Field, Input, Select, SettingsGroup } from '@/ui/Field';

const ACTIONS: PermissionAction[] = ['read', 'write', 'delete', 'admin'];

export function AccessSection() {
  const queryClient = useQueryClient();
  const stored = useQuery({ queryKey: ['permission-rules'], queryFn: () => api.permissionRules() });
  const [rules, setRules] = useState<PermissionRule[]>([]);

  useEffect(() => {
    if (stored.data) setRules(stored.data.rules);
  }, [stored.data]);

  const save = useMutation({
    mutationFn: () => api.savePermissionRules(rules),
    onSuccess: data => {
      queryClient.setQueryData(['permission-rules'], data);
      toast.success('Rules saved');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const patch = (index: number, changes: Partial<PermissionRule>) =>
    setRules(current =>
      current.map((rule, position) => (position === index ? { ...rule, ...changes } : rule)),
    );

  const dirty = JSON.stringify(rules) !== JSON.stringify(stored.data?.rules ?? []);

  return (
    <div>
      <SettingsGroup
        title="Folder rules"
        description={
          <>
            Narrow or widen what someone may do below a path. The most specific rule wins; at equal
            specificity a rule for a named user beats <code>*</code>, and deny beats allow.{' '}
            <code>/Photos/**</code> covers everything inside Photos.
          </>
        }
      >
        {rules.length === 0 ? (
          <p className="py-4 text-[13px] text-ink-3">
            No rules: everyone can do what their account allows, everywhere.
          </p>
        ) : null}
        {rules.map((rule, index) => (
          <div key={index} className="flex flex-col gap-2.5 py-3.5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[8rem_1fr_7rem]">
              <Field label="User (* for everyone)">
                <Input
                  value={rule.username}
                  onChange={event => patch(index, { username: event.target.value })}
                  placeholder="*"
                />
              </Field>
              <div className="order-last col-span-2 sm:order-none sm:col-span-1">
                <Field label="Path">
                  <Input
                    value={rule.path}
                    onChange={event => patch(index, { path: event.target.value })}
                    placeholder="/Folder/**"
                  />
                </Field>
              </div>
              <Field label="Effect">
                <Select
                  value={rule.effect}
                  onChange={event =>
                    patch(index, { effect: event.target.value as PermissionRule['effect'] })
                  }
                >
                  <option value="allow">Allow</option>
                  <option value="deny">Deny</option>
                </Select>
              </Field>
            </div>
            <div className="flex items-center gap-1">
              {ACTIONS.map(action => {
                const on = rule.permissions.includes(action);
                return (
                  <button
                    key={action}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      patch(index, {
                        permissions: on
                          ? rule.permissions.filter(item => item !== action)
                          : [...rule.permissions, action],
                      })
                    }
                    className={cn(
                      'h-7 rounded-full border px-2.5 text-[12px] capitalize',
                      on
                        ? 'border-glaze bg-glaze-wash text-glaze-strong'
                        : 'border-line text-ink-3',
                    )}
                  >
                    {action}
                  </button>
                );
              })}
              <Button
                size="icon"
                aria-label="Remove rule"
                className="ml-auto text-danger"
                onClick={() => setRules(rules.filter((_, position) => position !== index))}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </SettingsGroup>
      <div className="-mt-4 flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setRules([
              ...rules,
              { username: '*', path: '/', permissions: ['read'], effect: 'allow' },
            ])
          }
        >
          <Plus /> Add rule
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          Save rules
        </Button>
      </div>
    </div>
  );
}
