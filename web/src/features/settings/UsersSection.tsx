import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ManagedUser } from '@hearth/shared';

import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useSession } from '@/features/session/session';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, SettingsGroup } from '@/ui/Field';
import { SettingSwitch } from './admin-settings';

const VERBS: ReadonlyArray<[string, string]> = [
  ['r', 'Read'],
  ['w', 'Write'],
  ['d', 'Delete'],
  ['a', 'Admin'],
];

function toggleVerb(permissions: string, verb: string): string {
  const set = new Set(permissions.split(''));
  if (set.has(verb)) set.delete(verb);
  else set.add(verb);
  return VERBS.map(([key]) => key)
    .filter(key => set.has(key))
    .join('');
}

export function UsersSection() {
  const { identity } = useSession();
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.users() });
  const [pending, setPending] = useState<{
    username: string;
    action: 'password' | 'remove';
  } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['users'] });
  const onError = (error: Error) => toast.error(error.message);

  const update = useMutation({
    mutationFn: ({
      username,
      ...body
    }: {
      username: string;
      permissions?: string;
      password?: string;
    }) => api.updateUser(username, body),
    onSuccess: () => refresh(),
    onError,
  });
  const remove = useMutation({
    mutationFn: (username: string) => api.deleteUser(username),
    onSuccess: refresh,
    onError,
  });

  return (
    <div>
      <SettingsGroup title="Sign-in">
        <SettingSwitch
          name="adminOnly"
          title="Administrators only"
          description="Everyone else is signed out and cannot sign in until this is off."
        />
      </SettingsGroup>

      <SettingsGroup title="Accounts">
        {users.data?.users.map(user => (
          <UserRow
            key={user.username}
            user={user}
            isYou={user.username === identity?.username}
            onPermissions={permissions => update.mutate({ username: user.username, permissions })}
            onPassword={() => {
              setNewPassword('');
              setPending({ username: user.username, action: 'password' });
            }}
            onRemove={() => setPending({ username: user.username, action: 'remove' })}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="Add a user">
        <NewUser onCreated={refresh} />
      </SettingsGroup>

      <Dialog
        open={pending?.action === 'password'}
        onOpenChange={open => !open && setPending(null)}
        title={`New password for ${pending?.username ?? ''}`}
        description="They are signed out everywhere and sign in again with this."
      >
        <form
          className="flex flex-col gap-3 pb-4"
          onSubmit={event => {
            event.preventDefault();
            if (!pending || !newPassword) return;
            update.mutate(
              { username: pending.username, password: newPassword },
              { onSuccess: () => toast.success('Password changed') },
            );
            setPending(null);
          }}
        >
          <Input
            type="password"
            value={newPassword}
            onChange={event => setNewPassword(event.target.value)}
            autoFocus
            autoComplete="new-password"
            aria-label="New password"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!newPassword}>
              Change password
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={pending?.action === 'remove'}
        onOpenChange={open => !open && setPending(null)}
        title={`Remove ${pending?.username ?? ''}?`}
        description="Their account and sessions go; their files and folder rules stay."
        footer={
          <>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pending) remove.mutate(pending.username);
                setPending(null);
              }}
            >
              Remove user
            </Button>
          </>
        }
      />
    </div>
  );
}

function NewUser({ onCreated }: { onCreated: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [permissions, setPermissions] = useState('r');
  const create = useMutation({
    mutationFn: () => api.createUser({ username, password, permissions }),
    onSuccess: () => {
      toast.success(`Added ${username}`);
      setUsername('');
      setPassword('');
      setPermissions('r');
      onCreated();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <form onSubmit={submit} className="py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Username">
          <Input
            value={username}
            onChange={event => setUsername(event.target.value)}
            required
            pattern="[A-Za-z0-9._\-]+"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            required
            autoComplete="new-password"
          />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1">
        <VerbChips permissions={permissions} onChange={setPermissions} />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          className="ml-auto"
          disabled={create.isPending}
        >
          Add user
        </Button>
      </div>
    </form>
  );
}

/** One account: its name, what it may do, and (for accounts made here) password and removal. */
function UserRow({
  user,
  isYou,
  onPermissions,
  onPassword,
  onRemove,
}: {
  user: ManagedUser;
  isYou: boolean;
  onPermissions: (permissions: string) => void;
  onPassword: () => void;
  onRemove: () => void;
}) {
  const managed = user.createdAt !== undefined;
  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-[14px] font-medium">
          {user.username}
          {isYou ? <span className="ml-2 text-[12px] font-normal text-ink-3">you</span> : null}
        </p>
        {!managed ? (
          <p className="text-[12px] text-ink-3">Defined in the server’s .env; edit it there.</p>
        ) : null}
      </div>
      <VerbChips permissions={user.permissions} onChange={onPermissions} disabled={!managed} />
      {managed ? (
        <>
          <Button
            size="icon"
            aria-label={`Set a new password for ${user.username}`}
            title="Set a new password"
            onClick={onPassword}
          >
            <KeyRound />
          </Button>
          <Button
            size="icon"
            className="text-danger"
            aria-label={`Remove ${user.username}`}
            disabled={isYou}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </>
      ) : null}
    </div>
  );
}

/** Read, write, delete and admin as toggles over a permission string. */
function VerbChips({
  permissions,
  onChange,
  disabled,
}: {
  permissions: string;
  onChange: (permissions: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1">
      {VERBS.map(([verb, label]) => {
        const on = permissions.includes(verb);
        return (
          <button
            key={verb}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(toggleVerb(permissions, verb))}
            className={cn(
              'h-7 rounded-full border px-2.5 text-[12px] disabled:opacity-60',
              on ? 'border-glaze bg-glaze-wash text-glaze-strong' : 'border-line text-ink-3',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
