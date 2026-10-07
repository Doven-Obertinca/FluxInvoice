import { createHash, randomUUID } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { auditEvents, type Transaction } from '@flux/db';
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return (
      '{' +
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  throw new Error('Unsupported canonical value');
}
export const digest = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
type Row = typeof auditEvents.$inferSelect;
function hashable(row: Omit<Row, 'eventHash'>) {
  return {
    ...row,
    timestamp: row.timestamp.toISOString(),
    sequence: row.sequence.toString(),
  };
}
export async function appendAudit(
  tx: Transaction,
  input: Pick<
    Row,
    | 'organizationId'
    | 'actorId'
    | 'eventType'
    | 'entityType'
    | 'entityId'
    | 'requestId'
    | 'metadata'
  >,
) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.organizationId}, 1))`,
  );
  const [last] = await tx
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.organizationId, input.organizationId))
    .orderBy(desc(auditEvents.sequence))
    .limit(1);
  const row = {
    ...input,
    id: randomUUID(),
    timestamp: new Date(),
    sequence: (last?.sequence ?? 0n) + 1n,
    previousHash: last?.eventHash ?? null,
  };
  const eventHash = digest(hashable(row));
  await tx.insert(auditEvents).values({ ...row, eventHash });
  return eventHash;
}
export function verifyChain(rows: Row[], expectedHead?: string) {
  let previous: string | null = null;
  let sequence = 1n;
  const organization = rows[0]?.organizationId;
  for (const { eventHash, ...row } of rows) {
    if (
      row.organizationId !== organization ||
      row.sequence !== sequence ||
      row.previousHash !== previous ||
      digest(hashable(row)) !== eventHash
    )
      return false;
    previous = eventHash;
    sequence++;
  }
  return expectedHead === undefined || expectedHead === previous;
}
