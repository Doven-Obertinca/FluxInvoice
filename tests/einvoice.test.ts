import { resolve } from 'node:path';
import { validCases } from '../packages/einvoice/fixtures/corpus';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, chmod, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, and } from 'drizzle-orm';
import * as s from '@flux/db';
import { InvoiceService } from '@flux/application';
import type { Principal } from '@flux/auth';
import { EinvoiceService } from '../packages/application/src/einvoice';
import {
  localValidator,
  KositValidator,
  sha256,
} from '../packages/einvoice/src/validator';
import { serializeUbl, toSemantic, semanticIssues } from '@flux/einvoice';
import { fixture as supported } from '../packages/einvoice/fixtures/supported';
import { safeParseXml } from '../packages/einvoice/src/security';
import { LocalArchive, ArchiveError } from '@flux/storage';
// A finalization invokes the Java validator twice (up to 30 seconds each).
// Leave time for database and archive operations on slower CI runners.
vi.setConfig({ testTimeout: 90000 });

const databaseName = `flux_einvoice_${randomUUID().replaceAll('-', '')}`;
const adminUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://flux:flux@localhost:5432/postgres';
const admin = new Pool({ connectionString: adminUrl });
const url = new URL(adminUrl);
url.pathname = '/' + databaseName;
const { db, pool } = s.connect(url.toString());
const invoices = new InvoiceService(db);
const validator = localValidator();
let root: string;
let archive: LocalArchive;
let service: EinvoiceService;
let p: Principal;
let customerId: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'flux-archive-test-'));
  archive = new LocalArchive(root);
  service = new EinvoiceService(db, pool, validator, archive);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await migrate(db, { migrationsFolder: 'packages/db/migrations' });
  await db
    .insert(s.user)
    .values({ id: 'issuer', name: 'Issuer', email: 'issuer@example.test' });
  const seller = supported.seller;
  const organizationId = await invoices.createOrganization(
    'issuer',
    {
      name: seller.name,
      email: seller.email,
      vatId: seller.vatId,
      taxNumber: seller.taxNumber,
      contactName: seller.contactName,
      contactPhone: seller.contactPhone,
      iban: seller.iban,
      bic: seller.bic,
      numberPrefix: 'RE-',
      address: {
        line1: seller.line1,
        city: seller.city,
        postalCode: seller.postalCode,
        country: 'DE',
      },
    },
    randomUUID(),
  );
  p = { organizationId, userId: 'issuer', requestId: randomUUID() };
  const buyer = supported.buyer;
  customerId = await invoices.createCustomer(p, {
    name: buyer.name,
    email: buyer.email,
    vatId: buyer.vatId,
    address: {
      line1: buyer.line1,
      city: buyer.city,
      postalCode: buyer.postalCode,
      country: 'DE',
    },
  });
});
afterAll(async () => {
  await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
  await rm(root, { recursive: true, force: true });
});
const draft = () =>
  invoices.saveInvoice(
    p,
    { ...supported.input, customerId },
    { idempotencyKey: randomUUID() },
  );
describe('authoritative XRechnung and fiscal lifecycle', () => {
  it.each(Object.entries(validCases))(
    'validates and matches the committed golden: %s',
    async (name, fixture) => {
      const bytes = serializeUbl(toSemantic(fixture, 'RE-2026-000001'));
      expect(
        bytes.equals(
          await readFile(`packages/einvoice/fixtures/golden/3.0.2/${name}.xml`),
        ),
      ).toBe(true);
      const result = await validator.validate(bytes);
      expect(result.issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
      expect(result.valid).toBe(true);
      const document = safeParseXml(bytes);
      const ns =
        'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
      expect(
        document.getElementsByTagNameNS(ns, 'PayableAmount')[0]?.textContent,
      ).toBe(toSemantic(fixture, 'RE-2026-000001').totals.payable);
    },
  );

  it('serializes deterministically, escapes XML and passes the pinned official validator', async () => {
    const a = serializeUbl(toSemantic(supported, 'RE-2026-000001'));
    expect(
      a.equals(serializeUbl(toSemantic(supported, 'RE-2026-000001'))),
    ).toBe(true);
    expect(a.toString()).toContain('&amp;');
    const result = await validator.validate(a);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.sha256).toBe(sha256(a));
    expect(result.reportHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects unsafe XML, malformed encoding, excess depth and excessive size before Java', () => {
    for (const raw of [
      '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>',
      '<x xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="https://example.test"/></x>',
      '<x>'.repeat(65) + '</x>'.repeat(65),
      '<x>',
    ])
      expect(() => safeParseXml(Buffer.from(raw))).toThrow();
    expect(() => safeParseXml(Buffer.alloc(2100000))).toThrow();
    expect(() => safeParseXml(Buffer.from([0xff]))).toThrow();
  });
  it('reports missing semantic data with rule IDs and field paths', () => {
    const input = structuredClone(supported);
    input.seller.contactName = '';
    input.input.buyerReference = '';
    expect(semanticIssues(input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'BR-DE-5',
          fieldPath: 'seller.contactName',
        }),
        expect.objectContaining({ ruleId: 'BR-DE-15', businessTerm: 'BT-10' }),
      ]),
    );
  });
  it('official validator rejects a corrupted monetary total', async () => {
    const bytes = serializeUbl(toSemantic(supported, 'RE-2026-000001'));
    const bad = Buffer.from(
      bytes.toString().replace(/(<cbc:PayableAmount[^>]*>)[^<]+/, '$1999.99'),
    );
    const result = await validator.validate(bad);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.source === 'KOSIT' && i.severity === 'ERROR'),
    ).toBe(true);
  });
  it('deduplicates requests, freezes content, finalizes once and serves exact bytes', async () => {
    const id = await draft();
    const key = randomUUID();
    const job = await service.enqueue(p, id, 1, 'FINALIZE', key);
    expect(await service.enqueue(p, id, 1, 'FINALIZE', key)).toBe(job);
    expect(await service.enqueue(p, id, 1, 'FINALIZE', randomUUID())).toBe(job);
    await expect(
      invoices.saveInvoice(
        p,
        { ...supported.input, customerId },
        { id, revision: 1, idempotencyKey: randomUUID() },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await service.process(p.organizationId, job);
    await service.process(p.organizationId, job);
    const detail = await invoices.invoice(p, id);
    expect(detail.issues).toEqual([]);
    expect(detail.invoice.status).toBe('FINALIZED');
    expect(detail.invoice.number).toMatch(/^RE-2026-/);
    const history = await service.history(p, id);
    expect(history.documents).toHaveLength(1);
    expect(
      history.activity.filter((e) => e.eventType === 'invoice.finalized'),
    ).toHaveLength(1);
    const doc = history.documents[0]!;
    const download = await service.download(p, doc.id);
    expect(sha256(download.bytes)).toBe(doc.sha256);
    expect(download.bytes.toString()).toContain(detail.invoice.number!);
    expect(
      history.runs.some(
        (r) =>
          r.purpose === 'ISSUANCE' && r.valid && r.candidateHash === doc.sha256,
      ),
    ).toBe(true);
    await expect(
      db
        .update(s.invoices)
        .set({ notes: 'changed' })
        .where(eq(s.invoices.id, id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(s.invoiceItems)
        .set({ description: 'changed' })
        .where(eq(s.invoiceItems.invoiceId, id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(s.invoiceDocuments)
        .set({ objectVersion: 'fake' })
        .where(eq(s.invoiceDocuments.id, doc.id)),
    ).rejects.toThrow();
  });
  it('lists an actually issued overdue invoice as payment follow-up, not validation failure', async () => {
    const id = await invoices.saveInvoice(
      p,
      {
        ...supported.input,
        customerId,
        issueDate: '2025-01-01',
        dueDate: '2025-01-02',
        serviceDate: '2025-01-01',
      },
      { idempotencyKey: randomUUID() },
    );
    expect(
      (await invoices.attention(p)).find((r) => r.id === id),
    ).toBeUndefined();
    const job = await service.enqueue(p, id, 1, 'FINALIZE', randomUUID());
    await service.process(p.organizationId, job);
    expect((await invoices.attention(p)).find((r) => r.id === id)?.reason).toBe(
      'OVERDUE',
    );
    expect((await invoices.invoice(p, id)).invoice.status).toBe('FINALIZED');
  }, 150000);
  it('keeps a reserved number and frozen draft through archive failure and retry', async () => {
    const id = await draft();
    const jobId = await service.enqueue(p, id, 1, 'FINALIZE', randomUUID());
    const unavailable = new EinvoiceService(db, pool, validator, {
      put: async () => {
        throw new ArchiveError('ARCHIVE_UNAVAILABLE');
      },
      get: async () => {
        throw new ArchiveError('ARCHIVE_MISSING');
      },
    });
    await expect(unavailable.process(p.organizationId, jobId)).rejects.toThrow(
      'EINVOICE_RETRY_REQUIRED',
    );
    const [failed] = await db
      .select()
      .from(s.einvoiceJobs)
      .where(eq(s.einvoiceJobs.id, jobId));
    expect(failed!.number).toBeTruthy();
    const before = await invoices.invoice(p, id);
    expect(before.invoice.status).toBe('VALIDATED');
    expect(before.invoice.finalizationPending).toBe(true);
    expect((await invoices.attention(p)).find((r) => r.id === id)?.reason).toBe(
      'PROCESSING',
    );
    await service.process(p.organizationId, jobId);
    const after = await invoices.invoice(p, id);
    expect(after.invoice.number).toBe(failed!.number);
    expect(after.invoice.status).toBe('FINALIZED');
    expect(
      (await invoices.attention(p)).find((r) => r.id === id)?.reason,
    ).not.toBe('PROCESSING');
  }, 150000);
  it('blocks download of tampered archived bytes and records an integrity failure', async () => {
    const id = await draft();
    const job = await service.enqueue(p, id, 1, 'FINALIZE', randomUUID());
    await service.process(p.organizationId, job);
    const { documents } = await service.history(p, id);
    const doc = documents[0]!;
    await chmod(join(root, doc.objectKey), 0o600);
    await writeFile(join(root, doc.objectKey), 'tampered');
    await expect(service.download(p, doc.id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    const checks = await db
      .select()
      .from(s.documentChecks)
      .where(
        and(
          eq(s.documentChecks.documentId, doc.id),
          eq(s.documentChecks.valid, false),
        ),
      );
    expect(checks).toHaveLength(1);
  });
});

it('concurrent requests and worker deliveries produce one fiscal artifact', async () => {
  const id = await draft();
  const requests = await Promise.all(
    Array.from({ length: 8 }, () =>
      service.enqueue(p, id, 1, 'FINALIZE', randomUUID()),
    ),
  );
  expect(new Set(requests).size).toBe(1);
  const results = await Promise.allSettled([
    service.process(p.organizationId, requests[0]!),
    service.process(p.organizationId, requests[0]!),
  ]);
  expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
  expect((await service.history(p, id)).documents).toHaveLength(1);
  expect(await service.enqueue(p, id, 1, 'FINALIZE', randomUUID())).toBe(
    requests[0],
  );
});
it('upload success followed by SQL failure remains recoverable with the same object and number', async () => {
  const id = await draft();
  const jobId = await service.enqueue(p, id, 1, 'FINALIZE', randomUUID());
  await pool.query(
    `CREATE FUNCTION test_reject_finalize() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${id}' AND NEW.status='FINALIZED' THEN RAISE EXCEPTION 'injected SQL failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER test_injected BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION test_reject_finalize()`,
  );
  let failed: typeof s.einvoiceJobs.$inferSelect | undefined;
  try {
    await expect(service.process(p.organizationId, jobId)).rejects.toThrow(
      'EINVOICE_RETRY_REQUIRED',
    );
    [failed] = await db
      .select()
      .from(s.einvoiceJobs)
      .where(eq(s.einvoiceJobs.id, jobId));
    expect(failed?.lastErrorCode).toBe('FINALIZATION_FAILED');
    expect(failed?.objectKey).toBeTruthy();
    expect((await service.history(p, id)).documents).toHaveLength(0);
    const orphan = await archive.get(
      failed!.objectKey!,
      failed!.candidateHash!,
    );
    expect(sha256(orphan)).toBe(failed!.candidateHash);
  } finally {
    await pool.query(
      'DROP TRIGGER IF EXISTS test_injected ON invoices; DROP FUNCTION IF EXISTS test_reject_finalize()',
    );
  }
  await service.process(p.organizationId, jobId);
  const result = await invoices.invoice(p, id);
  expect(result.invoice.number).toBe(failed!.number);
  expect((await service.history(p, id)).documents).toHaveLength(1);
}, 150000);
it('historical documents survive later changes to company and customer masters', async () => {
  const id = await draft();
  const job = await service.enqueue(p, id, 1, 'FINALIZE', randomUUID());
  await service.process(p.organizationId, job);
  const doc = (await service.history(p, id)).documents[0]!;
  const original = (await service.download(p, doc.id)).bytes;
  await db
    .update(s.organizations)
    .set({
      name: 'Changed company',
      line1: 'Changed address',
      iban: 'DE12500105170648489890',
      vatId: 'DE987654321',
    })
    .where(eq(s.organizations.id, p.organizationId));
  await db
    .update(s.customers)
    .set({ name: 'Changed buyer' })
    .where(eq(s.customers.id, customerId));
  await db
    .update(s.customerAddresses)
    .set({ line1: 'Changed customer address' })
    .where(eq(s.customerAddresses.customerId, customerId));
  const downloaded = (await service.download(p, doc.id)).bytes;
  expect(downloaded.equals(original)).toBe(true);
  expect(downloaded.toString()).not.toContain('Changed');
});
it('rejects unauthorized finalization and stale revisions', async () => {
  await db
    .insert(s.user)
    .values({ id: 'reader', name: 'Reader', email: 'reader@example.test' });
  await db.insert(s.members).values({
    organizationId: p.organizationId,
    userId: 'reader',
    role: 'VIEWER',
  });
  const id = await draft();
  await expect(
    service.enqueue(
      { ...p, userId: 'reader' },
      id,
      1,
      'FINALIZE',
      randomUUID(),
    ),
  ).rejects.toMatchObject({ code: 'AUTHORIZATION' });
  await expect(
    service.enqueue(p, id, 2, 'FINALIZE', randomUUID()),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(
    service.download({ ...p, organizationId: randomUUID() }, randomUUID()),
  ).rejects.toMatchObject({ code: 'AUTHORIZATION' });
});

it.each([
  [
    'missing seller',
    (xml: string) =>
      xml.replace(
        /\s*<cac:AccountingSupplierParty>[\s\S]*?<\/cac:AccountingSupplierParty>/,
        '',
      ),
  ],
  [
    'missing buyer',
    (xml: string) =>
      xml.replace(
        /\s*<cac:AccountingCustomerParty>[\s\S]*?<\/cac:AccountingCustomerParty>/,
        '',
      ),
  ],
  [
    'missing buyer reference',
    (xml: string) =>
      xml.replace(/\s*<cbc:BuyerReference>[^<]*<\/cbc:BuyerReference>/, ''),
  ],
  [
    'invalid VAT breakdown',
    (xml: string) => xml.replace(/(<cbc:TaxableAmount[^>]*>)[^<]+/, '$1999.00'),
  ],
  ['invalid date', (xml: string) => xml.replace('2026-10-06', '2026-99-99')],
] as const)('official rules reject %s', async (_name, mutate) => {
  const xml = serializeUbl(toSemantic(supported, 'RE-2026-000001')).toString();
  const result = await validator.validate(Buffer.from(mutate(xml)));
  expect(result.valid).toBe(false);
  expect(result.issues.some((i) => i.severity === 'ERROR')).toBe(true);
});

it('validator timeouts and unavailable Java become controlled failures', async () => {
  const home = resolve('.local/compliance');
  const bytes = serializeUbl(toSemantic(supported, 'RE-2026-000001'));
  const timeout = await new KositValidator({
    home,
    java: process.env.JAVA_BIN ?? resolve(home, 'java-bin'),
    timeoutMs: 1,
  }).validate(bytes);
  expect(timeout.valid).toBe(false);
  expect(timeout.issues[0]?.ruleId).toBe('VALIDATOR_TIMEOUT');
  const unavailable = await new KositValidator({
    home,
    java: resolve(home, 'missing-java'),
  }).validate(bytes);
  expect(unavailable.valid).toBe(false);
  expect(unavailable.issues[0]?.source).toBe('SYSTEM');
});

it('blocking validation persists actionable issues without reserving a number or document', async () => {
  const id = await invoices.saveInvoice(
    p,
    { ...supported.input, customerId, buyerReference: '' },
    { idempotencyKey: randomUUID() },
  );
  const key = randomUUID();
  const job = await service.enqueue(p, id, 1, 'FINALIZE', key);
  await expect(
    service.enqueue(p, await draft(), 1, 'FINALIZE', key),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(
    db
      .update(s.invoiceItems)
      .set({ description: 'tamper frozen draft' })
      .where(eq(s.invoiceItems.invoiceId, id)),
  ).rejects.toThrow();
  await service.process(p.organizationId, job);
  const detail = await invoices.invoice(p, id);
  expect(detail.invoice.status).not.toBe('FINALIZED');
  expect(detail.invoice.finalizationPending).toBe(false);
  expect(detail.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'BR-DE-15',
        fieldPath: 'buyerReference',
      }),
    ]),
  );
  const history = await service.history(p, id);
  expect(history.documents).toHaveLength(0);
  expect(history.jobs[0]?.number).toBeNull();
});
it('an authenticated different tenant cannot enqueue or download the first tenant documents', async () => {
  const [document] = await db
    .select()
    .from(s.invoiceDocuments)
    .where(eq(s.invoiceDocuments.organizationId, p.organizationId))
    .limit(1);
  expect(document).toBeDefined();
  await db.insert(s.user).values({
    id: 'other-owner',
    name: 'Other',
    email: 'other-owner@example.test',
  });
  const party = supported.seller;
  const organizationId = await invoices.createOrganization(
    'other-owner',
    {
      name: party.name,
      email: party.email,
      vatId: party.vatId,
      taxNumber: party.taxNumber,
      contactName: party.contactName,
      contactPhone: party.contactPhone,
      iban: party.iban,
      bic: party.bic,
      numberPrefix: 'OTHER-',
      address: {
        line1: party.line1,
        city: party.city,
        postalCode: party.postalCode,
        country: 'DE',
      },
    },
    randomUUID(),
  );
  const other = {
    organizationId,
    userId: 'other-owner',
    requestId: randomUUID(),
  };
  await expect(service.download(other, document!.id)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  await expect(
    service.enqueue(other, document!.invoiceId, 1, 'FINALIZE', randomUUID()),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it('rejects unsupported tax scenarios, invalid identifiers and XML control characters before serialization', () => {
  const unsupported = structuredClone(supported);
  Object.assign(unsupported.input.lines[0]!, { vatRate: '0' });
  expect(semanticIssues(unsupported).some((i) => i.source === 'INPUT')).toBe(
    true,
  );
  const invalid = structuredClone(supported);
  invalid.seller.vatId = 'INVALID';
  expect(
    semanticIssues(invalid).some((i) => i.fieldPath === 'seller.vatId'),
  ).toBe(true);
  const control = structuredClone(supported);
  control.input.notes = 'bad' + String.fromCharCode(0);
  expect(
    semanticIssues(control).some(
      (i) => i.ruleId === 'FLUX-XML-CHAR' && i.fieldPath === 'notes',
    ),
  ).toBe(true);
});

it('delivers only authoritative bytes with tenant isolation, audited retries, deduplication and authenticated receipts', async () => {
  const { DeliveryService } =
    await import('../packages/application/src/delivery');
  const { createHmac } = await import('node:crypto');
  const sent: import('../packages/application/src/email-provider').DeliveryEnvelope[] =
    [];
  const mail = new DeliveryService(db, archive, {
    name: 'gateway',
    send: async (envelope) => {
      sent.push(envelope);
      return envelope.id;
    },
  });
  const id = await draft();
  await expect(mail.compose(p, id)).rejects.toMatchObject({ code: 'CONFLICT' });
  const job = await service.enqueue(p, id, 1, 'FINALIZE', randomUUID());
  await service.process(p.organizationId, job);
  const before = (await invoices.invoice(p, id)).invoice;
  const composer = await mail.compose(p, id);
  expect(composer.recipient).toBe(supported.buyer.email);
  expect(composer.subject).toContain(before.number);
  expect(composer.message).toContain('Vielen Dank');
  const request = {
    key: randomUUID(),
    recipient: composer.recipient,
    subject: composer.subject,
    message: composer.message,
  };
  await expect(
    mail.enqueue({ ...p, organizationId: randomUUID() }, id, request),
  ).rejects.toMatchObject({ code: 'AUTHORIZATION' });
  await db.insert(s.user).values({
    id: 'delivery-viewer',
    name: 'Viewer',
    email: 'delivery-viewer@example.test',
  });
  await db.insert(s.members).values({
    organizationId: p.organizationId,
    userId: 'delivery-viewer',
    role: 'VIEWER',
  });
  await expect(
    mail.enqueue({ ...p, userId: 'delivery-viewer' }, id, request),
  ).rejects.toMatchObject({ code: 'AUTHORIZATION' });
  const otherOrg = randomUUID();
  await db.insert(s.organizations).values({
    ...(await invoices.company(p)),
    id: otherOrg,
    name: 'Other tenant',
  });
  await db.insert(s.members).values({
    organizationId: otherOrg,
    userId: 'delivery-viewer',
    role: 'OWNER',
  });
  const other = { ...p, organizationId: otherOrg, userId: 'delivery-viewer' };
  await expect(mail.compose(other, id)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  await expect(mail.enqueue(other, id, request)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  await expect(mail.history(other, id)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  const originalSettings = await mail.settings(p);
  const { defaults } =
    await import('../packages/application/src/email-template');
  await mail.saveSettings(p, {
    ...originalSettings,
    language: 'en',
    ...defaults('en'),
  });
  expect((await mail.compose(p, id)).message).toContain(
    'Thank you for your business.',
  );
  await expect(
    mail.saveSettings({ ...p, userId: 'delivery-viewer' }, originalSettings),
  ).rejects.toMatchObject({ code: 'AUTHORIZATION' });
  await mail.saveSettings(p, originalSettings);
  const results = await Promise.all([
    mail.enqueue(p, id, request),
    mail.enqueue(p, id, request),
  ]);
  expect(results[0]).toBe(results[1]);
  await expect(
    mail.enqueue(p, id, { ...request, key: randomUUID() }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(
    mail.enqueue(p, id, { ...request, subject: 'different' }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await Promise.all([
    mail.process(p.organizationId, results[0]!),
    mail.process(p.organizationId, results[0]!),
  ]);
  expect(sent).toHaveLength(1);
  const doc = (await service.history(p, id)).documents[0]!;
  expect(sent[0]!.attachments[0]!.content).toEqual(
    await archive.get(doc.objectKey, doc.objectVersion),
  );
  expect((await mail.history(p, id))[0]?.status).toBe('SUBMITTED');
  process.env.DELIVERY_WEBHOOK_SECRET =
    'test-only-secret-with-at-least-32-characters';
  const body = JSON.stringify({
    eventId: randomUUID(),
    attemptId: results[0],
    providerId: results[0],
    status: 'DELIVERED',
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', process.env.DELIVERY_WEBHOOK_SECRET)
    .update(timestamp + '.' + body)
    .digest('hex');
  await expect(mail.receipt(body, timestamp, '0'.repeat(64))).rejects.toThrow();
  await expect(mail.receipt(body, '1000000000', signature)).rejects.toThrow();
  await mail.receipt(body, timestamp, signature);
  await mail.receipt(body, timestamp, signature);
  expect((await mail.history(p, id))[0]?.status).toBe('DELIVERED');
  await pool.query(
    "UPDATE invoice_deliveries SET created_at=now()-interval '1 minute' WHERE id=$1",
    [results[0]],
  );
  const retry = await mail.enqueue(p, id, {
    ...request,
    key: randomUUID(),
    resendOf: results[0],
  });
  const failing = new DeliveryService(db, archive, {
    name: 'smtp',
    send: async () => {
      throw Error('offline');
    },
  });
  await failing.process(p.organizationId, retry);
  await failing.process(p.organizationId, retry);
  expect((await mail.history(p, id))[0]?.status).toBe('FAILED');
  await expect(
    mail.enqueue({ ...p, userId: 'delivery-viewer' }, id, {
      ...request,
      key: randomUUID(),
      resendOf: retry,
    }),
  ).rejects.toMatchObject({ code: 'AUTHORIZATION' });
  await pool.query(
    "UPDATE invoice_deliveries SET created_at=now()-interval '30 seconds' WHERE id=$1",
    [retry],
  );
  const tamper = await mail.enqueue(p, id, {
    ...request,
    key: randomUUID(),
    resendOf: retry,
  });
  const corrupt = new DeliveryService(
    db,
    {
      put: archive.put.bind(archive),
      get: async () => Buffer.from('tampered'),
    },
    {
      name: 'gateway',
      send: async (envelope) => {
        sent.push(envelope);
        return envelope.id;
      },
    },
  );
  await corrupt.process(p.organizationId, tamper);
  expect((await mail.history(p, id))[0]?.error_code).toBe(
    'ATTACHMENT_INTEGRITY',
  );
  expect(sent).toHaveLength(1);
  await pool.query(
    "UPDATE invoice_deliveries SET created_at=created_at-interval '1 minute' WHERE invoice_id=$1",
    [id],
  );
  const bounced = await mail.enqueue(p, id, {
    ...request,
    key: randomUUID(),
    resendOf: tamper,
  });
  await mail.process(otherOrg, bounced);
  expect((await mail.history(p, id))[0]?.status).toBe('QUEUED');
  await mail.process(p.organizationId, bounced);
  const bounceBody = JSON.stringify({
    eventId: randomUUID(),
    attemptId: bounced,
    providerId: bounced,
    status: 'BOUNCED',
  });
  await mail.receipt(
    bounceBody,
    timestamp,
    createHmac('sha256', process.env.DELIVERY_WEBHOOK_SECRET!)
      .update(timestamp + '.' + bounceBody)
      .digest('hex'),
  );
  expect((await mail.history(p, id))[0]?.status).toBe('BOUNCED');
  await pool.query(
    "UPDATE invoice_deliveries SET created_at=created_at-interval '1 minute' WHERE invoice_id=$1",
    [id],
  );
  const crashed = await mail.enqueue(p, id, {
    ...request,
    key: randomUUID(),
    resendOf: bounced,
  });
  await pool.query(
    "UPDATE invoice_deliveries SET claimed_at=now()-interval '4 minutes' WHERE id=$1",
    [crashed],
  );
  await mail.process(p.organizationId, crashed);
  expect((await mail.history(p, id))[0]?.error_code).toBe('SUBMISSION_UNKNOWN');
  expect(sent).toHaveLength(2);
  expect((await invoices.invoice(p, id)).invoice).toEqual(before);
  const events = (await service.history(p, id)).activity.map(
    (e) => e.eventType,
  );
  expect(events).toContain('delivery.submitted');
  expect(events).toContain('delivery.delivered');
  expect(events).toContain('delivery.failed');
  delete process.env.DELIVERY_WEBHOOK_SECRET;
});
