import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
import { Pool, escapeLiteral } from 'pg';
import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../packages/db/src/schema';
import { productionDatabase } from '@flux/shared';
import { assertVerifiedDatabaseTls } from '@flux/db';
import journal from '../packages/db/migrations/meta/_journal.json';

const run = promisify(execFile);
const project = 'erechno';
const scope = 'doven-obertincas-projects';
// Compute IDs verified in the provider console for the two named ERechno projects.
const expectedEndpoints: Record<'production' | 'preview', string> = {
  production: 'ep-orange-shape-b9inke27',
  preview: 'ep-flat-snow-ballpprp',
};
const root = resolve(import.meta.dirname, '..');
const inputPath = resolve(root, '.local/erechno-database-provisioning.env');
const targets = process.argv.includes('--production')
  ? (['production'] as const)
  : process.argv.includes('--preview')
    ? (['preview'] as const)
    : (['production', 'preview'] as const);
let stage = 'protected credential input';
async function api(path: string, body?: unknown) {
  const args = ['api', path, '--scope', scope, '--raw'];
  if (body !== undefined) args.push('-X', 'POST', '--input', '-');
  return new Promise<unknown>((resolveResult, reject) => {
    const child = execFile(
      'vercel',
      args,
      { cwd: root, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return reject(Error('VERCEL_API_FAILED'));
        try {
          resolveResult(JSON.parse(stdout));
        } catch {
          reject(Error('VERCEL_RESPONSE_FAILED'));
        }
      },
    );
    if (body !== undefined) child.stdin?.end(JSON.stringify(body));
  });
}
try {
  const info = await stat(inputPath);
  if ((info.mode & 0o077) !== 0) throw Error('INPUT_MUST_BE_MODE_0600');
  const inputs = parse(await readFile(inputPath));
  const urls = Object.fromEntries(
    ['production', 'preview'].map((target) => {
      const key = `ERECHNO_${target.toUpperCase()}_ADMIN_URL`;
      const u = new URL(inputs[key] ?? '');
      if (!u.hostname.endsWith('.neon.tech') || u.hostname.includes('-pooler'))
        throw Error('DIRECT_NEON_URL_REQUIRED');
      u.searchParams.set('sslmode', 'verify-full');
      productionDatabase(u.toString(), key);
      return [target, u];
    }),
  ) as Record<'production' | 'preview', URL>;
  for (const target of ['production', 'preview'] as const) {
    if (urls[target].hostname.split('.')[0] !== expectedEndpoints[target])
      throw Error('ERECHNO_PROJECT_IDENTITY_MISMATCH');
    if (urls[target].pathname !== '/neondb')
      throw Error('UNEXPECTED_DATABASE_NAME');
  }
  if (urls.production.hostname === urls.preview.hostname)
    throw Error('ISOLATED_NEON_PROJECTS_REQUIRED');
  stage = 'Vercel project verification';
  const p = (await api(`/v9/projects/${project}`)) as {
    id: string;
    name: string;
  };
  if (p.name !== project) throw Error('WRONG_PROJECT');
  const deployments = (await api(
    `/v6/deployments?projectId=${encodeURIComponent(p.id)}&limit=1`,
  )) as { deployments: unknown[] };
  if (deployments.deployments.length)
    throw Error('REFUSES_ALREADY_DEPLOYED_PROJECT');
  for (const target of targets) {
    const direct = urls[target];
    const pool = new Pool({
      connectionString: direct.toString(),
      max: 1,
      connectionTimeoutMillis: 15000,
    });
    try {
      stage = `${target}: database identity/TLS`;
      const directClient = await pool.connect();
      try {
        assertVerifiedDatabaseTls(directClient);
      } finally {
        directClient.release();
      }
      const role = await pool.query(
        "SELECT 1 FROM pg_roles WHERE rolname='flux_runtime'",
      );
      if (role.rowCount) throw Error('EXISTING_RUNTIME_ROLE_REQUIRES_REVIEW');
      const existing = await pool.query(
        "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
      );
      if (existing.rows[0]?.count) {
        const history = await pool.query(
          'SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations',
        );
        if (history.rows[0]?.count !== journal.entries.length)
          throw Error('UNEXPECTED_NONEMPTY_DATABASE');
      }
      console.log(
        `${target}: named-project identity, isolated endpoint and direct TLS verified.`,
      );
      stage = `${target}: explicit db:migrate`;
      await run('npm', ['run', 'db:migrate'], {
        cwd: root,
        env: {
          ...process.env,
          APP_ENV: target === 'production' ? 'production' : 'staging',
          DATABASE_URL: direct.toString(),
        },
        maxBuffer: 4 * 1024 * 1024,
      });
      const history = await pool.query(
        'SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations',
      );
      if (history.rows[0]?.count !== journal.entries.length)
        throw Error('MIGRATION_COUNT_MISMATCH');
      const actual = await pool.query(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'",
      );
      const columns = new Set(
        actual.rows.map((r) => `${r.table_name}.${r.column_name}`),
      );
      for (const value of Object.values(schema)) {
        if (!is(value, PgTable)) continue;
        const table = getTableConfig(value);
        for (const column of table.columns)
          if (!columns.has(`${table.name}.${column.name}`))
            throw Error('SCHEMA_MISMATCH');
      }
      stage = `${target}: restricted runtime grants`;
      const password = randomBytes(48).toString('base64url');
      const pooled = new URL(direct);
      pooled.hostname = direct.hostname.replace(/^([^.]+)\./, '$1-pooler.');
      pooled.username = 'flux_runtime';
      pooled.password = password;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `CREATE ROLE flux_runtime LOGIN PASSWORD ${escapeLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
        );
        await client.query(
          await readFile(resolve(root, 'scripts/runtime-grants.sql'), 'utf8'),
        );
        await client.query(
          `GRANT CONNECT ON DATABASE ${'"' + direct.pathname.slice(1).replaceAll('"', '""') + '"'} TO flux_runtime`,
        );
        stage = `${target}: sensitive Vercel DATABASE_URL`;
        await api(`/v10/projects/${project}/env?upsert=true`, {
          key: 'DATABASE_URL',
          value: pooled.toString(),
          type: 'sensitive',
          target: [target],
        });
        await client.query('COMMIT');
      } catch {
        await client.query('ROLLBACK');
        throw Error('ROLE_OR_ENV_CONFIGURATION_FAILED');
      } finally {
        client.release();
      }
      stage = `${target}: pooled runtime verification`;
      const runtime = new Pool({
        connectionString: pooled.toString(),
        max: 1,
        connectionTimeoutMillis: 15000,
      });
      try {
        const runtimeClient = await runtime.connect();
        try {
          assertVerifiedDatabaseTls(runtimeClient);
        } finally {
          runtimeClient.release();
        }
        const flags = await runtime.query(
          'SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname=current_user',
        );
        const grants = await runtime.query(
          "SELECT has_table_privilege(current_user,'public.audit_events','UPDATE') AS audit_update, has_table_privilege(current_user,'public.invoice_documents','DELETE') AS artifact_delete, has_schema_privilege(current_user,'public','CREATE') AS schema_create",
        );
        if (
          Object.values(flags.rows[0] ?? {}).some(Boolean) ||
          Object.values(grants.rows[0] ?? {}).some(Boolean)
        )
          throw Error('RUNTIME_SECURITY_CHECK_FAILED');
        await runtime.query('SELECT id FROM public.invoices LIMIT 0');
        console.log(
          `${target}: ${journal.entries.length} migrations, schema columns, pooled TLS and restricted runtime permissions verified; sensitive DATABASE_URL saved.`,
        );
      } finally {
        await runtime.end();
      }
    } finally {
      await pool.end();
    }
  }
  console.log(
    'No deployment or paid resource was created. Remove the temporary admin URL input after verification.',
  );
} catch {
  console.error(
    `Database provisioning stopped at ${stage}. Credential values and provider diagnostics suppressed; no destructive database cleanup is performed.`,
  );
  process.exitCode = 1;
}
