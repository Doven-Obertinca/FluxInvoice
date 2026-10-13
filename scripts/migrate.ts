import 'dotenv/config';
import { databaseUrl } from '@flux/shared';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { connect } from '@flux/db';
const { pool } = connect(databaseUrl());
const client = await pool.connect();
try {
  const db = drizzle(client);
  await db.execute(sql`SELECT pg_advisory_lock(741902813)`);
  await migrate(db, { migrationsFolder: 'packages/db/migrations' });
} finally {
  try {
    await client.query('SELECT pg_advisory_unlock(741902813)');
  } finally {
    client.release();
    await pool.end();
  }
}
