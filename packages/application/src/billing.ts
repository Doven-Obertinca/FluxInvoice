import { and, eq, sql } from 'drizzle-orm';
import { authorize, type Principal } from '@flux/auth';
import * as s from '@flux/db';
import { AppError, PLANS, type PlanId } from '@flux/shared';

/** PostgreSQL time is authoritative; quotas use German calendar months. */
async function context(tx: s.Transaction, organizationId: string) {
  const clock = await tx.execute<{ period: string; now: Date }>(sql`
    SELECT to_char(statement_timestamp() AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-01') AS period,
      statement_timestamp() AS now`);
  const { period, now } = clock.rows[0]!;
  const [subscription] = await tx
    .select()
    .from(s.subscriptions)
    .where(eq(s.subscriptions.organizationId, organizationId));
  const active =
    subscription?.status === 'ACTIVE' &&
    subscription.periodStart &&
    subscription.periodEnd &&
    new Date(subscription.periodStart) <= new Date(now) &&
    new Date(subscription.periodEnd) > new Date(now);
  const plan: PlanId = active ? subscription.plan : 'FREE';
  return {
    period,
    now: new Date(now),
    plan,
    limit: PLANS[plan].monthlyInvoiceLimit,
  };
}

/** Internal primitive: caller must hold the organization mutation lock and authorize. */
export async function reserveInvoiceUsage(
  tx: s.Transaction,
  organizationId: string,
  invoiceId: string,
) {
  const c = await context(tx, organizationId);
  const [prior] = await tx
    .select()
    .from(s.invoiceUsage)
    .where(
      and(
        eq(s.invoiceUsage.organizationId, organizationId),
        eq(s.invoiceUsage.invoiceId, invoiceId),
      ),
    );
  if (
    prior?.state === 'CONSUMED' ||
    (prior?.state === 'RESERVED' && prior.period === c.period)
  )
    return c;
  const [count] = await tx
    .select({ used: sql<number>`count(*)::int` })
    .from(s.invoiceUsage)
    .where(
      and(
        eq(s.invoiceUsage.organizationId, organizationId),
        eq(s.invoiceUsage.period, c.period),
        sql`${s.invoiceUsage.state} IN ('RESERVED','CONSUMED')`,
      ),
    );
  if (count!.used >= c.limit)
    throw new AppError(
      'RATE_LIMIT',
      `Ihr Monatslimit von ${c.limit} Rechnungen ist erreicht. Entwürfe und Downloads bleiben verfügbar. Vergleichen Sie die Tarife oder warten Sie auf den nächsten Monat.`,
    );
  await tx
    .insert(s.invoiceUsage)
    .values({ organizationId, invoiceId, period: c.period, state: 'RESERVED' })
    .onConflictDoUpdate({
      target: s.invoiceUsage.invoiceId,
      set: { period: c.period, state: 'RESERVED' },
    });
  return c;
}

export async function consumeInvoiceUsage(
  tx: s.Transaction,
  organizationId: string,
  invoiceId: string,
) {
  const c = await reserveInvoiceUsage(tx, organizationId, invoiceId);
  await tx
    .update(s.invoiceUsage)
    .set({ state: 'CONSUMED', consumedAt: c.now })
    .where(
      and(
        eq(s.invoiceUsage.organizationId, organizationId),
        eq(s.invoiceUsage.invoiceId, invoiceId),
        eq(s.invoiceUsage.state, 'RESERVED'),
      ),
    );
  const [count] = await tx
    .select({ used: sql<number>`count(*)::int` })
    .from(s.invoiceUsage)
    .where(
      and(
        eq(s.invoiceUsage.organizationId, organizationId),
        eq(s.invoiceUsage.period, c.period),
        eq(s.invoiceUsage.state, 'CONSUMED'),
      ),
    );
  return { finalizedAt: c.now, plan: c.plan, used: count!.used };
}

export async function releaseInvoiceUsage(
  tx: s.Transaction,
  organizationId: string,
  invoiceId: string,
) {
  await tx
    .update(s.invoiceUsage)
    .set({ state: 'RELEASED' })
    .where(
      and(
        eq(s.invoiceUsage.organizationId, organizationId),
        eq(s.invoiceUsage.invoiceId, invoiceId),
        eq(s.invoiceUsage.state, 'RESERVED'),
      ),
    );
}

export class BillingService {
  constructor(private readonly db: s.Database) {}
  async usage(p: Principal) {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM organizations WHERE id=${p.organizationId} FOR UPDATE`,
      );
      await authorize(tx, p, 'read');
      const c = await context(tx, p.organizationId);
      const [counts] = await tx
        .select({
          used: sql<number>`count(*) FILTER (WHERE state='CONSUMED')::int`,
          reserved: sql<number>`count(*) FILTER (WHERE state='RESERVED')::int`,
        })
        .from(s.invoiceUsage)
        .where(
          and(
            eq(s.invoiceUsage.organizationId, p.organizationId),
            eq(s.invoiceUsage.period, c.period),
          ),
        );
      return { plan: c.plan, period: c.period, limit: c.limit, ...counts! };
    });
  }
}
