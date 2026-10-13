import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, afterAll, it, expect } from 'vitest';
import * as s from '@flux/db';
import type { Principal } from '@flux/auth';
import { InvoiceService } from '@flux/application';
import { AutopilotService } from '../packages/application/src/autopilot';
import { fixture } from '../packages/einvoice/fixtures/supported';
import { parseIncoming } from '../packages/incoming/src/parser';
import { readFile } from 'node:fs/promises';
import { hashBytes } from '@flux/storage';
import { dropTestDatabase } from './database-cleanup';
const name = `flux_test_${randomUUID().replaceAll('-', '')}`;
const adminUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://flux:flux@localhost:5432/postgres';
const admin = new Pool({ connectionString: adminUrl });
const url = new URL(adminUrl);
url.pathname = '/' + name;
const { db, pool } = s.connect(url.toString());
const invoices = new InvoiceService(db),
  autopilot = new AutopilotService(db);
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

async function incoming(p: Principal, state = 'APPROVED') {
  const original = await readFile(
    'packages/einvoice/fixtures/golden/3.0.2/standard19.xml',
  );
  const parsed = parseIncoming(original);
  const [row] = await db
    .insert(s.incomingDocuments)
    .values({
      organizationId: p.organizationId,
      actorId: p.userId,
      requestKey: randomUUID(),
      requestHash: hashBytes(original),
      source: 'UPLOAD',
      filename: 'test.xml',
      kind: 'xml',
      original,
      sha256: hashBytes(original),
      size: original.length,
      retainUntil: new Date('2037-01-01'),
      state,
      parsed: parsed,
      validation: 'VALID',
    })
    .returning();
  return row!;
}
it('persists and deduplicates real recommendations, lifecycle and chained activity', async () => {
  const { p } = await tenant();
  const doc = await incoming(p, 'REVIEW');
  await autopilot.reconcile(p.organizationId, 'incoming', doc.id);
  await autopilot.reconcile(p.organizationId, 'incoming', doc.id);
  const brief = await autopilot.brief(p);
  const action = brief.actions.find(
    (a) => a.rule === 'INVOICE_REQUIRES_REVIEW',
  )!;
  expect(action).toBeDefined();
  expect(
    brief.activity.filter(
      (a) => a.actionId === action.id && a.operation === 'detected',
    ),
  ).toHaveLength(1);
  await expect(autopilot.respond(p, action.id, 'dismiss')).rejects.toThrow();
  await autopilot.respond(p, action.id, 'acknowledge');
  await db
    .update(s.incomingDocuments)
    .set({
      state: 'APPROVED',
      approvedBy: p.userId,
      approvedAt: new Date(),
      objectKey: 'test-owned-fixture',
      objectVersion: '1',
      archiveMode: 'LOCAL_DEV',
      parserVersion: 'test',
    })
    .where(eq(s.incomingDocuments.id, doc.id));
  await autopilot.reconcile(p.organizationId, 'incoming', doc.id);
  expect((await autopilot.detail(p, action.id)).status).toBe('RESOLVED');
  await expect(
    db
      .update(s.financialActivity)
      .set({ operation: 'tampered' })
      .where(eq(s.financialActivity.organizationId, p.organizationId)),
  ).rejects.toThrow();
});
it('requires actor-bound fresh confirmation and records payment once without modifying originals', async () => {
  const { p } = await tenant();
  const doc = await incoming(p);
  await autopilot.saveTerms(p, doc.id, {
    dueDay: '2026-10-07',
    discountDay: null,
    discountRate: null,
    discountBase: null,
  });
  const action = (await autopilot.brief(p)).actions.find(
    (a) => a.entityId === doc.id && a.rule === 'PAYABLE_OVERDUE',
  )!;
  const date = doc.parsed!.issueDate;
  const ticket = await autopilot.preparePayment(p, action.id, date);
  const { p: other } = await tenant();
  await expect(autopilot.confirmPayment(other, ticket.id)).rejects.toThrow();
  await autopilot.confirmPayment(p, ticket.id);
  await autopilot.confirmPayment(p, ticket.id);
  expect(
    await db
      .select()
      .from(s.paymentObservations)
      .where(eq(s.paymentObservations.entityId, doc.id)),
  ).toHaveLength(1);
  expect((await autopilot.detail(p, action.id)).status).toBe('RESOLVED');
  const [after] = await db
    .select()
    .from(s.incomingDocuments)
    .where(eq(s.incomingDocuments.id, doc.id));
  expect(after?.sha256).toBe(doc.sha256);
  expect(after?.original).toEqual(doc.original);
});
it('rejects stale and expired confirmations and insufficient roles', async () => {
  const { p } = await tenant();
  const doc = await incoming(p);
  await autopilot.saveTerms(p, doc.id, {
    dueDay: '2026-10-07',
    discountDay: null,
    discountRate: null,
    discountBase: null,
  });
  const action = (await autopilot.brief(p)).actions.find(
    (a) => a.entityId === doc.id && a.rule === 'PAYABLE_OVERDUE',
  )!;
  const ticket = await autopilot.preparePayment(
    p,
    action.id,
    doc.parsed!.issueDate,
  );
  await autopilot.saveTerms(p, doc.id, {
    dueDay: '2026-10-08',
    discountDay: null,
    discountRate: null,
    discountBase: null,
  });
  await expect(autopilot.confirmPayment(p, ticket.id)).rejects.toThrow(
    'geändert',
  );
  const second = await autopilot.preparePayment(
    p,
    action.id,
    doc.parsed!.issueDate,
  );
  await db
    .update(s.financialConfirmations)
    .set({ expiresAt: new Date(0) })
    .where(eq(s.financialConfirmations.id, second.id));
  await expect(autopilot.confirmPayment(p, second.id)).rejects.toThrow(
    'abgelaufen',
  );
  await db
    .update(s.members)
    .set({ role: 'VIEWER' })
    .where(
      and(
        eq(s.members.organizationId, p.organizationId),
        eq(s.members.userId, p.userId),
      ),
    );
  await expect(autopilot.respond(p, action.id, 'acknowledge')).rejects.toThrow(
    'Berechtigung',
  );
  await expect(autopilot.policy(p, 'AUTOPILOT', [])).rejects.toThrow(
    'Berechtigung',
  );
});
it('isolates tenant recommendations and rejects foreign entity references at database level', async () => {
  const { p: a } = await tenant(),
    { p: b } = await tenant();
  const id = await incoming(a, 'REVIEW');
  await autopilot.reconcile(a.organizationId, 'incoming', id.id);
  const action = (await autopilot.brief(a)).actions[0]!;
  await expect(autopilot.detail(b, action.id)).rejects.toThrow();
  expect((await autopilot.brief(b)).actions).toHaveLength(0);
  await expect(
    db.insert(s.paymentObservations).values({
      organizationId: b.organizationId,
      entityType: 'incoming',
      entityId: id.id,
      paidDay: '2026-01-01',
      amount: '1.00',
      actorId: b.userId,
    }),
  ).rejects.toThrow();
});
it('only automatically prepares explicitly allowed low-risk checklists once', async () => {
  const { p } = await tenant();
  const doc = await incoming(p, 'REVIEW');
  await autopilot.policy(p, 'AUTOPILOT', ['INVOICE_REQUIRES_REVIEW']);
  await autopilot.reconcile(p.organizationId, 'incoming', doc.id);
  await autopilot.reconcile(p.organizationId, 'incoming', doc.id);
  const brief = await autopilot.brief(p),
    a = brief.actions.find((a) => a.rule === 'INVOICE_REQUIRES_REVIEW')!;
  expect(a.status).toBe('IN_PROGRESS');
  expect(
    brief.activity.filter(
      (x) => x.operation === 'checklist_prepared' && x.actionId === a.id,
    ),
  ).toHaveLength(1);
  expect(
    await db
      .select()
      .from(s.paymentObservations)
      .where(eq(s.paymentObservations.organizationId, p.organizationId)),
  ).toHaveLength(0);
});
it('compares real originals and requires confirmation before excluding a duplicate from expenses', async () => {
  const { p } = await tenant();
  const a = await incoming(p),
    b = await incoming(p);
  await autopilot.reconcile(p.organizationId, 'incoming', a.id);
  await autopilot.reconcile(p.organizationId, 'incoming', b.id);
  await autopilot.reconcile(p.organizationId, 'incoming', a.id);
  const action = (await autopilot.brief(p)).actions.find(
    (x) => x.rule === 'EXACT_DUPLICATE',
  )!;
  expect(action).toBeDefined();
  const ticket = await autopilot.prepareDuplicate(p, action.id, 'DUPLICATE');
  await autopilot.confirmDuplicate(p, ticket.id);
  await autopilot.confirmDuplicate(p, ticket.id);
  expect((await autopilot.detail(p, action.id)).status).toBe('SUPERSEDED');
  expect(
    await db
      .select()
      .from(s.incomingDuplicateDecisions)
      .where(eq(s.incomingDuplicateDecisions.organizationId, p.organizationId)),
  ).toHaveLength(1);
});
it('runs bounded reconciliation with a persisted cursor', async () => {
  await autopilot.pulse();
  const rows = await db.select().from(s.autopilotCursors);
  expect(rows).toHaveLength(1);
  expect(
    (await db.execute(sql`SELECT count(*)::int count FROM financial_sources`))
      .rows[0]?.count,
  ).toBeGreaterThan(0);
});
it('cash movement and reviewed Skonto terms use real decimal facts without claiming a bank balance', async () => {
  const { p } = await tenant();
  const doc = await incoming(p);
  await autopilot.saveTerms(p, doc.id, {
    dueDay: '2026-10-15',
    discountDay: '2026-10-13',
    discountRate: '2',
    discountBase: '100.00',
  });
  const brief = await autopilot.brief(p);
  expect(brief.summary?.data.payables7).toBe('297.50');
  expect(brief.summary?.data.net7).toBe('-297.50');
  expect(brief.summary?.data.balanceKnown).toBe(false);
  expect(
    brief.actions.find((a) => a.rule === 'CASHFLOW_RISK')?.facts.balanceKnown,
  ).toBe(false);
  expect(brief.actions.find((a) => a.rule === 'SKONTO_EXPIRING')?.amount).toBe(
    '2.00',
  );
  await expect(
    autopilot.saveTerms(p, doc.id, {
      dueDay: '2026-10-15',
      discountDay: '2026-10-13',
      discountRate: '2',
      discountBase: '999999.00',
    }),
  ).rejects.toThrow();
});
it('preserves appropriate dismissals and supersedes obsolete deadline recommendations', async () => {
  const { p } = await tenant();
  const doc = await incoming(p);
  await autopilot.saveTerms(p, doc.id, {
    dueDay: '2026-10-07',
    discountDay: null,
    discountRate: null,
    discountBase: null,
  });
  const a = (await autopilot.brief(p)).actions.find(
    (a) => a.rule === 'PAYABLE_OVERDUE',
  )!;
  await autopilot.respond(p, a.id, 'dismiss');
  await autopilot.reconcile(p.organizationId, 'incoming', doc.id);
  expect((await autopilot.detail(p, a.id)).status).toBe('DISMISSED');
  await autopilot.saveTerms(p, doc.id, {
    dueDay: '2026-10-08',
    discountDay: null,
    discountRate: null,
    discountBase: null,
  });
  expect((await autopilot.detail(p, a.id)).status).toBe('OPEN');
  await autopilot.saveTerms(p, doc.id, {
    dueDay: '2026-10-15',
    discountDay: null,
    discountRate: null,
    discountBase: null,
  });
  expect((await autopilot.detail(p, a.id)).status).toBe('SUPERSEDED');
});
it('rejects competing payment confirmations and duplicate active payment facts', async () => {
  const { p } = await tenant();
  const doc = await incoming(p);
  await autopilot.saveTerms(p, doc.id, {
    dueDay: '2026-10-07',
    discountDay: null,
    discountRate: null,
    discountBase: null,
  });
  const action = (await autopilot.brief(p)).actions.find(
    (a) => a.rule === 'PAYABLE_OVERDUE',
  )!;
  const a = await autopilot.preparePayment(p, action.id, '2026-10-08'),
    b = await autopilot.preparePayment(p, action.id, '2026-10-08');
  const results = await Promise.allSettled([
    autopilot.confirmPayment(p, a.id),
    autopilot.confirmPayment(p, b.id),
  ]);
  expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  await expect(
    db
      .insert(s.paymentObservations)
      .values({
        organizationId: p.organizationId,
        entityType: 'incoming',
        entityId: doc.id,
        paidDay: '2026-10-08',
        amount: '297.50',
        actorId: p.userId,
      }),
  ).rejects.toThrow();
});
it('paginates the complete immutable activity timeline without exposing foreign cursors', async () => {
  const { p } = await tenant(),
    { p: other } = await tenant();
  const doc = await incoming(p, 'REVIEW');
  await autopilot.reconcile(p.organizationId, 'incoming', doc.id);
  const a = (await autopilot.brief(p)).actions.find(
    (a) => a.rule === 'INVOICE_REQUIRES_REVIEW',
  )!;
  for (let i = 0; i < 26; i++) await autopilot.respond(p, a.id, 'helpful');
  const first = await autopilot.history(p);
  expect(first.rows).toHaveLength(25);
  expect(first.next).not.toBeNull();
  const next = await autopilot.history(p, first.next!);
  expect(next.rows.length).toBeGreaterThan(0);
  expect(
    next.rows.some((row) => first.rows.some((prev) => prev.id === row.id)),
  ).toBe(false);
  expect((await autopilot.history(other, first.next!)).rows).toHaveLength(0);
});
