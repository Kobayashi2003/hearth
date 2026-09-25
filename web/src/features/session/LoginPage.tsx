import { useState, type FormEvent } from 'react';

import { LogoMark } from '@/brand/Logo';
import { ApiError } from '@/lib/api';
import { Button } from '@/ui/Button';
import { Field, Input } from '@/ui/Field';
import { Spinner } from '@/ui/Feedback';
import { useSession } from './session';

export function LoginPage() {
  const { signIn, adminOnly } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The server did not answer. Check that Hearth is running.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-5">
      <div className="w-full max-w-[22rem]">
        <LogoMark className="size-12" />
        <h1 className="display-title mt-6 text-[56px]">hearth</h1>
        <p className="mt-2 text-ink-2">Your files, at home. Sign in to reach them.</p>

        <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
          <Field label="Username">
            <Input
              value={username}
              onChange={event => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          {error ? (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            className="mt-2 h-10 justify-center"
          >
            {isSubmitting ? <Spinner className="size-4" /> : 'Sign in'}
          </Button>
          {adminOnly ? (
            <p className="text-[12.5px] text-ink-3">Only administrators can sign in right now.</p>
          ) : null}
        </form>
      </div>
    </main>
  );
}
