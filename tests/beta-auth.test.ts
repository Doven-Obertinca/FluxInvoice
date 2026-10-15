import { afterEach, expect, it, vi } from 'vitest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import {
  authenticationEmailGuard,
  requiresEmailVerification,
} from '../packages/auth/src/email-policy';
afterEach(() => vi.unstubAllEnvs());
it('beta does not bypass verification; missing email rejects signup and recovery with 503', async () => {
  vi.stubEnv('APP_ENV', 'production');
  vi.stubEnv('ERECHNO_BETA_MODE', 'true');
  vi.stubEnv('SMTP_URL', 'smtps://fixture:fixture@smtp.provider.dev:465');
  vi.stubEnv('MAIL_FROM', 'mail@erechno.de');
  const store = {
    user: [] as Record<string, unknown>[],
    session: [],
    account: [],
    verification: [],
  };
  const auth = betterAuth({
    database: memoryAdapter(store),
    baseURL: 'https://erechno.de',
    secret: 'unit-fixture-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    hooks: { before: authenticationEmailGuard },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      requireEmailVerification: requiresEmailVerification(),
    },
    emailVerification: {
      sendOnSignUp: requiresEmailVerification(),
      sendVerificationEmail: vi.fn(async () => {}),
    },
  });
  const email = 'beta-fixture@erechno.de';
  const password = 'unit-password-12345';
  const request = (path: string, body: unknown) =>
    auth.handler(
      new Request(`https://erechno.de/api/auth${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://erechno.de',
        },
        body: JSON.stringify(body),
      }),
    );
  const signup = await request('/sign-up/email', {
    name: 'Fixture',
    email,
    password,
  });
  expect(signup.status).toBe(200);
  expect(signup.headers.get('set-cookie')).toBeNull();
  vi.stubEnv('SMTP_URL', undefined);
  vi.stubEnv('MAIL_FROM', undefined);
  const signin = await request('/sign-in/email', { email, password });
  expect(signin.status).toBe(403);
  expect(signin.headers.get('set-cookie')).toBeNull();
  store.user[0]!.emailVerified = true;
  const verified = await request('/sign-in/email', { email, password });
  expect(verified.status).toBe(200);
  expect(verified.headers.get('set-cookie')).toContain('session_token');
  expect(
    (
      await request('/sign-up/email', {
        name: 'Blocked',
        email: 'blocked@erechno.de',
        password,
      })
    ).status,
  ).toBe(503);
  expect((await request('/request-password-reset', { email })).status).toBe(
    503,
  );
});

it('rejects www signup before user creation or email when auth uses the apex origin; aligned canonical origin succeeds', async () => {
  vi.stubEnv('APP_ENV', 'production');
  vi.stubEnv('ERECHNO_BETA_MODE', 'true');
  vi.stubEnv('SMTP_URL', 'smtps://fixture:fixture@smtp.provider.dev:465');
  vi.stubEnv('MAIL_FROM', 'mail@erechno.de');
  for (const baseURL of ['https://erechno.de', 'https://www.erechno.de']) {
    const store = { user: [], account: [], session: [], verification: [] };
    const send = vi.fn(async () => {});
    const auth = betterAuth({
      baseURL,
      trustedOrigins: [baseURL],
      advanced: { disableOriginCheck: false, disableCSRFCheck: false },
      secret: 'unit-fixture-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      database: memoryAdapter(store),
      hooks: { before: authenticationEmailGuard },
      logger: { disabled: true },
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 12,
        requireEmailVerification: true,
      },
      emailVerification: { sendOnSignUp: true, sendVerificationEmail: send },
    });
    const response = await auth.handler(
      new Request('https://www.erechno.de/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://www.erechno.de',
          'sec-fetch-site': 'same-origin',
          'sec-fetch-mode': 'cors',
        },
        body: JSON.stringify({
          name: 'Fixture',
          email: 'canonical@example.test',
          password: 'unit-password-12345',
          callbackURL: '/onboarding',
        }),
      }),
    );
    if (baseURL === 'https://erechno.de') {
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('INVALID_ORIGIN');
      expect(store.user).toHaveLength(0);
      expect(send).not.toHaveBeenCalled();
    } else {
      expect(response.status).toBe(200);
      expect(store.user).toHaveLength(1);
      expect(send).toHaveBeenCalledOnce();
      expect(response.headers.get('set-cookie')).toBeNull();
    }
  }
});
