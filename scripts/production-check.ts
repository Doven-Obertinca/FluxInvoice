import 'dotenv/config';
import { resolve } from 'node:path';
import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import nodemailer from 'nodemailer';
import { environment, hostedEnvironment } from '@flux/shared';
import { connect, assertVerifiedDatabaseTls } from '@flux/db';
import * as schema from '../packages/db/src/schema';
import { complianceRuntime } from '../packages/application/src/runtime';
import { S3Archive } from '@flux/storage';
import { serializeUbl, toSemantic } from '@flux/einvoice';
import { fixture } from '../packages/einvoice/fixtures/supported';

// Read-only provider checks: never create invoice rows, retained objects or send email.
const worker = process.argv.includes('--worker');
const env = environment(worker ? 'worker' : 'web');
if (!hostedEnvironment(process.env))
  throw Error('Hosted configuration is required');
const { pool } = connect(env.DATABASE_URL);
let check = 'database';
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    assertVerifiedDatabaseTls(client);
    const role = await client.query(
      'SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user',
    );
    if (!role.rows[0] || Object.values(role.rows[0]).some(Boolean))
      throw Error('RESTRICTED_RUNTIME_ROLE_REQUIRED');
    const ownership = await client.query(
      "SELECT count(*)::int AS owned FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)",
    );
    if (ownership.rows[0]?.owned !== 0)
      throw Error('NON_OWNER_RUNTIME_ROLE_REQUIRED');
    check = 'schema';
    const actual = await client.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'",
    );
    const available = new Set(
      actual.rows.map((row) => `${row.table_name}.${row.column_name}`),
    );
    for (const value of Object.values(schema)) {
      if (!is(value, PgTable)) continue;
      const table = getTableConfig(value);
      for (const column of table.columns)
        if (!available.has(`${table.name}.${column.name}`))
          throw Error('MIGRATIONS_OR_GRANTS_REQUIRED');
    }
    await client.query('ROLLBACK');
    console.log('Database TLS, restricted role and schema columns: verified');
  } finally {
    client.release();
  }
  check = 'archive';
  const runtime = complianceRuntime(resolve('.'), worker ? 'worker' : 'web');
  if (!(runtime.archive instanceof S3Archive))
    throw Error('OBJECT_LOCK_REQUIRED');
  await runtime.archive.verifyConfiguration();
  console.log(
    'Archive versioning, Object Lock and KMS configuration: verified',
  );
  check = 'smtp';
  const smtp = new URL(env.SMTP_URL!);
  const transport = nodemailer.createTransport({
    host: smtp.hostname,
    port: Number(smtp.port || 465),
    secure: true,
    auth: {
      user: decodeURIComponent(smtp.username),
      pass: decodeURIComponent(smtp.password),
    },
    connectionTimeout: 15000,
    socketTimeout: 30000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
  console.log('SMTP TLS/authentication: verified (no email sent)');
  if (worker) {
    check = 'validator';
    const result = await runtime.validator.validate(
      serializeUbl(toSemantic(fixture, 'PREFLIGHT-ONLY')),
    );
    if (!result.valid || !/^[a-f0-9]{64}$/.test(result.reportHash))
      throw Error('VALIDATOR_HEALTH_FAILED');
    console.log(
      'Pinned KoSIT validator: verified using an in-memory fixture (no issued invoice)',
    );
  }
  console.log(
    'Connectivity checks passed; retention enforcement, restore tests and live auth flows still require separate verification.',
  );
} catch {
  // Provider exceptions can contain connection URLs; never print them.
  console.error(
    `Production preflight failed at ${check}; check configuration, grants and provider status. Credential values suppressed.`,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
