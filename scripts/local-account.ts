import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { connect, user, account } from '@flux/db';
import { environment } from '@flux/shared';

const env = environment();
const databaseUrl = new URL(env.DATABASE_URL);
if (
  env.APP_ENV !== 'development' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(
    new URL(env.BETTER_AUTH_URL).hostname,
  )
)
  throw new Error('Local test accounts require development and loopback URLs');

const email = 'test@fluxinvoice.test';
const credentialsPath = '.local/test-login.json';
await mkdir('.local', { recursive: true });
let credentials: { email: string; password: string };
try {
  credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
  if (credentials.email !== email || typeof credentials.password !== 'string')
    throw new Error('Invalid local credentials file');
} catch (error) {
  if (
    !(error instanceof Error) ||
    !('code' in error) ||
    error.code !== 'ENOENT'
  )
    throw error;
  credentials = { email, password: `Flux-${randomUUID()}` };
  await writeFile(
    credentialsPath,
    JSON.stringify(credentials, null, 2) + '\n',
    {
      mode: 0o600,
      flag: 'wx',
    },
  );
}
const { db, pool } = connect(env.DATABASE_URL);
try {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(user)
      .where(eq(user.email, email));
    if (existing) {
      const [login] = await tx
        .select()
        .from(account)
        .where(
          and(
            eq(account.userId, existing.id),
            eq(account.providerId, 'credential'),
          ),
        );
      if (
        !login?.password ||
        !(await verifyPassword({
          hash: login.password,
          password: credentials.password,
        }))
      )
        throw new Error(
          'Existing account has different credentials; it was not changed',
        );
      if (!existing.emailVerified)
        throw new Error('Existing account is unverified; it was not changed');
      return;
    }
    const id = randomUUID();
    await tx
      .insert(user)
      .values({ id, email, name: 'Local Tester', emailVerified: true });
    await tx.insert(account).values({
      id: randomUUID(),
      userId: id,
      accountId: id,
      providerId: 'credential',
      password: await hashPassword(credentials.password),
    });
  });
  console.log(`Local login ready: ${email}\nCredentials: ${credentialsPath}`);
} finally {
  await pool.end();
}
