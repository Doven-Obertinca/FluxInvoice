import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { outbox, type Database } from '@flux/db';
export type Job = typeof outbox.$inferSelect;
export type Handler = (job: Job) => Promise<void>;
export async function processOne(
  db: Database,
  handlers: Readonly<Record<string, Handler>>,
) {
  const job = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(outbox)
      .where(
        sql`(${outbox.status}='PENDING' AND ${outbox.availableAt}<=now()) OR (${outbox.status}='PROCESSING' AND ${outbox.leaseUntil}<now())`,
      )
      .orderBy(outbox.availableAt)
      .limit(1)
      .for('update', { skipLocked: true });
    if (!row) return null;
    const [leased] = await tx
      .update(outbox)
      .set({
        status: 'PROCESSING',
        leaseUntil: new Date(Date.now() + 180000),
        leaseToken: randomUUID(),
        attempts: row.attempts + 1,
      })
      .where(eq(outbox.id, row.id))
      .returning();
    return leased!;
  });
  if (!job) return false;
  const lease = and(
    eq(outbox.id, job.id),
    eq(outbox.leaseToken, job.leaseToken!),
  );
  try {
    const handler = handlers[job.eventType];
    if (!handler) throw new Error('UNSUPPORTED_EVENT');
    await handler(job);
    await db
      .update(outbox)
      .set({
        status: 'DONE',
        leaseUntil: null,
        leaseToken: null,
        lastErrorCode: null,
      })
      .where(lease);
  } catch {
    await db
      .update(outbox)
      .set({
        status: job.attempts >= 8 ? 'DEAD' : 'PENDING',
        availableAt: new Date(
          Date.now() + Math.min(3600000, 1000 * 2 ** job.attempts),
        ),
        leaseUntil: null,
        leaseToken: null,
        lastErrorCode: handlers[job.eventType]
          ? 'HANDLER_FAILED'
          : 'UNSUPPORTED_EVENT',
      })
      .where(lease);
  }
  return true;
}
