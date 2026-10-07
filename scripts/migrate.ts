import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { connect } from '@flux/db';
const { db, pool } = connect(
  process.env.DATABASE_URL ??
    'postgresql://flux:flux@localhost:5432/fluxinvoice',
);
try {
  await migrate(db, { migrationsFolder: 'packages/db/migrations' });
} finally {
  await pool.end();
}
