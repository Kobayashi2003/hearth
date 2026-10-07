import { Field, Input } from '@/ui/Field';

/**
 * Username and password, for signing in or for a new account. The purpose
 * decides what a password manager offers: the saved password, or a new one.
 */
export function CredentialFields({
  purpose,
  username,
  password,
  onUsername,
  onPassword,
}: {
  purpose: 'sign-in' | 'new-account';
  username: string;
  password: string;
  onUsername: (username: string) => void;
  onPassword: (password: string) => void;
}) {
  const signIn = purpose === 'sign-in';
  return (
    <>
      <Field label="Username">
        <Input
          value={username}
          onChange={event => onUsername(event.target.value)}
          autoComplete={signIn ? 'username' : undefined}
          autoFocus={signIn}
          required
          // A new name must be one the server accepts; an existing one is whatever it is.
          pattern={signIn ? undefined : '[A-Za-z0-9._\\-]+'}
        />
      </Field>
      <Field label="Password">
        <Input
          type="password"
          value={password}
          onChange={event => onPassword(event.target.value)}
          autoComplete={signIn ? 'current-password' : 'new-password'}
          required
        />
      </Field>
    </>
  );
}
