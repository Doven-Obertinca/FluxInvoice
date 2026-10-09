import { and, desc, eq, sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { z } from 'zod';
import * as s from '@flux/db';
import { authorize, type Principal } from '@flux/auth';
import { appendAudit, digest } from '@flux/audit';
import { AppError } from '@flux/shared';
import { assertEditable, calculate, transition } from '@flux/invoice-core';
import {
  manifest,
  profileId,
  semanticIssues,
  toSemantic,
  serializeUbl,
  issue,
  type FrozenInvoice,
  type Party,
} from '@flux/einvoice';
import {
  manifestHash,
  type Validator,
  type ValidationResult,
} from '../../einvoice/src/validator';
import { hashBytes, type Archive, ArchiveError } from '@flux/storage';
import {
  InvoiceService,
  toInput,
  allocateNumber,
  type InvoiceDetail,
} from './index';

export function freeze(detail: InvoiceDetail): FrozenInvoice {
  const party = (kind: string) => {
    const p = detail.parties.find((p) => p.kind === kind);
    if (!p) throw new Error('SNAPSHOT_MISSING');
    return {
      name: p.name,
      email: p.email,
      line1: p.line1,
      city: p.city,
      postalCode: p.postalCode,
      country: p.country,
      vatId: p.vatId,
      taxNumber: p.taxNumber ?? '',
      contactName: p.contactName,
      contactPhone: p.contactPhone,
      iban: p.iban ?? '',
      bic: p.bic ?? '',
    } as Party;
  };
  return {
    input: toInput(detail),
    seller: party('SELLER'),
    buyer: party('BUYER'),
    revision: detail.invoice.revision,
  };
}
export class EinvoiceService {
  private invoices: InvoiceService;
  constructor(
    private readonly db: s.Database,
    private readonly pool: Pool,
    private readonly validator: Validator,
    private readonly archive: Archive,
  ) {
    this.invoices = new InvoiceService(db);
  }
  private scope(p: Principal, id: string) {
    return and(
      eq(s.einvoiceJobs.organizationId, p.organizationId),
      eq(s.einvoiceJobs.id, id),
    );
  }
  private async event(
    tx: s.Transaction,
    p: Principal,
    type: string,
    invoiceId: string,
    metadata: Record<string, string | number | boolean | null> = {},
  ) {
    await appendAudit(tx, {
      organizationId: p.organizationId,
      actorId: p.userId,
      requestId: p.requestId,
      eventType: type,
      entityType: 'invoice',
      entityId: invoiceId,
      metadata,
    });
    await tx.insert(s.outbox).values({
      organizationId: p.organizationId,
      requestId: p.requestId,
      eventType: type,
      entityId: invoiceId,
    });
  }
  async enqueue(
    p: Principal,
    invoiceId: string,
    revision: number,
    kind: 'VALIDATE' | 'FINALIZE',
    key: string,
  ) {
    z.uuid().parse(invoiceId);
    z.uuid().parse(key);
    z.number().int().positive().parse(revision);
    z.enum(['VALIDATE', 'FINALIZE']).parse(kind);
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM organizations WHERE id=${p.organizationId} FOR UPDATE`,
      );
      await authorize(
        tx,
        p,
        kind === 'FINALIZE' ? 'invoice:finalize' : 'invoice:write',
      );
      const operation = `einvoice.${kind.toLowerCase()}`;
      const requestHash = digest({ invoiceId, revision, kind });
      const [prior] = await tx
        .select()
        .from(s.idempotencyKeys)
        .where(
          and(
            eq(s.idempotencyKeys.organizationId, p.organizationId),
            eq(s.idempotencyKeys.operation, operation),
            eq(s.idempotencyKeys.key, key),
          ),
        );
      if (prior) {
        if (prior.actorId !== p.userId || prior.requestHash !== requestHash)
          throw new AppError(
            'CONFLICT',
            'Dieser Vorgangsschlüssel wurde bereits verwendet.',
          );
        return prior.resourceId;
      }
      const detail = await this.invoices.load(tx, p, invoiceId);
      if (detail.invoice.revision !== revision)
        throw new AppError(
          'CONFLICT',
          'Die Rechnung wurde geändert. Bitte neu laden.',
        );
      let [job] = await tx
        .select()
        .from(s.einvoiceJobs)
        .where(
          and(
            eq(s.einvoiceJobs.organizationId, p.organizationId),
            eq(s.einvoiceJobs.invoiceId, invoiceId),
            eq(s.einvoiceJobs.revision, revision),
            eq(s.einvoiceJobs.kind, kind),
          ),
        );
      if (
        job?.state === 'COMPLETED' &&
        kind === 'FINALIZE' &&
        detail.invoice.status === 'FINALIZED'
      ) {
        await tx.insert(s.idempotencyKeys).values({
          organizationId: p.organizationId,
          actorId: p.userId,
          operation,
          key,
          requestHash,
          resourceId: job.id,
        });
        return job.id;
      }
      assertEditable(detail.invoice.status);
      if (!job) {
        if (detail.invoice.finalizationPending)
          throw new AppError('CONFLICT', 'Die Finalisierung läuft bereits.');
        const snapshot = freeze(detail);
        [job] = await tx
          .insert(s.einvoiceJobs)
          .values({
            organizationId: p.organizationId,
            invoiceId,
            revision,
            kind,
            actorId: p.userId,
            requestId: p.requestId,
            profileId,
            snapshotHash: digest(snapshot),
          })
          .returning();
      } else if (job.state === 'FAILED') {
        await tx
          .update(s.einvoiceJobs)
          .set({ state: 'QUEUED', lastErrorCode: null, updatedAt: new Date() })
          .where(this.scope(p, job.id));
      }
      if (!job) throw new Error('JOB_INSERT_FAILED');
      if (kind === 'FINALIZE')
        await tx
          .update(s.invoices)
          .set({ finalizationPending: true })
          .where(
            and(
              eq(s.invoices.organizationId, p.organizationId),
              eq(s.invoices.id, invoiceId),
            ),
          );
      if (job.state !== 'COMPLETED')
        await tx.insert(s.outbox).values({
          organizationId: p.organizationId,
          eventType: 'einvoice.requested',
          entityId: job.id,
          requestId: p.requestId,
        });
      await tx.insert(s.idempotencyKeys).values({
        organizationId: p.organizationId,
        actorId: p.userId,
        operation,
        key,
        requestHash,
        resourceId: job.id,
      });
      await appendAudit(tx, {
        organizationId: p.organizationId,
        actorId: p.userId,
        requestId: p.requestId,
        eventType: `einvoice.${kind.toLowerCase()}.requested`,
        entityType: 'invoice',
        entityId: invoiceId,
        metadata: { revision, jobId: job.id },
      });
      return job.id;
    });
  }
  async history(p: Principal, invoiceId: string) {
    await this.invoices.invoice(p, invoiceId);
    const where = and(
      eq(s.validationRuns.organizationId, p.organizationId),
      eq(s.validationRuns.invoiceId, invoiceId),
    );
    const [runs, jobs, documents, activity] = await Promise.all([
      this.db
        .select()
        .from(s.validationRuns)
        .where(where)
        .orderBy(desc(s.validationRuns.createdAt))
        .limit(50),
      this.db
        .select()
        .from(s.einvoiceJobs)
        .where(
          and(
            eq(s.einvoiceJobs.organizationId, p.organizationId),
            eq(s.einvoiceJobs.invoiceId, invoiceId),
          ),
        )
        .orderBy(desc(s.einvoiceJobs.createdAt))
        .limit(20),
      this.db
        .select()
        .from(s.invoiceDocuments)
        .where(
          and(
            eq(s.invoiceDocuments.organizationId, p.organizationId),
            eq(s.invoiceDocuments.invoiceId, invoiceId),
          ),
        ),
      this.db
        .select({
          id: s.auditEvents.id,
          eventType: s.auditEvents.eventType,
          createdAt: s.auditEvents.timestamp,
        })
        .from(s.auditEvents)
        .where(
          and(
            eq(s.auditEvents.organizationId, p.organizationId),
            eq(s.auditEvents.entityId, invoiceId),
          ),
        )
        .orderBy(desc(s.auditEvents.timestamp))
        .limit(50),
    ]);
    const [check] = documents[0]
      ? await this.db
          .select({ valid: s.documentChecks.valid })
          .from(s.documentChecks)
          .where(
            and(
              eq(s.documentChecks.organizationId, p.organizationId),
              eq(s.documentChecks.documentId, documents[0].id),
            ),
          )
          .orderBy(desc(s.documentChecks.createdAt))
          .limit(1)
      : [];
    return { runs, jobs, documents, activity, integrity: check?.valid };
  }
  private async record(
    tx: s.Transaction,
    p: Principal,
    job: typeof s.einvoiceJobs.$inferSelect,
    result: ValidationResult,
    purpose: string,
  ) {
    const [run] = await tx
      .insert(s.validationRuns)
      .values({
        organizationId: p.organizationId,
        invoiceId: job.invoiceId,
        revision: job.revision,
        profile: manifest.profile,
        profileVersion: manifest.specificationVersion,
        rulesetVersion: manifest.technicalBundleVersion,
        validatorVersion: manifest.validatorVersion,
        cenVersion: manifest.cenVersion,
        manifestHash,
        reportHash: result.reportHash || null,
        candidateHash: result.sha256 || null,
        purpose,
        durationMs: result.durationMs,
        valid: result.valid,
      })
      .returning();
    if (!run) throw new Error('RUN_INSERT_FAILED');
    if (result.issues.length)
      await tx.insert(s.validationIssues).values(
        result.issues.map((i) => ({
          ...i,
          code: i.ruleId,
          organizationId: p.organizationId,
          runId: run.id,
        })),
      );
    return run;
  }
  // Worker only. A PostgreSQL session lock fences duplicate outbox deliveries without
  // holding an open database transaction during validation or object storage I/O.
  async process(organizationId: string, jobId: string) {
    const client = await this.pool.connect();
    let locked = false;
    try {
      const lock = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtextextended($1,7)) AS locked',
        [jobId],
      );
      locked = lock.rows[0]?.locked === true;
      if (!locked) throw new Error('JOB_BUSY');
      let [job] = await this.db
        .select()
        .from(s.einvoiceJobs)
        .where(
          and(
            eq(s.einvoiceJobs.organizationId, organizationId),
            eq(s.einvoiceJobs.id, jobId),
          ),
        );
      if (!job) throw new Error('JOB_NOT_FOUND');
      if (job.state === 'COMPLETED') return;
      const p: Principal = {
        organizationId,
        userId: job.actorId,
        requestId: job.requestId,
      };
      try {
        if (job.profileId !== profileId) throw new Error('PROFILE_UNAVAILABLE');
        const detail = await this.invoices.invoice(p, job.invoiceId);
        const snapshot = freeze(detail);
        if (
          detail.invoice.revision !== job.revision ||
          digest(snapshot) !== job.snapshotHash
        )
          throw new Error('SNAPSHOT_CHANGED');
        const problems = semanticIssues(snapshot);
        const totals = calculate(snapshot.input);
        if (
          totals.net !== detail.invoice.net ||
          totals.tax !== detail.invoice.tax ||
          totals.payable !== detail.invoice.payable ||
          totals.lines.some((l, i) => l.net !== detail.lines[i]?.net)
        )
          problems.push(
            issue(
              'FLUX-INTEGRITY',
              'lines',
              'Die gespeicherten Beträge sind nicht konsistent. Bitte erneut speichern.',
              'INTEGRITY',
            ),
          );
        await this.db
          .update(s.einvoiceJobs)
          .set({
            state: job.number ? 'ARCHIVING' : 'VALIDATING',
            attempts: job.attempts + 1,
            updatedAt: new Date(),
            lastErrorCode: null,
          })
          .where(this.scope(p, job.id));
        const preliminary: ValidationResult = problems.length
          ? {
              valid: false,
              issues: problems,
              sha256: '',
              durationMs: 0,
              reportHash: '',
            }
          : await this.validator.validate(
              serializeUbl(
                toSemantic(snapshot, job.number ?? `DRAFT-${job.invoiceId}`),
              ),
            );
        await this.db.transaction(async (tx) => {
          await this.record(tx, p, job!, preliminary, 'READINESS');
        });
        if (preliminary.issues.some((i) => i.source === 'SYSTEM'))
          throw new Error('VALIDATOR_UNAVAILABLE');
        if (!preliminary.valid) {
          await this.fail(p, job, 'VALIDATION_FAILED');
          return;
        }
        if (job.kind === 'VALIDATE') {
          await this.db.transaction(async (tx) => {
            await tx.execute(
              sql`SELECT id FROM organizations WHERE id=${organizationId} FOR UPDATE`,
            );
            const current = await this.invoices.load(tx, p, job!.invoiceId);
            if (current.invoice.revision !== job!.revision)
              throw new Error('SNAPSHOT_CHANGED');
            if (current.invoice.status === 'DRAFT')
              await tx
                .update(s.invoices)
                .set({ status: 'VALIDATED', updatedAt: new Date() })
                .where(
                  and(
                    eq(s.invoices.organizationId, organizationId),
                    eq(s.invoices.id, job!.invoiceId),
                  ),
                );
            await tx
              .update(s.einvoiceJobs)
              .set({ state: 'COMPLETED', updatedAt: new Date() })
              .where(this.scope(p, job!.id));
            await this.event(tx, p, 'einvoice.validated', job!.invoiceId, {
              revision: job!.revision,
              valid: true,
            });
          });
          return;
        }
        if (!job.number) {
          job = await this.db.transaction(async (tx) => {
            await tx.execute(
              sql`SELECT id FROM organizations WHERE id=${organizationId} FOR UPDATE`,
            );
            const current = await this.invoices.load(tx, p, job!.invoiceId);
            if (
              !current.invoice.finalizationPending ||
              current.invoice.revision !== job!.revision
            )
              throw new Error('SNAPSHOT_CHANGED');
            if (current.invoice.status === 'DRAFT')
              await tx
                .update(s.invoices)
                .set({
                  status: transition('DRAFT', 'VALIDATED'),
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(s.invoices.organizationId, organizationId),
                    eq(s.invoices.id, job!.invoiceId),
                  ),
                );
            const number = await allocateNumber(
              tx,
              organizationId,
              Number(snapshot.input.issueDate.slice(0, 4)),
            );
            const year = Math.max(
              new Date().getUTCFullYear(),
              Number(snapshot.input.issueDate.slice(0, 4)),
            );
            const [updated] = await tx
              .update(s.einvoiceJobs)
              .set({
                number,
                retentionUntil: new Date(Date.UTC(year + 9, 0, 1)),
                state: 'ARCHIVING',
                updatedAt: new Date(),
              })
              .where(this.scope(p, job!.id))
              .returning();
            return updated!;
          });
        }
        const bytes = serializeUbl(toSemantic(snapshot, job.number!));
        const result = await this.validator.validate(bytes);
        const run = await this.db.transaction((tx) =>
          this.record(tx, p, job!, result, 'ISSUANCE'),
        );
        if (!result.valid) throw new Error('ISSUANCE_VALIDATION_FAILED');
        const hash = hashBytes(bytes);
        if (hash !== result.sha256) throw new Error('VALIDATION_HASH_MISMATCH');
        const key = `${organizationId}/${job.id}/${hash}.xml`;
        await this.db
          .update(s.einvoiceJobs)
          .set({
            candidateHash: hash,
            objectKey: key,
            state: 'ARCHIVING',
            updatedAt: new Date(),
          })
          .where(this.scope(p, job.id));
        const archived = await this.archive.put(
          key,
          bytes,
          job.retentionUntil!,
        );
        const readback = await this.archive.get(archived.key, archived.version);
        if (
          hashBytes(readback) !== hash ||
          archived.sha256 !== hash ||
          archived.size !== bytes.length ||
          !readback.equals(bytes)
        )
          throw new ArchiveError('ARCHIVE_INTEGRITY');
        await this.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT id FROM organizations WHERE id=${organizationId} FOR UPDATE`,
          );
          const current = await this.invoices.load(tx, p, job!.invoiceId);
          if (
            current.invoice.revision !== job!.revision ||
            digest(freeze(current)) !== job!.snapshotHash ||
            !current.invoice.finalizationPending
          )
            throw new Error('SNAPSHOT_CHANGED');
          await tx
            .update(s.einvoiceJobs)
            .set({ objectVersion: archived.version, updatedAt: new Date() })
            .where(this.scope(p, job!.id));
          await tx.insert(s.invoiceDocuments).values({
            organizationId,
            invoiceId: job!.invoiceId,
            jobId: job!.id,
            validationRunId: run.id,
            manifestHash,
            archiveMode: archived.mode,
            objectKey: key,
            objectVersion: archived.version,
            sha256: hash,
            size: BigInt(bytes.length),
            mimeType: 'application/xml',
            profile: manifest.profile,
            profileVersion: manifest.specificationVersion,
            rulesetVersion: manifest.technicalBundleVersion,
            retentionPolicyVersion: 'DE-INVOICE-8Y-CALENDAR-1',
            retainUntil: job!.retentionUntil!,
          });
          await tx
            .update(s.invoices)
            .set({
              status: transition(current.invoice.status, 'FINALIZED'),
              number: job!.number,
              finalizedAt: new Date(),
              finalizationPending: false,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(s.invoices.organizationId, organizationId),
                eq(s.invoices.id, job!.invoiceId),
              ),
            );
          await tx
            .update(s.einvoiceJobs)
            .set({
              state: 'COMPLETED',
              lastErrorCode: null,
              updatedAt: new Date(),
            })
            .where(this.scope(p, job!.id));
          await this.event(tx, p, 'invoice.finalized', job!.invoiceId, {
            jobId: job!.id,
            sha256: hash,
            profileId,
            archiveMode: archived.mode,
          });
        });
      } catch (error) {
        const [fresh] = await this.db
          .select()
          .from(s.einvoiceJobs)
          .where(this.scope(p, jobId));
        if (fresh && fresh.state !== 'COMPLETED')
          await this.fail(
            p,
            fresh,
            error instanceof ArchiveError
              ? error.code
              : error instanceof Error &&
                  [
                    'SNAPSHOT_CHANGED',
                    'PROFILE_UNAVAILABLE',
                    'VALIDATOR_UNAVAILABLE',
                    'ISSUANCE_VALIDATION_FAILED',
                  ].includes(error.message)
                ? error.message
                : 'FINALIZATION_FAILED',
          );
        throw new Error('EINVOICE_RETRY_REQUIRED', { cause: error });
      }
    } finally {
      try {
        if (locked)
          await client.query(
            'SELECT pg_advisory_unlock(hashtextextended($1,7))',
            [jobId],
          );
      } finally {
        client.release();
      }
    }
  }
  private async fail(
    p: Principal,
    job: typeof s.einvoiceJobs.$inferSelect,
    code: string,
  ) {
    await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM organizations WHERE id=${p.organizationId} FOR UPDATE`,
      );
      await tx
        .update(s.einvoiceJobs)
        .set({ state: 'FAILED', lastErrorCode: code, updatedAt: new Date() })
        .where(this.scope(p, job.id));
      if (
        job.kind === 'FINALIZE' &&
        !job.number &&
        code === 'VALIDATION_FAILED'
      )
        await tx
          .update(s.invoices)
          .set({ finalizationPending: false })
          .where(
            and(
              eq(s.invoices.organizationId, p.organizationId),
              eq(s.invoices.id, job.invoiceId),
            ),
          );
      await this.event(tx, p, 'einvoice.failed', job.invoiceId, {
        jobId: job.id,
        code,
      });
    });
  }
  async download(p: Principal, documentId: string) {
    z.uuid().parse(documentId);
    await authorize(this.db, p, 'read');
    const [document] = await this.db
      .select()
      .from(s.invoiceDocuments)
      .where(
        and(
          eq(s.invoiceDocuments.organizationId, p.organizationId),
          eq(s.invoiceDocuments.id, documentId),
        ),
      );
    if (!document) throw new AppError('NOT_FOUND', 'Dokument nicht gefunden.');
    let bytes: Buffer;
    try {
      bytes = await this.archive.get(
        document.objectKey,
        document.objectVersion,
      );
      if (
        hashBytes(bytes) !== document.sha256 ||
        BigInt(bytes.length) !== document.size
      )
        throw new ArchiveError('ARCHIVE_INTEGRITY');
    } catch {
      await this.db.insert(s.documentChecks).values({
        organizationId: p.organizationId,
        documentId,
        valid: false,
        reason: 'ARCHIVE_INTEGRITY',
      });
      throw new AppError(
        'CONFLICT',
        'Das archivierte Dokument konnte nicht sicher geprüft werden. Bitte wenden Sie sich an den Support.',
      );
    }
    await this.db.transaction(async (tx) => {
      await tx.insert(s.documentChecks).values({
        organizationId: p.organizationId,
        documentId,
        valid: true,
        reason: 'SHA256_VERIFIED',
      });
      await this.event(tx, p, 'document.downloaded', document.invoiceId, {
        documentId,
        sha256: document.sha256,
      });
    });
    const detail = await this.invoices.invoice(p, document.invoiceId);
    return {
      bytes,
      filename: `${(detail.invoice.number ?? 'Rechnung').replace(/[^A-Za-z0-9_-]/g, '_')}.xml`,
    };
  }
}
