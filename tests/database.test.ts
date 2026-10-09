import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, asc, sql } from 'drizzle-orm';
import * as s from '@flux/db';
import { InvoiceService, allocateNumber, toInput } from '@flux/application';
import { verifyChain } from '@flux/audit';
import { processOne } from '../packages/application/src/outbox';
import type { Principal } from '@flux/auth';
import type { InvoiceInput } from '@flux/invoice-core';
const databaseName = `flux_test_${randomUUID().replaceAll('-', '')}`;
const adminUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://flux:flux@localhost:5432/postgres';
const admin = new Pool({ connectionString: adminUrl });
const url = new URL(adminUrl);
url.pathname = '/' + databaseName;
const { db, pool } = s.connect(url.toString());
const service = new InvoiceService(db);
let a: Principal,
  b: Principal,
  viewer: Principal,
  customerId: string,
  invoiceId: string;
const company = {
  name: 'Fiktiv GmbH',
  email: 'company@example.test',
  vatId: 'DE123456789',
  address: {
    line1: 'Musterweg 1',
    postalCode: '10115',
    city: 'Berlin',
    country: 'DE',
  },
  taxNumber: '',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  numberPrefix: 'RE-',
};
const customer = {
  name: 'Kunde Ä & <GmbH>',
  email: 'customer@example.test',
  vatId: '',
  address: company.address,
};
const invoice = (): InvoiceInput => ({
  customerId,
  issueDate: '2026-10-06',
  dueDate: '2026-10-20',
  serviceDate: '2026-10-01',
  currency: 'EUR',
  buyerReference: 'REF',
  notes: '',
  lines: [
    {
      description: 'Beratung',
      quantity: '2.5',
      unitPrice: '100.123456',
      unit: 'HUR',
      vatRate: '19',
      allowance: '0.005',
      charge: '0',
    },
  ],
  adjustments: [],
});
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await migrate(db, { migrationsFolder: 'packages/db/migrations' });
  for (const id of ['alice', 'bob', 'viewer'])
    await db
      .insert(s.user)
      .values({ id, name: id, email: `${id}@example.test` });
  const orgA = await service.createOrganization('alice', company, randomUUID());
  const orgB = await service.createOrganization(
    'bob',
    { ...company, name: 'Other' },
    randomUUID(),
  );
  a = { organizationId: orgA, userId: 'alice', requestId: randomUUID() };
  b = { organizationId: orgB, userId: 'bob', requestId: randomUUID() };
  viewer = { organizationId: orgA, userId: 'viewer', requestId: randomUUID() };
  await db
    .insert(s.members)
    .values({ organizationId: orgA, userId: 'viewer', role: 'VIEWER' });
  customerId = await service.createCustomer(a, customer);
});
afterAll(async () => {
  await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});
describe('PostgreSQL tenant and transaction boundaries', () => {
  it('rejects cross tenant reads, writes and spoofed membership', async () => {
    await expect(service.customer(b, customerId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      service.customer({ ...b, organizationId: a.organizationId }, customerId),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION' });
    await expect(
      service.updateCustomer(b, customerId, customer),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      service.saveInvoice(b, invoice(), { idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      service.createCustomer(viewer, customer),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION' });
  });
  it('searches customer names within the authorized tenant and escapes patterns', async () => {
    expect(await service.listCustomers(a, 1, 'Ä &')).toHaveLength(1);
    expect(await service.listCustomers(b, 1, 'Ä &')).toHaveLength(0);
    expect(await service.listCustomers(a, 1, '%')).toHaveLength(0);
  });
  it('detects persisted amount corruption during validation', async () => {
    const id = await service.saveInvoice(a, invoice(), {
      idempotencyKey: randomUUID(),
    });
    await db
      .update(s.invoices)
      .set({ net: '0', tax: '0', payable: '0' })
      .where(eq(s.invoices.id, id));
    const issues = await service.validateInvoice(a, id, 1);
    expect(issues[0]?.code).toBe('STORED_TOTAL_MISMATCH');
    expect((await service.invoice(a, id)).invoice.status).toBe('DRAFT');
  });
  it('enforces composite tenant foreign keys below the application', async () => {
    await expect(
      db.insert(s.customerAddresses).values({
        organizationId: b.organizationId,
        customerId,
        ...company.address,
      }),
    ).rejects.toThrow();
  });
  it('persists deterministic totals and normalized party snapshots', async () => {
    invoiceId = await service.saveInvoice(a, invoice(), {
      idempotencyKey: randomUUID(),
    });
    const detail = await service.invoice(a, invoiceId);
    expect(detail.invoice.net).toBe('250.30');
    expect(detail.invoice.tax).toBe('47.56');
    expect(detail.parties).toHaveLength(2);
    expect(toInput(detail).lines[0]?.unitPrice).toBe('100.123456');
    await expect(service.invoice(b, invoiceId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  it('deduplicates concurrent retries and detects key reuse', async () => {
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        service.saveInvoice(a, invoice(), { idempotencyKey: key }),
      ),
    );
    expect(new Set(results).size).toBe(1);
    await expect(
      service.saveInvoice(
        a,
        { ...invoice(), notes: 'changed' },
        { idempotencyKey: key },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('rejects mass assigned totals', async () => {
    await expect(
      service.saveInvoice(
        a,
        { ...invoice(), net: '0' },
        { idempotencyKey: randomUUID() },
      ),
    ).rejects.toThrow();
  });
  it('validates the current revision and resets state on edit', async () => {
    expect(await service.validateInvoice(a, invoiceId, 1)).toEqual([]);
    expect((await service.invoice(a, invoiceId)).invoice.status).toBe(
      'VALIDATED',
    );
    await service.saveInvoice(
      a,
      { ...invoice(), notes: 'Revised' },
      { id: invoiceId, revision: 1, idempotencyKey: randomUUID() },
    );
    const detail = await service.invoice(a, invoiceId);
    expect(detail.invoice.status).toBe('DRAFT');
    expect(detail.invoice.revision).toBe(2);
    expect(detail.run).toBeNull();
    await expect(
      service.saveInvoice(a, invoice(), {
        id: invoiceId,
        revision: 1,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      service.validateInvoice(a, invoiceId, 1),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('does not let customer edits mutate saved invoice snapshots', async () => {
    await service.updateCustomer(a, customerId, {
      ...customer,
      name: 'New name',
    });
    expect(
      (await service.invoice(a, invoiceId)).parties.find(
        (p) => p.kind === 'BUYER',
      )?.name,
    ).toBe(customer.name);
  });
  it('blocks unsupported finalization and invoice deletion at the database', async () => {
    await expect(
      db
        .update(s.invoices)
        .set({ status: 'FINALIZED' })
        .where(eq(s.invoices.id, invoiceId)),
    ).rejects.toThrow();
    await expect(
      db.delete(s.invoices).where(eq(s.invoices.id, invoiceId)),
    ).rejects.toThrow();
  });
  it('allocates unique numbers concurrently and rolls back failed allocations', async () => {
    const numbers = await Promise.all(
      Array.from({ length: 30 }, () =>
        db.transaction((tx) => allocateNumber(tx, a.organizationId, 2026)),
      ),
    );
    expect(new Set(numbers).size).toBe(30);
    expect(numbers).toContain('RE-2026-000001');
    await expect(
      db.transaction(async (tx) => {
        await allocateNumber(tx, a.organizationId, 2026);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(
      await db.transaction((tx) => allocateNumber(tx, a.organizationId, 2026)),
    ).toBe('RE-2026-000031');
  });
  it('rolls back business writes if audit persistence fails', async () => {
    const before = await service.listCustomers(a);
    await expect(
      service.createCustomer({ ...a, requestId: 'invalid' }, customer),
    ).rejects.toThrow();
    expect(await service.listCustomers(a)).toHaveLength(before.length);
  });
  it('proves audit chain integrity and detects edits, gaps and truncation', async () => {
    const rows = await db
      .select()
      .from(s.auditEvents)
      .where(eq(s.auditEvents.organizationId, a.organizationId))
      .orderBy(asc(s.auditEvents.sequence));
    expect(verifyChain(rows)).toBe(true);
    const head = rows.at(-1)!.eventHash;
    expect(verifyChain(rows, head)).toBe(true);
    expect(verifyChain(rows.slice(0, -1), head)).toBe(false);
    expect(verifyChain(rows.slice(1))).toBe(false);
    const changed = rows.map((r, i) =>
      i === 0 ? { ...r, eventType: 'tampered' } : r,
    );
    expect(verifyChain(changed)).toBe(false);
    await expect(
      db
        .update(s.auditEvents)
        .set({ eventType: 'tampered' })
        .where(eq(s.auditEvents.id, rows[0]!.id)),
    ).rejects.toThrow();
    await expect(
      db.delete(s.auditEvents).where(eq(s.auditEvents.id, rows[0]!.id)),
    ).rejects.toThrow();
    await expect(db.execute(sql`TRUNCATE audit_events`)).rejects.toThrow();
  });
  it('claims jobs once under concurrency and retries failures', async () => {
    await db.update(s.outbox).set({ status: 'DONE' });
    const [job] = await db
      .insert(s.outbox)
      .values({
        organizationId: a.organizationId,
        eventType: 'test',
        entityId: invoiceId,
        requestId: a.requestId,
      })
      .returning();
    let count = 0;
    await Promise.all(
      Array.from({ length: 5 }, () =>
        processOne(db, {
          test: async () => {
            count++;
          },
        }),
      ),
    );
    expect(count).toBe(1);
    expect(
      (await db.select().from(s.outbox).where(eq(s.outbox.id, job!.id)))[0]
        ?.status,
    ).toBe('DONE');
    const [failed] = await db
      .insert(s.outbox)
      .values({
        organizationId: a.organizationId,
        eventType: 'unknown',
        entityId: invoiceId,
        requestId: a.requestId,
        attempts: 7,
      })
      .returning();
    await processOne(db, {});
    expect(
      await db
        .select()
        .from(s.outbox)
        .where(and(eq(s.outbox.id, failed!.id), eq(s.outbox.status, 'DEAD'))),
    ).toHaveLength(1);
  });
});

describe('workspace discovery and attention', () => {
  it('finds only tenant-owned invoice snapshots and customers with literal search and bounded results', async () => {
    const uniqueCustomer = await service.createCustomer(a, {
      ...customer,
      name: 'Search%_Proof',
      vatId: 'DE987654321',
    });
    const id = await service.saveInvoice(
      a,
      {
        ...invoice(),
        customerId: uniqueCustomer,
        buyerReference: 'PO-NEEDLE-2026',
      },
      { idempotencyKey: randomUUID() },
    );
    for (const query of ['Search%_', 'PO-NEEDLE', 'DE987654321']) {
      expect(
        (await service.searchWorkspace(a, query)).some(
          (r) => r.href === `/invoices/${id}`,
        ),
      ).toBe(true);
      expect(await service.searchWorkspace(b, query)).toEqual([]);
    }
    const detail = await service.invoice(a, id);
    expect(
      (
        await service.searchWorkspace(
          a,
          detail.invoice.payable.replace('.', ','),
        )
      ).some((r) => r.href === `/invoices/${id}`),
    ).toBe(true);
    expect(await service.searchWorkspace(a, "%' OR 1=1 --")).toEqual([]);
    expect(await service.searchWorkspace(a, 'x')).toEqual([]);
    expect((await service.searchWorkspace(viewer, 'Search%_')).length).toBe(2);
    const spoof = { ...b, organizationId: a.organizationId };
    await expect(
      service.searchWorkspace(spoof, 'Search'),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION' });
    await expect(service.attention(spoof)).rejects.toMatchObject({
      code: 'AUTHORIZATION',
    });
    await expect(service.searchWorkspace(a, 'x'.repeat(101))).rejects.toThrow();
    await expect(service.attention(a, 0)).rejects.toThrow();
    // Snapshot search remains stable when mutable customer master data changes.
    await service.updateCustomer(a, uniqueCustomer, {
      ...customer,
      name: 'Renamed customer',
      vatId: '',
    });
    expect(
      (await service.searchWorkspace(a, 'Search%_')).map((r) => r.href),
    ).toEqual([`/invoices/${id}`]);
  });
  it('shows current failures, excludes corrected revisions, and does not mislabel overdue drafts', async () => {
    const input = {
      ...invoice(),
      issueDate: '2025-01-01',
      dueDate: '2025-01-02',
      serviceDate: '2025-01-01',
    };
    const id = await service.saveInvoice(a, input, {
      idempotencyKey: randomUUID(),
    });
    expect((await service.attention(a)).some((r) => r.id === id)).toBe(false);
    const run = {
      organizationId: a.organizationId,
      invoiceId: id,
      revision: 1,
      profile: 'XRECHNUNG',
      rulesetVersion: 'test',
      valid: false,
    };
    await db
      .insert(s.validationRuns)
      .values({ ...run, createdAt: new Date('2026-01-01') });
    expect(
      (await service.attention(viewer)).find((r) => r.id === id)?.reason,
    ).toBe('VALIDATION');
    expect(await service.attention(b)).toEqual([]);
    await db
      .insert(s.validationRuns)
      .values({ ...run, valid: true, createdAt: new Date('2026-01-02') });
    expect((await service.attention(a)).some((r) => r.id === id)).toBe(false);
    await db
      .insert(s.validationRuns)
      .values({ ...run, createdAt: new Date('2026-01-03') });
    expect((await service.attention(a)).find((r) => r.id === id)?.reason).toBe(
      'VALIDATION',
    );
    await service.saveInvoice(a, input, {
      id,
      revision: 1,
      idempotencyKey: randomUUID(),
    });
    expect((await service.attention(a)).some((r) => r.id === id)).toBe(false);
  });
  it('surfaces processing failure but suppresses stale failures during an active retry', async () => {
    const id = await service.saveInvoice(a, invoice(), {
      idempotencyKey: randomUUID(),
    });
    await db.insert(s.validationRuns).values({
      organizationId: a.organizationId,
      invoiceId: id,
      revision: 1,
      profile: 'XRECHNUNG',
      rulesetVersion: 'test',
      valid: false,
    });
    const [job] = await db
      .insert(s.einvoiceJobs)
      .values({
        organizationId: a.organizationId,
        invoiceId: id,
        revision: 1,
        kind: 'VALIDATE',
        state: 'FAILED',
        actorId: a.userId,
        requestId: randomUUID(),
        profileId: 'test',
        snapshotHash: '0'.repeat(64),
        lastErrorCode: 'VALIDATOR_TIMEOUT',
      })
      .returning();
    expect((await service.attention(a)).find((r) => r.id === id)?.reason).toBe(
      'PROCESSING',
    );
    await db
      .update(s.einvoiceJobs)
      .set({ state: 'QUEUED' })
      .where(eq(s.einvoiceJobs.id, job!.id));
    expect((await service.attention(a)).some((r) => r.id === id)).toBe(false);
    expect(await service.attention(a, 10000)).toEqual([]);
  });
});
