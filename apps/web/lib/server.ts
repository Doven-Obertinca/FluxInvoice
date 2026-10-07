import { resolve } from 'node:path';
import { EinvoiceService } from '../../../packages/application/src/einvoice';
import { complianceRuntime } from '../../../packages/application/src/runtime';
import { logOperation } from '@flux/observability';
import 'server-only';
import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import nodemailer from 'nodemailer';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq, asc } from 'drizzle-orm';
import { connect, members } from '@flux/db';
import * as schema from '@flux/db';
import { environment } from '@flux/shared';
import { InvoiceService } from '@flux/application';
const env = environment();
const globalDb = globalThis as typeof globalThis & {
  fluxConnection?: ReturnType<typeof connect>;
};
const connection = globalDb.fluxConnection ?? connect(env.DATABASE_URL);
if (env.APP_ENV !== 'production') globalDb.fluxConnection = connection;
export const db = connection.db;
export const service = new InvoiceService(db);
const runtime = complianceRuntime(resolve(process.cwd(), '../..'));
export const einvoice = new EinvoiceService(
  db,
  connection.pool,
  runtime.validator,
  runtime.archive,
);
const transport = env.SMTP_URL
  ? nodemailer.createTransport(env.SMTP_URL)
  : null;
async function send(to: string, subject: string, url: string) {
  if (!transport) throw new Error('MAIL_UNAVAILABLE');
  await transport.sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    text: `${subject}\n\n${url}\n\nFalls Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail.`,
  });
}
export const auth = betterAuth({
  appName: 'FluxInvoice',
  logger: {
    log: (level) =>
      logOperation({
        requestId: randomUUID(),
        operation: 'authentication',
        result: level,
      }),
  },
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  trustedOrigins: [env.BETTER_AUTH_URL],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    requireEmailVerification: env.APP_ENV !== 'test',
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) =>
      send(user.email, 'Passwort zurücksetzen', url),
  },
  emailVerification: {
    sendOnSignUp: env.APP_ENV !== 'test',
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) =>
      send(user.email, 'E-Mail-Adresse bestätigen', url),
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60, max: 3 },
      '/request-password-reset': { window: 60, max: 3 },
    },
  },
  advanced: {
    useSecureCookies: env.BETTER_AUTH_URL.startsWith('https://'),
    defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
  },
  plugins: [nextCookies()],
});
export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/sign-in');
  return session.user;
}
export async function principal() {
  const user = await requireUser();
  const [membership] = await db
    .select()
    .from(members)
    .where(eq(members.userId, user.id))
    .orderBy(asc(members.createdAt), asc(members.id))
    .limit(1);
  if (!membership) redirect('/onboarding');
  return {
    userId: user.id,
    organizationId: membership.organizationId,
    requestId: randomUUID(),
  };
}
