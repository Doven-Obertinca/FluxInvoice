import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { Client, Pool } from 'pg';
import { expect, it } from 'vitest';
import { dropTestDatabase } from './database-cleanup';

it('waits for a closing database client without forcibly terminating it', async () => {
  const adminUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://flux:flux@localhost:5432/postgres';
  const admin = new Pool({ connectionString: adminUrl });
  const name = `flux_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(adminUrl);
  url.pathname = '/' + name;
  const client = new Client({ connectionString: url.toString() });
  const errors: Error[] = [];
  client.on('error', (error) => errors.push(error));
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    await client.connect();
    await expect(admin.query(`DROP DATABASE "${name}"`)).rejects.toMatchObject({
      code: '55006',
    });
    const close = setTimeout(200).then(() => client.end());
    await Promise.all([dropTestDatabase(admin, name), close]);
    expect(errors).toEqual([]);
    const remaining = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );
    expect(remaining.rowCount).toBe(0);
    await expect(dropTestDatabase(admin, 'fluxinvoice')).rejects.toThrow(
      'non-test database',
    );
  } finally {
    await client.end();
    await dropTestDatabase(admin, name);
    await admin.end();
  }
});
