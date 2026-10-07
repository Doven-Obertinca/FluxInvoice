import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
const pg = new EmbeddedPostgres({
  databaseDir: '.local/postgres',
  user: 'flux',
  password: 'flux',
  port: 5432,
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1'],
});
if (!existsSync('.local/postgres/PG_VERSION')) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const result = await client.query(
  "SELECT 1 FROM pg_database WHERE datname='fluxinvoice'",
);
await client.end();
if (!result.rowCount) await pg.createDatabase('fluxinvoice');
console.log('Local PostgreSQL ready on 127.0.0.1:5432');
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
await new Promise(() => {});
