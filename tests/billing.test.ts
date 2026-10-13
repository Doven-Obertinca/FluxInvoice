import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, afterAll, it, expect } from 'vitest';
import * as s from '@flux/db';
import type { Principal } from '@flux/auth';
import { InvoiceService } from '@flux/application';
import {
  BillingService,
  consumeInvoiceUsage,
  reserveInvoiceUsage,
} from '../packages/application/src/billing';
import { EinvoiceService } from '../packages/application/src/einvoice';
import { fixture } from '../packages/einvoice/fixtures/supported';
import { LocalArchive } from '@flux/storage';
import { dropTestDatabase } from './database-cleanup';
const name = `flux_test_${randomUUID().replaceAll('-', '')}`;
const adminUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://flux:flux@localhost:5432/postgres';
const admin = new Pool({ connectionString: adminUrl });
const url = new URL(adminUrl);
url.pathname = '/' + name;
const { db, pool } = s.connect(url.toString());
const invoices = new InvoiceService(db);
const billing = new BillingService(db);
// Deliberately invalid validator: these tests never claim valid fiscal issuance.
const einvoice = new EinvoiceService(
  db,
  pool,
  {
    validate: async () => ({
      valid: false,
      issues: [],
      sha256: '',
      durationMs: 0,
      reportHash: '',
    }),
  },
  new LocalArchive('/tmp/erechno-unused-billing-archive'),
);
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  await migrate(db, { migrationsFolder: 'packages/db/migrations' });
});
afterAll(async () => {
  await pool.end();
  await dropTestDatabase(admin, name);
  await admin.end();
});
async function tenant() {
  const userId = randomUUID();
  await db
    .insert(s.user)
    .values({ id: userId, name: 'Test', email: `${userId}@example.test` });
  const a = fixture.seller;
  const organizationId = await invoices.createOrganization(
    userId,
    {
      name: a.name,
      email: a.email,
      vatId: a.vatId,
      taxNumber: a.taxNumber,
      contactName: a.contactName,
      contactPhone: a.contactPhone,
      iban: a.iban,
      bic: a.bic,
      numberPrefix: 'RE-',
      address: {
        line1: a.line1,
        city: a.city,
        postalCode: a.postalCode,
        country: 'DE',
      },
    },
    randomUUID(),
  );
  const p: Principal = { organizationId, userId, requestId: randomUUID() };
  const b = fixture.buyer;
  const customerId = await invoices.createCustomer(p, {
    name: b.name,
    email: b.email,
    vatId: b.vatId,
    address: {
      line1: b.line1,
      city: b.city,
      postalCode: b.postalCode,
      country: 'DE',
    },
  });
  const draft = () =>
    invoices.saveInvoice(
      p,
      { ...fixture.input, customerId },
      { idempotencyKey: randomUUID() },
    );
  return { p, draft };
}
async function locked(
  p: Principal,
  fn: (tx: s.Transaction) => Promise<unknown>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM organizations WHERE id=${p.organizationId} FOR UPDATE`,
    );
    return fn(tx);
  });
}
it('admits exactly three simultaneous Free finalizations, while unlimited drafts remain free', async () => {
  const { p, draft } = await tenant();
  const ids = await Promise.all(Array.from({ length: 12 }, draft));
  expect((await billing.usage(p)).used).toBe(0);
  const results = await Promise.allSettled(
    ids.map((id) => einvoice.enqueue(p, id, 1, 'FINALIZE', randomUUID())),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
  for (const r of results.filter((r) => r.status === 'rejected'))
    expect(r.reason).toMatchObject({ code: 'RATE_LIMIT' });
  expect(await billing.usage(p)).toMatchObject({
    used: 0,
    reserved: 3,
    limit: 3,
  });
  const [row] = await db
    .select()
    .from(s.invoiceUsage)
    .where(eq(s.invoiceUsage.organizationId, p.organizationId));
  // Repeated clicks with distinct idempotency keys reserve the same invoice once.
  await Promise.all(
    Array.from({ length: 5 }, () =>
      einvoice.enqueue(p, row!.invoiceId, 1, 'FINALIZE', randomUUID()),
    ),
  );
  expect((await billing.usage(p)).reserved).toBe(3);
  const other = await tenant();
  await expect(
    billing.usage({ ...other.p, organizationId: p.organizationId }),
  ).rejects.toMatchObject({ code: 'AUTHORIZATION' });
  await expect(
    einvoice.enqueue(other.p, ids[0]!, 1, 'FINALIZE', randomUUID()),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('failed readiness releases the reservation and retry does not double count', async () => {
  const { p, draft } = await tenant();
  const id = await draft();
  const job = await einvoice.enqueue(p, id, 1, 'FINALIZE', randomUUID());
  await einvoice.process(p.organizationId, job);
  expect(await billing.usage(p)).toMatchObject({ used: 0, reserved: 0 });
  expect((await invoices.invoice(p, id)).invoice.finalizationPending).toBe(
    false,
  );
  await einvoice.enqueue(p, id, 1, 'FINALIZE', randomUUID());
  expect((await billing.usage(p)).reserved).toBe(1);
});
it('paid access expires to Free and cancellation at period end retains paid limits', async () => {
  const { p } = await tenant();
  await db
    .insert(s.subscriptions)
    .values({
      organizationId: p.organizationId,
      plan: 'STARTER',
      status: 'ACTIVE',
      periodStart: new Date(Date.now() - 86400000),
      periodEnd: new Date(Date.now() + 86400000),
      cancelAtPeriodEnd: true,
    });
  expect(await billing.usage(p)).toMatchObject({ plan: 'STARTER', limit: 25 });
  await db
    .update(s.subscriptions)
    .set({
      periodStart: new Date(Date.now() - 172800000),
      periodEnd: new Date(Date.now() - 86400000),
    })
    .where(eq(s.subscriptions.organizationId, p.organizationId));
  expect(await billing.usage(p)).toMatchObject({ plan: 'FREE', limit: 3 });
});
it('rolls old reservations into the issuance month, consumes once and keeps usage immutable', async () => {
  const { p, draft } = await tenant();
  const id = await draft();
  await locked(p, (tx) => reserveInvoiceUsage(tx, p.organizationId, id));
  await db
    .update(s.invoiceUsage)
    .set({ period: '2020-01-01' })
    .where(eq(s.invoiceUsage.invoiceId, id));
  expect((await billing.usage(p)).reserved).toBe(0);
  await locked(p, (tx) => consumeInvoiceUsage(tx, p.organizationId, id));
  await locked(p, (tx) => consumeInvoiceUsage(tx, p.organizationId, id));
  expect(await billing.usage(p)).toMatchObject({ used: 1, reserved: 0 });
  await expect(
    db
      .update(s.invoiceUsage)
      .set({ state: 'RELEASED', consumedAt: null })
      .where(eq(s.invoiceUsage.invoiceId, id)),
  ).rejects.toThrow();
  await expect(
    db.delete(s.invoiceUsage).where(eq(s.invoiceUsage.invoiceId, id)),
  ).rejects.toThrow();
});
it('rolls back quota consumption with a failed transaction', async () => {
  const { p, draft } = await tenant();
  const id = await draft();
  await locked(p, (tx) => reserveInvoiceUsage(tx, p.organizationId, id));
  await expect(
    locked(p, async (tx) => {
      await consumeInvoiceUsage(tx, p.organizationId, id);
      throw new Error('rollback');
    }),
  ).rejects.toThrow('rollback');
  expect(await billing.usage(p)).toMatchObject({ used: 0, reserved: 1 });
});
