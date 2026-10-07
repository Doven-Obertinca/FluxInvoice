import 'dotenv/config';
import { resolve } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import * as s from '@flux/db';
import { environment } from '@flux/shared';
import { complianceRuntime } from '../packages/application/src/runtime';
import { hashBytes } from '@flux/storage';
const { db, pool } = s.connect(environment().DATABASE_URL);
const { archive } = complianceRuntime(resolve('.'));
const retry = process.argv.includes('--retry-failed');
let missing = 0,
  verified = 0,
  requeued = 0,
  pending = 0;
try {
  // Read-only audit by default, except append-only integrity observations. Never
  // delete objects: a job may have uploaded successfully before its SQL commit.
  let cursor = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const docs = await db
      .select()
      .from(s.invoiceDocuments)
      .where(sql`${s.invoiceDocuments.id}>${cursor}`)
      .orderBy(s.invoiceDocuments.id)
      .limit(100);
    if (!docs.length) break;
    for (const doc of docs) {
      let valid = false;
      try {
        const bytes = await archive.get(doc.objectKey, doc.objectVersion);
        valid =
          hashBytes(bytes) === doc.sha256 && BigInt(bytes.length) === doc.size;
      } catch {}
      await db.insert(s.documentChecks).values({
        organizationId: doc.organizationId,
        documentId: doc.id,
        valid,
        reason: valid
          ? 'RECONCILE_SHA256_VERIFIED'
          : 'RECONCILE_ARCHIVE_FAILURE',
      });
      if (valid) verified++;
      else missing++;
      cursor = doc.id;
    }
  }
  const jobs = await db
    .select()
    .from(s.einvoiceJobs)
    .where(
      sql`${s.einvoiceJobs.state}<>'COMPLETED' AND ${s.einvoiceJobs.updatedAt}<now()-interval '5 minutes'`,
    )
    .limit(500);
  for (const job of jobs) {
    pending++;
    if (
      !retry ||
      ['VALIDATION_FAILED', 'SNAPSHOT_CHANGED', 'PROFILE_UNAVAILABLE'].includes(
        job.lastErrorCode ?? '',
      )
    )
      continue;
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM organizations WHERE id=${job.organizationId} FOR UPDATE`,
      );
      const [active] = await tx
        .select({ id: s.outbox.id })
        .from(s.outbox)
        .where(
          and(
            eq(s.outbox.organizationId, job.organizationId),
            eq(s.outbox.entityId, job.id),
            eq(s.outbox.eventType, 'einvoice.requested'),
            sql`${s.outbox.status} IN ('PENDING','PROCESSING')`,
          ),
        );
      if (active) return;
      await tx.insert(s.outbox).values({
        organizationId: job.organizationId,
        entityId: job.id,
        eventType: 'einvoice.requested',
        requestId: job.requestId,
      });
      requeued++;
    });
  }
  console.log(
    JSON.stringify({
      operation: 'archive.reconcile',
      verified,
      missing,
      pending,
      requeued,
      retry,
    }),
  );
  if (missing) process.exitCode = 1;
} finally {
  await pool.end();
}
