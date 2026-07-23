import { useState, type FormEvent } from 'react';

import { HearthMark } from '@/components/brand/HearthMark';
import { Button } from '@/components/ui/Button';
import { Field, Input, Spinner } from '@/components/ui/primitives';
import { ApiError } from '@/lib/api';
import { useSession } from './SessionProvider';

export function LoginScreen({ reason }: { reason?: string }) {
  const { signIn, adminOnly } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not reach the server. Try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-5 py-10">
      <div className="w-full max-w-[21rem]">
        <div className="mb-8 flex flex-col items-center text-center">
          <HearthMark className="h-11 w-11 text-primary" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight lowercase">hearth</h1>
          <p className="mt-1 text-sm text-muted">Your files, at home.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {reason ? (
            <p className="rounded-md border border-subtle bg-sunken px-3 py-2 text-sm text-secondary">
              {reason}
            </p>
          ) : null}

          <Field label="Username">
            <Input
              name="username"
              value={username}
              onChange={event => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </Field>

          <Field label="Password">
            <Input
              name="password"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm text-[--color-danger]">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" disabled={isSubmitting} className="mt-1 h-10">
            {isSubmitting ? <Spinner className="border-t-current" /> : 'Sign in'}
          </Button>

          {adminOnly ? (
            <p className="text-center text-xs text-muted">
              This server is currently limited to administrators.
            </p>
          ) : null}
        </form>
      </div>
    </main>
  );
}
