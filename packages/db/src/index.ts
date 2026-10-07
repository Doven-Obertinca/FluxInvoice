import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
export * from './schema';
export function connect(url: string) {
  const pool = new Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  return { pool, db: drizzle(pool, { schema }) };
}
export type Database = ReturnType<typeof connect>['db'];
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
