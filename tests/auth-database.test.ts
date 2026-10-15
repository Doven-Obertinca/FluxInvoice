import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { expect, it, vi } from 'vitest';
import { connect } from '@flux/db';
import * as schema from '../packages/db/src/schema';
import { authenticationEmailGuard } from '../packages/auth/src/email-policy';
import { dropTestDatabase } from './database-cleanup';

it('creates user and credential account before sending verification with the migrated PostgreSQL schema', async () => {
  const adminUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://flux:flux@127.0.0.1:5432/postgres';
  const admin = new Pool({ connectionString: adminUrl });
  const name = `flux_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(adminUrl);
  url.pathname = '/' + name;
  const { db, pool } = connect(url.toString());
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    await migrate(db, { migrationsFolder: 'packages/db/migrations' });
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('ERECHNO_BETA_MODE', 'true');
    vi.stubEnv('SMTP_URL', 'smtps://fixture:fixture@smtp.provider.dev:465');
    vi.stubEnv('MAIL_FROM', 'mail@erechno.de');
    const send = vi.fn(async ({ url }: { url: string }) => {
      expect(await db.select().from(schema.user)).toHaveLength(1);
      expect(await db.select().from(schema.account)).toHaveLength(1);
      expect(new URL(url).origin).toBe('https://erechno.de');
      expect(new URL(url).searchParams.get('callbackURL')).toBe('/onboarding');
    });
    const auth = betterAuth({
      baseURL: 'https://erechno.de',
      secret: 'unit-fixture-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      database: drizzleAdapter(db, { provider: 'pg', schema }),
      trustedOrigins: ['https://erechno.de'],
      hooks: { before: authenticationEmailGuard },
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 12,
        requireEmailVerification: true,
      },
      emailVerification: { sendOnSignUp: true, sendVerificationEmail: send },
      rateLimit: { enabled: true, storage: 'database', window: 60, max: 3 },
    });
    const response = await auth.handler(
      new Request('https://erechno.de/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://erechno.de',
          'x-forwarded-for': '192.0.2.1',
        },
        body: JSON.stringify({
          name: 'Fixture',
          email: 'fixture@example.test',
          password: 'unit-password-12345',
          callbackURL: '/onboarding',
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect((await db.select().from(schema.user))[0]!.emailVerified).toBe(false);
    expect(await db.select().from(schema.session)).toHaveLength(0);
    expect(await db.select().from(schema.rateLimit)).toHaveLength(1);
  } finally {
    vi.unstubAllEnvs();
    await pool.end();
    await dropTestDatabase(admin, name);
    await admin.end();
  }
});
