import { requireCapability } from '@flux/shared';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { and, eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '@flux/db';
import { authorize, type Principal, type Permission } from '@flux/auth';
import { appendAudit, digest } from '@flux/audit';
import { AppError } from '@flux/shared';
import { hashBytes, type Archive } from '@flux/storage';
import { parseIncoming, parserVersion } from '../../incoming/src/parser';
import { extractIncomingXml } from '../../incoming/src/extract';
import { manifest, type Issue } from '../../einvoice/src/semantic';
import { manifestHash, type Validator } from '../../einvoice/src/validator';
const where = (organizationId: string, id: string) =>
  and(
    eq(s.incomingDocuments.organizationId, organizationId),
    eq(s.incomingDocuments.id, id),
  );
export class IncomingService {
  constructor(
    private db: s.Database,
    private pool: Pool,
    private validator: Validator,
    private archive: Archive,
  ) {}
  private async tx<T>(
    p: Principal,
    permission: Permission,
    fn: (tx: s.Transaction) => Promise<T>,
  ) {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM organizations WHERE id=${p.organizationId} FOR UPDATE`,
      );
      await authorize(tx, p, permission);
      return fn(tx);
    });
  }
  private async event(
    tx: s.Transaction,
    p: Principal,
    id: string,
    eventType: string,
  ) {
    await appendAudit(tx, {
      organizationId: p.organizationId,
      actorId: p.userId,
      requestId: p.requestId,
      eventType,
      entityType: 'incoming',
      entityId: id,
      metadata: {},
    });
    if (eventType !== 'incoming.downloaded')
      await tx.insert(s.outbox).values({
        organizationId: p.organizationId,
        entityId: id,
        eventType: 'financial.incoming.changed',
        requestId: p.requestId,
      });
  }
  async receive(
    p: Principal,
    bytes: Buffer,
    filename: string,
    requestKey: string,
  ) {
    requireCapability('compliantArchive');
    await authorize(this.db, p, 'incoming:import');
    z.uuid().parse(requestKey);
    if (!bytes.length || bytes.length > 2097152)
      throw new AppError(
        'VALIDATION',
        'Bitte laden Sie eine XML- oder PDF-Datei bis 2 MiB hoch.',
      );
    const kind = bytes.subarray(0, 5).toString() === '%PDF-' ? 'pdf' : 'xml';
    const name = z
      .string()
      .min(1)
      .max(200)
      .parse(filename)
      .replace(/[\x00-\x1f\x7f/\\]/g, '_');
    const sha256 = hashBytes(bytes),
      requestHash = digest({ sha256, name, kind, actor: p.userId });
    return this.tx(p, 'incoming:import', async (tx) => {
      const [existing] = await tx
        .select()
        .from(s.incomingDocuments)
        .where(
          and(
            eq(s.incomingDocuments.organizationId, p.organizationId),
            eq(s.incomingDocuments.requestKey, requestKey),
          ),
        );
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new AppError(
            'CONFLICT',
            'Dieser Importauftrag gehört zu einer anderen Datei.',
          );
        return existing.id;
      }
      const [quota] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(s.incomingDocuments)
        .where(
          and(
            eq(s.incomingDocuments.organizationId, p.organizationId),
            sql`${s.incomingDocuments.receivedAt} > CURRENT_TIMESTAMP - interval '24 hours'`,
          ),
        );
      if ((quota?.count ?? 0) >= 100)
        throw new AppError(
          'RATE_LIMIT',
          'Das Importlimit von 100 Originalen innerhalb von 24 Stunden ist erreicht.',
        );
      const id = randomUUID();
      await tx.insert(s.incomingDocuments).values({
        id,
        organizationId: p.organizationId,
        actorId: p.userId,
        requestKey,
        requestHash,
        source: 'UPLOAD',
        filename: name,
        kind,
        original: bytes,
        sha256,
        size: bytes.length,
        retainUntil: new Date(Date.UTC(new Date().getUTCFullYear() + 9, 0, 1)),
      });
      await this.event(tx, p, id, 'incoming.received');
      await tx.insert(s.outbox).values({
        organizationId: p.organizationId,
        entityId: id,
        eventType: 'incoming.process',
        requestId: p.requestId,
      });
      return id;
    });
  }
  async list(p: Principal, page = 1, problems = false) {
    await authorize(this.db, p, 'incoming:read');
    return this.db
      .select({
        id: s.incomingDocuments.id,
        filename: s.incomingDocuments.filename,
        receivedAt: s.incomingDocuments.receivedAt,
        state: s.incomingDocuments.state,
        validation: s.incomingDocuments.validation,
        supplier: sql<
          string | null
        >`${s.incomingDocuments.parsed}->'supplier'->>'name'`,
        number: sql<string | null>`${s.incomingDocuments.parsed}->>'number'`,
        dueDate: sql<string | null>`${s.incomingDocuments.parsed}->>'dueDate'`,
        payable: sql<
          string | null
        >`${s.incomingDocuments.parsed}->'totals'->>'payable'`,
        currency: sql<
          string | null
        >`${s.incomingDocuments.parsed}->>'currency'`,
        archiveMode: s.incomingDocuments.archiveMode,
      })
      .from(s.incomingDocuments)
      .where(
        and(
          eq(s.incomingDocuments.organizationId, p.organizationId),
          problems
            ? sql`${s.incomingDocuments.validation} IN ('INVALID','UNSUPPORTED','ERROR')`
            : undefined,
        ),
      )
      .orderBy(
        desc(s.incomingDocuments.receivedAt),
        desc(s.incomingDocuments.id),
      )
      .limit(25)
      .offset((z.number().int().min(1).max(10000).parse(page) - 1) * 25);
  }
  async detail(p: Principal, id: string) {
    z.uuid().parse(id);
    await authorize(this.db, p, 'incoming:read');
    const [row] = await this.db
      .select()
      .from(s.incomingDocuments)
      .where(where(p.organizationId, id));
    if (!row)
      throw new AppError('NOT_FOUND', 'Eingangsrechnung nicht gefunden.');
    const checks = await this.db
      .select()
      .from(s.incomingChecks)
      .where(
        and(
          eq(s.incomingChecks.organizationId, p.organizationId),
          eq(s.incomingChecks.incomingId, id),
        ),
      )
      .orderBy(desc(s.incomingChecks.createdAt), desc(s.incomingChecks.id));
    // Original bytes stay server-side; downloads are separately authorized and verified.
    const { original, ...metadata } = row;
    return {
      ...metadata,
      checks,
      rawXml: row.kind === 'xml' ? new TextDecoder().decode(original) : null,
    };
  }
  async download(p: Principal, id: string) {
    z.uuid().parse(id);
    await authorize(this.db, p, 'incoming:read');
    const [row] = await this.db
      .select()
      .from(s.incomingDocuments)
      .where(where(p.organizationId, id));
    if (!row)
      throw new AppError('NOT_FOUND', 'Eingangsrechnung nicht gefunden.');
    const bytes =
      row.objectKey && row.objectVersion
        ? await this.archive.get(row.objectKey, row.objectVersion)
        : row.original;
    if (hashBytes(bytes) !== row.sha256 || bytes.length !== row.size)
      throw new AppError(
        'CONFLICT',
        'Das Original konnte nicht sicher gelesen werden.',
      );
    await this.tx(p, 'incoming:read', (tx) =>
      this.event(tx, p, id, 'incoming.downloaded'),
    );
    return { bytes, kind: row.kind };
  }
  async revalidate(p: Principal, id: string) {
    requireCapability('compliantArchive');
    z.uuid().parse(id);
    return this.tx(p, 'incoming:import', async (tx) => {
      const [row] = await tx
        .select()
        .from(s.incomingDocuments)
        .where(where(p.organizationId, id));
      if (!row)
        throw new AppError('NOT_FOUND', 'Eingangsrechnung nicht gefunden.');
      if (row.state === 'APPROVED')
        throw new AppError(
          'CONFLICT',
          'Die freigegebene Prüfung bleibt unverändert erhalten.',
        );
      if (row.state === 'RECEIVED') return;
      await tx
        .update(s.incomingDocuments)
        .set({ state: 'RECEIVED', validation: 'PENDING', errorCode: null })
        .where(where(p.organizationId, id));
      await this.event(tx, p, id, 'incoming.recheck.requested');
      await tx.insert(s.outbox).values({
        organizationId: p.organizationId,
        entityId: id,
        eventType: 'incoming.process',
        requestId: p.requestId,
      });
    });
  }
  async approve(p: Principal, id: string, checkId: string, reviewed: boolean) {
    requireCapability('compliantArchive');
    z.uuid().parse(id);
    z.uuid().parse(checkId);
    z.literal(true).parse(reviewed);
    await authorize(this.db, p, 'incoming:approve');
    await this.download(p, id); // Reverify exact archived bytes before approval; no storage call in the transaction.
    return this.tx(p, 'incoming:approve', async (tx) => {
      const [row] = await tx
        .select()
        .from(s.incomingDocuments)
        .where(where(p.organizationId, id));
      const [check] = await tx
        .select()
        .from(s.incomingChecks)
        .where(
          and(
            eq(s.incomingChecks.organizationId, p.organizationId),
            eq(s.incomingChecks.incomingId, id),
          ),
        )
        .orderBy(desc(s.incomingChecks.createdAt), desc(s.incomingChecks.id))
        .limit(1);
      if (!row)
        throw new AppError('NOT_FOUND', 'Eingangsrechnung nicht gefunden.');
      if (
        !check ||
        check.id !== checkId ||
        row.validation !== 'VALID' ||
        !row.objectVersion ||
        !row.parsed ||
        !['REVIEW', 'APPROVED'].includes(row.state)
      )
        throw new AppError(
          'CONFLICT',
          'Bitte warten Sie auf eine bestandene aktuelle XML-Prüfung und prüfen Sie den Beleg erneut.',
        );
      if (row.state === 'APPROVED') return;
      await tx
        .update(s.incomingDocuments)
        .set({
          state: 'APPROVED',
          approvedBy: p.userId,
          approvedAt: new Date(),
        })
        .where(where(p.organizationId, id));
      await this.event(tx, p, id, 'incoming.approved');
    });
  }
  async process(organizationId: string, id: string) {
    requireCapability('backgroundProcessing');
    requireCapability('compliantArchive');
    if (process.env.VERCEL === '1') throw new Error('WORKER_ONLY_PROCESSING');
    const connection = await this.pool.connect();
    try {
      await connection.query(
        'SELECT pg_advisory_lock(hashtextextended($1,7))',
        [organizationId + id],
      );
      const [row] = await this.db
        .select()
        .from(s.incomingDocuments)
        .where(where(organizationId, id));
      if (!row || !['RECEIVED', 'ERROR'].includes(row.state)) return;
      const p = {
        organizationId,
        userId: row.actorId,
        requestId: randomUUID(),
      };
      let parsed: ReturnType<typeof parseIncoming> | null = null,
        validation = 'ERROR',
        errorCode: string | null = null,
        issues: Issue[] = [],
        reportHash: string | null = null;
      let archived: Awaited<ReturnType<Archive['put']>> | undefined;
      let retry = false;
      try {
        if (hashBytes(row.original) !== row.sha256)
          throw new Error('INTEGRITY');
        archived = await this.archive.put(
          `${organizationId}/${id}/${row.sha256}.${row.kind}`,
          row.original,
          row.retainUntil,
        );
        const stored = await this.archive.get(archived.key, archived.version);
        if (hashBytes(stored) !== row.sha256 || stored.length !== row.size)
          throw new Error('INTEGRITY');
        try {
          const xml = await extractIncomingXml(
            stored,
            row.kind as 'xml' | 'pdf',
          );
          parsed = parseIncoming(xml);
          if (
            parsed.profile ===
            'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0'
          ) {
            const result = await this.validator.validate(xml);
            if (result.issues.some((i) => i.source === 'SYSTEM'))
              throw new Error('VALIDATOR_UNAVAILABLE');
            validation = result.valid ? 'VALID' : 'INVALID';
            issues = result.issues;
            reportHash = result.reportHash;
          } else validation = 'UNSUPPORTED';
        } catch (error) {
          // Runtime failure can be retried; malformed originals remain intact for review.
          const code = error instanceof Error ? error.message : '';
          if (/VALIDATOR|JAVA|KOSIT|TIMEOUT|BUSY/.test(code)) {
            retry = true;
            throw error;
          }
          validation = 'INVALID';
          errorCode = 'SOURCE_UNREADABLE';
        }
      } catch {
        validation = 'ERROR';
        errorCode = 'PROCESSING_FAILED';
        retry = true;
      }
      await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM organizations WHERE id=${organizationId} FOR UPDATE`,
        );
        await tx.insert(s.incomingChecks).values({
          organizationId,
          incomingId: id,
          validation,
          profileId: manifest.id,
          manifestHash,
          reportHash,
          issues,
          parserVersion,
          errorCode,
        });
        await tx
          .update(s.incomingDocuments)
          .set({
            state: retry ? 'ERROR' : 'REVIEW',
            parsed,
            validation,
            issues,
            parserVersion,
            errorCode,
            profileId: manifest.id,
            manifestHash,
            reportHash,
            ...(archived
              ? {
                  objectKey: archived.key,
                  objectVersion: archived.version,
                  archiveMode: archived.mode,
                }
              : {}),
          })
          .where(where(organizationId, id));
        await this.event(tx, p, id, 'incoming.checked');
      });
      if (retry) throw new Error('INCOMING_RETRY_REQUIRED');
    } finally {
      try {
        await connection.query(
          'SELECT pg_advisory_unlock(hashtextextended($1,7))',
          [organizationId + id],
        );
      } finally {
        connection.release();
      }
    }
  }
}
