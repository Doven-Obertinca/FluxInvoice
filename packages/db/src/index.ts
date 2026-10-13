import { Pool, type PoolClient } from 'pg';
import { TLSSocket } from 'node:tls';
import { hostedEnvironment, productionDatabase } from '@flux/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
export * from './schema';
export function connect(url: string) {
  const hosted = hostedEnvironment(process.env);
  if (hosted) productionDatabase(url);
  const pool = new Pool({
    connectionString: url,
    max: hosted ? 2 : 10,
    allowExitOnIdle: true,
    maxLifetimeSeconds: 300,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  return { pool, db: drizzle(pool, { schema }) };
}
export type Database = ReturnType<typeof connect>['db'];
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

// A pooler/proxy may terminate TLS before PostgreSQL: pg_stat_ssl describes
// that internal hop. Verify the actual client socket and trusted certificate.
export function assertVerifiedDatabaseTls(client: PoolClient) {
  const stream = (client as unknown as { connection: { stream: unknown } })
    .connection.stream;
  if (!(stream instanceof TLSSocket) || !stream.encrypted || !stream.authorized)
    throw new Error('DATABASE_VERIFIED_TLS_REQUIRED');
}
