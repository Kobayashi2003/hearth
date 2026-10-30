import { useState, type FormEvent } from 'react';

import { LogoMark } from '@/brand/Logo';
import { ApiError, isUnreachable } from '@/lib/api';
import { Button } from '@/ui/Button';
import { Spinner } from '@/ui/Feedback';
import { CredentialFields } from './CredentialFields';
import { useSession } from './session';

export function LoginPage() {
  const { signIn, adminOnly, unreachable, retry } = useSession();
  // Set when signing in found no server, even if the check on load had found one.
  const [lostServer, setLostServer] = useState(false);
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
      setLostServer(false);
    } catch (caught) {
      if (isUnreachable(caught)) setLostServer(true);
      else setError(caught instanceof ApiError ? caught.message : 'Signing in failed.');
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

        {unreachable || lostServer ? (
          <ServerUnreachable
            onRetry={() => {
              setLostServer(false);
              retry();
            }}
          />
        ) : null}

        <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
          <CredentialFields
            purpose="sign-in"
            username={username}
            password={password}
            onUsername={setUsername}
            onPassword={setPassword}
          />

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
            {isSubmitting ? <Spinner className="size-4" immediate /> : 'Sign in'}
          </Button>
          {adminOnly ? (
            <p className="text-[12.5px] text-ink-3">Only administrators can sign in right now.</p>
          ) : null}
        </form>
      </div>
    </main>
  );
}

/**
 * The page came up but the server behind it did not answer. Only that is said:
 * how Hearth is run (its scripts, ports and prefixes) is for whoever runs it,
 * in the docs, not for anyone who reaches the sign-in page.
 */
function ServerUnreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="mt-6 rounded-xl border border-line bg-surface p-4 text-[13px]">
      <p className="font-semibold text-danger">Hearth is not reachable right now</p>
      <p className="mt-1 text-ink-2">Try again in a moment.</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-3">
        Try again
      </Button>
    </div>
  );
}
