import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { PermissionAction } from '@hearth/shared';

import { Button } from '@/components/ui/Button';
import { Field, Input, Spinner, Toggle } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useSession } from '@/features/auth/SessionProvider';

const ACTION_CHARS: Array<{ action: PermissionAction; char: string; label: string }> = [
  { action: 'read', char: 'r', label: 'Read' },
  { action: 'write', char: 'w', label: 'Write' },
  { action: 'delete', char: 'd', label: 'Delete' },
  { action: 'admin', char: 'a', label: 'Administer' },
];

export function UsersSection() {
  const queryClient = useQueryClient();
  const { identity } = useSession();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.users() });

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [permissions, setPermissions] = useState('r');

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['users'] });

  const create = useMutation({
    mutationFn: () => api.createUser({ username, password, permissions }),
    onSuccess: () => {
      toast.success(`Created ${username}`);
      setUsername('');
      setPassword('');
      invalidate();
    },
    onError: (error: Error) => toast.error('Could not create the user', { description: error.message }),
  });

  const remove = useMutation({
    mutationFn: (name: string) => api.deleteUser(name),
    onSuccess: () => {
      toast.success('User removed');
      invalidate();
    },
    onError: (error: Error) => toast.error('Could not remove the user', { description: error.message }),
  });

  const updatePermissions = useMutation({
    mutationFn: ({ name, next }: { name: string; next: string }) =>
      api.updateUser(name, { permissions: next }),
    onSuccess: () => {
      toast.success('Permissions updated — that user has been signed out');
      invalidate();
    },
    onError: (error: Error) => toast.error('Could not update', { description: error.message }),
  });

  if (users.isPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ul className="divide-y divide-subtle rounded-md border border-subtle">
        {users.data?.users.map(user => {
          // Users declared in the environment are read-only here.
          const isFromEnvironment = user.createdAt === undefined;
          return (
            <li key={user.username} className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm font-medium text-primary">
                  {user.username}
                  {user.username === identity?.username ? (
                    <span className="ml-2 text-xs font-normal text-muted">you</span>
                  ) : null}
                </span>
                {isFromEnvironment ? (
                  <span className="eyebrow">From environment</span>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove.mutate(user.username)}
                    disabled={user.username === identity?.username}
                    aria-label={`Remove ${user.username}`}
                    className="text-[--color-danger]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="mt-1.5 flex flex-wrap gap-3">
                {ACTION_CHARS.map(({ char, label }) => (
                  <label key={char} className="flex items-center gap-1.5 text-xs text-secondary">
                    <input
                      type="checkbox"
                      checked={user.permissions.includes(char)}
                      disabled={isFromEnvironment}
                      onChange={event => {
                        const next = event.target.checked
                          ? user.permissions + char
                          : user.permissions.replace(char, '');
                        updatePermissions.mutate({ name: user.username, next });
                      }}
                      className="accent-[var(--accent)]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <section className="rounded-md border border-subtle p-3">
        <h3 className="eyebrow mb-3">Add a user</h3>
        <div className="space-y-3">
          <Field label="Username">
            <Input value={username} onChange={event => setUsername(event.target.value)} autoComplete="off" />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Permissions">
            <div className="flex flex-wrap gap-3">
              {ACTION_CHARS.map(({ char, label }) => (
                <label key={char} className="flex items-center gap-1.5 text-xs text-secondary">
                  <input
                    type="checkbox"
                    checked={permissions.includes(char)}
                    onChange={event =>
                      setPermissions(current =>
                        event.target.checked ? current + char : current.replace(char, ''),
                      )
                    }
                    className="accent-[var(--accent)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>

          <Button
            variant="primary"
            onClick={() => create.mutate()}
            disabled={!username || !password || create.isPending}
          >
            <UserPlus className="h-4 w-4" /> Add user
          </Button>
        </div>
      </section>

      <LockdownToggle />
    </div>
  );
}

function LockdownToggle() {
  const queryClient = useQueryClient();
  const lockdown = useQuery({ queryKey: ['lockdown'], queryFn: () => api.lockdown() });

  const setLockdown = useMutation({
    mutationFn: (adminOnly: boolean) => api.setLockdown(adminOnly),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['lockdown'] }),
  });

  if (!lockdown.data) return null;

  return (
    <Toggle
      checked={lockdown.data.adminOnly}
      onChange={value => setLockdown.mutate(value)}
      label="Administrators only"
      description="Locks the whole server to admin accounts. Everyone else is signed out immediately."
    />
  );
}
