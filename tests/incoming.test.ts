import { dropTestDatabase } from './database-cleanup';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, and } from 'drizzle-orm';
import * as s from '@flux/db';
import { InvoiceService } from '@flux/application';
import { IncomingService } from '../packages/application/src/incoming';
import { parseIncoming } from '../packages/incoming/src/parser';
import { extractIncomingXml } from '../packages/incoming/src/extract';
import { LocalArchive, hashBytes } from '@flux/storage';
import { localValidator } from '../packages/einvoice/src/validator';
import { fixture } from '../packages/einvoice/fixtures/supported';
import type { Principal } from '@flux/auth';
const adminUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://flux:flux@localhost:5432/postgres';
const name = `flux_incoming_${randomUUID().replaceAll('-', '')}`,
  url = new URL(adminUrl);
url.pathname = '/' + name;
const admin = new Pool({ connectionString: adminUrl }),
  { db, pool } = s.connect(url.toString());
let root: string,
  service: IncomingService,
  a: Principal,
  b: Principal,
  viewer: Principal,
  member: Principal,
  xml: Buffer;
const validator = localValidator();
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  await migrate(db, { migrationsFolder: 'packages/db/migrations' });
  root = await mkdtemp(join(tmpdir(), 'flux-incoming-tests-'));
  service = new IncomingService(db, pool, validator, new LocalArchive(root));
  xml = await readFile(
    'packages/einvoice/fixtures/golden/3.0.2/standard19.xml',
  );
  const invoices = new InvoiceService(db),
    seller = fixture.seller;
  for (const id of [
    'incoming-a',
    'incoming-b',
    'incoming-viewer',
    'incoming-member',
  ])
    await db
      .insert(s.user)
      .values({ id, name: id, email: `${id}@example.test` });
  const company = {
    ...seller,
    address: {
      line1: seller.line1,
      city: seller.city,
      postalCode: seller.postalCode,
      country: seller.country,
    },
    numberPrefix: 'RE-',
  };
  const {
    line1: _l,
    city: _c,
    postalCode: _p,
    country: _co,
    ...input
  } = company;
  void _l;
  void _c;
  void _p;
  void _co;
  a = {
    organizationId: await invoices.createOrganization(
      'incoming-a',
      input,
      randomUUID(),
    ),
    userId: 'incoming-a',
    requestId: randomUUID(),
  };
  b = {
    organizationId: await invoices.createOrganization(
      'incoming-b',
      input,
      randomUUID(),
    ),
    userId: 'incoming-b',
    requestId: randomUUID(),
  };
  viewer = { ...a, userId: 'incoming-viewer' };
  member = { ...a, userId: 'incoming-member' };
  await db.insert(s.members).values([
    { organizationId: a.organizationId, userId: viewer.userId, role: 'VIEWER' },
    { organizationId: a.organizationId, userId: member.userId, role: 'MEMBER' },
  ]);
});
afterAll(async () => {
  await pool.end();
  await dropTestDatabase(admin, name);
  await admin.end();
  await rm(root, { recursive: true, force: true });
});
describe('incoming parsing and original boundaries', () => {
  it('reads UBL values without inventing missing values and rejects XML attacks', () => {
    const result = parseIncoming(xml);
    expect(result.syntax).toBe('UBL');
    expect(result.supplier.contactName).toBe(fixture.seller.contactName);
    expect(result.supplier.contactEmail).toBe(fixture.seller.email);
    expect(result.number).toBe('RE-2026-000001');
    expect(result.lines).toHaveLength(1);
    expect(result.totals.payable).toBe('297.50');
    expect(
      parseIncoming(
        Buffer.from(
          xml
            .toString()
            .replace(/<cbc:BuyerReference>.*?<\/cbc:BuyerReference>/, ''),
        ),
      ).buyerReference,
    ).toBe('');
    for (const bad of [
      '<!DOCTYPE Invoice [<!ENTITY leak SYSTEM "file:///etc/passwd">]><Invoice>&leak;</Invoice>',
      '<fake:Invoice xmlns:fake="urn:evil"/>',
      '<Invoice>',
      '<a xmlns="urn:evil"/>',
    ])
      expect(() => parseIncoming(Buffer.from(bad))).toThrow();
    expect(() => parseIncoming(Buffer.alloc(2097153))).toThrow();
    const ambiguous = xml
      .toString()
      .replace(
        '<cbc:BuyerReference>',
        '<cbc:BuyerReference>extra</cbc:BuyerReference><cbc:BuyerReference>',
      );
    expect(() => parseIncoming(Buffer.from(ambiguous))).toThrow(
      'AMBIGUOUS_FIELD',
    );
  });
  it('maps real KoSIT VARL errors to the precise buyer-reference field', async () => {
    const result = await validator.validate(
      Buffer.from(
        xml
          .toString()
          .replace(/<cbc:BuyerReference>.*?<\/cbc:BuyerReference>/, ''),
      ),
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        ruleId: 'BR-DE-15',
        fieldPath: 'buyerReference',
        businessTerm: 'BT-10',
        severity: 'ERROR',
      }),
    );
    expect(
      result.issues.find((i) => i.ruleId === 'BR-DE-15')?.technicalLocation,
    ).toContain('Invoice');
  });
  it('reads and officially validates the upstream CII fixture', async () => {
    const cii = await readFile('tests/fixtures/incoming/kosit-cii.xml');
    const view = parseIncoming(cii);
    expect(view.syntax).toBe('CII');
    expect(view.supplier.name).not.toBe('');
    expect(view.lines.length).toBeGreaterThan(0);
    expect((await validator.validate(cii)).valid).toBe(true);
  });
  it('extracts exactly the original embedded XML, rejects encrypted and non-hybrid PDFs', async () => {
    const pdf = await readFile('tests/fixtures/incoming/hybrid.pdf');
    expect(await extractIncomingXml(pdf, 'pdf')).toEqual(xml);
    await expect(
      extractIncomingXml(
        await readFile('tests/fixtures/document-import/locked.pdf'),
        'pdf',
      ),
    ).rejects.toThrow();
    await expect(
      extractIncomingXml(
        await readFile('tests/fixtures/document-import/letter.pdf'),
        'pdf',
      ),
    ).rejects.toThrow();
  });
  it('preserves, validates, revalidates and approves only explicitly reviewed originals', async () => {
    const key = randomUUID();
    const id = await service.receive(member, xml, '../original.xml', key);
    expect(await service.receive(member, xml, '../original.xml', key)).toBe(id);
    await expect(
      service.receive(a, xml, '../original.xml', key),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await service.detail(a, id)).filename).toBe('.._original.xml');
    await expect(service.detail(b, id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.download(b, id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.revalidate(b, id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      service.receive(viewer, xml, 'a.xml', randomUUID()),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION' });
    await expect(
      service.list({ ...b, organizationId: a.organizationId }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION' });
    await service.process(a.organizationId, id);
    const first = await service.detail(viewer, id);
    expect(first.validation).toBe('VALID');
    expect(first.state).toBe('REVIEW');
    expect((await service.download(a, id)).bytes).toEqual(xml);
    await expect(
      service.approve(member, id, first.checks[0]!.id, true),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION' });
    await expect(
      service.approve(a, id, first.checks[0]!.id, false),
    ).rejects.toThrow();
    await service.revalidate(a, id);
    await service.process(a.organizationId, id);
    const second = await service.detail(a, id);
    expect(second.checks).toHaveLength(2);
    await expect(
      service.approve(a, id, first.checks[0]!.id, true),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await service.approve(a, id, second.checks[0]!.id, true);
    await service.approve(a, id, second.checks[0]!.id, true);
    expect((await service.detail(a, id)).state).toBe('APPROVED');
    await expect(service.revalidate(a, id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(
      db
        .update(s.incomingDocuments)
        .set({ original: Buffer.from('changed') })
        .where(eq(s.incomingDocuments.id, id)),
    ).rejects.toThrow();
    await expect(
      db.delete(s.incomingDocuments).where(eq(s.incomingDocuments.id, id)),
    ).rejects.toThrow();
    await expect(
      db.delete(s.incomingChecks).where(eq(s.incomingChecks.incomingId, id)),
    ).rejects.toThrow();
    expect(await service.list(b)).toEqual([]);
    expect((await db.select().from(s.invoices)).length).toBe(0);
  }, 30000);
  it('retains malformed and unsupported originals without trusting or approving them', async () => {
    for (const bytes of [
      Buffer.from('<broken>'),
      Buffer.from(xml.toString().replace('xrechnung_3.0', 'unknown_9.0')),
    ]) {
      const id = await service.receive(a, bytes, 'untrusted.xml', randomUUID());
      await service.process(a.organizationId, id);
      const d = await service.detail(a, id);
      expect(['INVALID', 'UNSUPPORTED']).toContain(d.validation);
      expect((await service.download(a, id)).bytes).toEqual(bytes);
      await expect(
        service.approve(a, id, d.checks[0]!.id, true),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect((await service.list(a, 1, true)).some((r) => r.id === id)).toBe(
        true,
      );
    }
    await expect(
      service.receive(a, Buffer.alloc(2097153), 'huge.xml', randomUUID()),
    ).rejects.toThrow();
  });
  it('recovers archive failure without losing the received original or its identity', async () => {
    const id = await service.receive(a, xml, 'retry.xml', randomUUID());
    const failed = new IncomingService(db, pool, validator, {
      put: async () => {
        throw new Error('offline');
      },
      get: async () => {
        throw new Error('offline');
      },
    });
    await expect(failed.process(a.organizationId, id)).rejects.toThrow();
    const d = await service.detail(a, id);
    expect(d.state).toBe('ERROR');
    expect(hashBytes((await service.download(a, id)).bytes)).toBe(d.sha256);
    await service.process(a.organizationId, id);
    expect((await service.detail(a, id)).validation).toBe('VALID');
    const audits = await db
      .select()
      .from(s.auditEvents)
      .where(
        and(
          eq(s.auditEvents.organizationId, a.organizationId),
          eq(s.auditEvents.entityId, id),
        ),
      );
    expect(audits.length).toBeGreaterThan(2);
  });
});

it('bounds tenant intake while preserving idempotent retries and separates runtime failure from invalid XML', async () => {
  const down = new IncomingService(
    db,
    pool,
    {
      validate: async () => ({
        valid: false,
        issues: [
          {
            ruleId: 'VALIDATOR_TIMEOUT',
            severity: 'ERROR',
            source: 'SYSTEM',
            fieldPath: '',
            businessTerm: '',
            message: 'Unavailable',
            profile: 'XRECHNUNG',
            profileVersion: '3.0.2',
            rulesetVersion: 'test',
            technicalLocation: '',
          },
        ],
        sha256: hashBytes(xml),
        durationMs: 1,
        reportHash: '',
      }),
    },
    new LocalArchive(root),
  );
  const id = await service.receive(a, xml, 'runtime.xml', randomUUID());
  await expect(down.process(a.organizationId, id)).rejects.toThrow(
    'INCOMING_RETRY_REQUIRED',
  );
  expect((await service.detail(a, id)).validation).toBe('ERROR');
  // A separate tenant proves the quota does not count another tenant's originals.
  const key = randomUUID();
  const first = await service.receive(
    b,
    Buffer.from('<bad>'),
    'quota.xml',
    key,
  );
  for (let i = 1; i < 100; i++)
    await service.receive(b, Buffer.from('<bad>'), 'quota.xml', randomUUID());
  expect(await service.receive(b, Buffer.from('<bad>'), 'quota.xml', key)).toBe(
    first,
  );
  await expect(
    service.receive(b, Buffer.from('<bad>'), 'quota.xml', randomUUID()),
  ).rejects.toMatchObject({ code: 'RATE_LIMIT' });
  expect(await service.list(b, 1)).toHaveLength(25);
  expect(await service.list(b, 4)).toHaveLength(25);
  expect(await service.list(b, 5)).toHaveLength(0);
});
