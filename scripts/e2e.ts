import { resolve, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { connect } from '@flux/db';
const adminUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://flux:flux@127.0.0.1:5432/postgres';
const admin = new Pool({ connectionString: adminUrl });
const name = `flux_e2e_${randomUUID().replaceAll('-', '')}`;
const url = new URL(adminUrl);
url.pathname = '/' + name;
const archive = await mkdtemp(join(tmpdir(), 'flux-e2e-archive-'));
let worker: ReturnType<typeof spawn> | undefined;
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  const { db, pool } = connect(url.toString());
  try {
    await migrate(db, { migrationsFolder: 'packages/db/migrations' });
  } finally {
    await pool.end();
  }
  const env = {
    ...process.env,
    APP_ENV: 'test',
    SMTP_URL: process.env.SMTP_URL ?? 'smtp://127.0.0.1:1025',
    DATABASE_URL: url.toString(),
    BETTER_AUTH_URL: 'http://127.0.0.1:3100',
    BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
    COMPLIANCE_HOME: resolve('.local/compliance'),
    ARCHIVE_LOCAL_DIR: archive,
  };
  worker = spawn(process.execPath, ['--import', 'tsx', 'scripts/worker.ts'], {
    stdio: 'inherit',
    env,
  });
  const child = spawn('playwright', ['test'], { stdio: 'inherit', env });
  process.exitCode = await new Promise<number>((resolve) =>
    child.on('exit', (code) => resolve(code ?? 1)),
  );
} finally {
  if (worker && worker.exitCode === null) {
    worker.kill('SIGTERM');
    await new Promise<void>((done) => worker!.once('exit', () => done()));
  }
  await rm(archive, { recursive: true, force: true });
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}
