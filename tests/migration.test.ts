import { dropTestDatabase } from './database-cleanup';
import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { connect } from '@flux/db';
it('upgrades populated Phase 1 without rewriting invoices or migration history', async () => {
  const adminUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://flux:flux@localhost:5432/postgres';
  const admin = new Pool({ connectionString: adminUrl });
  const name = `flux_upgrade_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(adminUrl);
  url.pathname = '/' + name;
  const { db, pool } = connect(url.toString());
  const directory = await mkdtemp(join(tmpdir(), 'flux-phase1-migrations-'));
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    await mkdir(join(directory, 'meta'));
    const journal = JSON.parse(
      await readFile('packages/db/migrations/meta/_journal.json', 'utf8'),
    ) as { entries: { tag: string; idx: number }[] };
    journal.entries = journal.entries.filter((e) => e.idx < 4);
    await writeFile(
      join(directory, 'meta/_journal.json'),
      JSON.stringify(journal),
    );
    for (const entry of journal.entries)
      await copyFile(
        `packages/db/migrations/${entry.tag}.sql`,
        join(directory, `${entry.tag}.sql`),
      );
    await migrate(db, { migrationsFolder: directory });
    const org = randomUUID(),
      customer = randomUUID(),
      invoice = randomUUID();
    await pool.query(
      `INSERT INTO organizations(id,name,email,line1,city,postal_code,country,vat_id,tax_number,iban,bic,number_prefix) VALUES($1,'Legacy company','legacy@example.test','Musterweg 1','Berlin','10115','DE','DE123456789','','DE89370400440532013000','COBADEFFXXX','RE-')`,
      [org],
    );
    await pool.query(
      `INSERT INTO customers(id,organization_id,name,email,vat_id) VALUES($1,$2,'Legacy buyer','buyer@example.test','')`,
      [customer, org],
    );
    await pool.query(
      `INSERT INTO invoices(id,organization_id,customer_id,issue_date,due_date,service_date,currency,buyer_reference,notes,net,tax,payable) VALUES($1,$2,$3,'2026-10-06','2026-10-20','2026-10-06','EUR','REF','Retain this meaning',100,19,119)`,
      [invoice, org, customer],
    );
    const original = (
      await pool.query('SELECT * FROM invoices WHERE id=$1', [invoice])
    ).rows[0];
    const before = (
      await pool.query(
        'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id',
      )
    ).rows;
    await migrate(db, { migrationsFolder: 'packages/db/migrations' });
    const upgraded = (
      await pool.query('SELECT * FROM invoices WHERE id=$1', [invoice])
    ).rows[0];
    expect(upgraded).toMatchObject(original);
    expect(upgraded.finalization_pending).toBe(false);
    expect(upgraded.finalized_at).toBeNull();
    const after = (
      await pool.query(
        'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id',
      )
    ).rows;
    expect(after.slice(0, 4)).toEqual(before);
    expect(after.length).toBeGreaterThanOrEqual(6);
    await expect(
      pool.query("UPDATE invoices SET status='FINALIZED' WHERE id=$1", [
        invoice,
      ]),
    ).rejects.toThrow();
  } finally {
    await pool.end();
    await dropTestDatabase(admin, name);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  }
});
