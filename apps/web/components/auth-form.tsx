'use client';
import { createAuthClient } from 'better-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from './ui/button';
import { Field } from './forms';
const client = createAuthClient();
export function AuthForm({
  mode,
  token,
  afterSignIn = '/dashboard',
}: {
  mode: 'sign-in' | 'sign-up' | 'forgot' | 'reset';
  token?: string;
  afterSignIn?: '/dashboard' | '/billing';
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  return (
    <form
      className="auth-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setMessage('');
        const data = new FormData(e.currentTarget);
        const email = String(data.get('email'));
        const password = String(data.get('password'));
        try {
          const result =
            mode === 'sign-up'
              ? await client.signUp.email({
                  name: String(data.get('name')),
                  email,
                  password,
                  callbackURL: '/onboarding',
                })
              : mode === 'sign-in'
                ? await client.signIn.email({ email, password })
                : mode === 'forgot'
                  ? await client.requestPasswordReset({
                      email,
                      redirectTo: '/reset-password',
                    })
                  : await client.resetPassword({
                      newPassword: password,
                      token: token ?? '',
                    });
          if (result.error)
            setMessage(
              result.error.status === 503
                ? 'Der E-Mail-Versand ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.'
                : 'Die Anfrage konnte nicht abgeschlossen werden. Prüfen Sie Ihre Angaben und gegebenenfalls die E-Mail-Bestätigung.',
            );
          else if (mode === 'sign-in') {
            router.push(afterSignIn);
            router.refresh();
          } else if (mode === 'sign-up')
            setMessage(
              'Bitte bestätigen Sie Ihre E-Mail-Adresse über den zugesandten Link.',
            );
          else if (mode === 'forgot')
            setMessage(
              'Falls ein Konto existiert, erhalten Sie eine E-Mail zum Zurücksetzen.',
            );
          else {
            router.push('/sign-in');
          }
        } catch {
          setMessage('Verbindung fehlgeschlagen. Bitte erneut versuchen.');
        } finally {
          setPending(false);
        }
      }}
    >
      {mode === 'sign-up' && <Field label="Ihr Name" name="name" />}
      {mode !== 'reset' && <Field label="E-Mail" name="email" type="email" />}
      {mode !== 'forgot' && (
        <div className="field">
          <label htmlFor="password">Passwort</label>
          <input
            id="password"
            aria-describedby="password-help"
            name="password"
            type="password"
            required
            minLength={12}
            autoComplete={
              mode === 'sign-in' ? 'current-password' : 'new-password'
            }
          />
          <small id="password-help">Mindestens 12 Zeichen</small>
        </div>
      )}
      <div aria-live="polite">
        {message && <p className="notice">{message}</p>}
      </div>
      <Button disabled={pending}>
        {pending
          ? 'Einen Moment …'
          : mode === 'sign-in'
            ? 'Anmelden'
            : mode === 'sign-up'
              ? 'Konto erstellen'
              : mode === 'forgot'
                ? 'Link anfordern'
                : 'Passwort speichern'}
      </Button>
      <p className="muted">
        {mode === 'sign-in' ? (
          <>
            <Link href="/sign-up">Konto erstellen</Link> ·{' '}
            <Link href="/forgot-password">Passwort vergessen?</Link>
          </>
        ) : (
          <Link href="/sign-in">Zur Anmeldung</Link>
        )}
      </p>
    </form>
  );
}
export function SignOut() {
  const router = useRouter();
  return (
    <button
      className="button button-ghost"
      onClick={async () => {
        await client.signOut();
        router.push('/sign-in');
        router.refresh();
      }}
    >
      Abmelden
    </button>
  );
}
