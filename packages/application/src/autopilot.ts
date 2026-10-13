import { buildFinancialDigest } from './financial-digest';
import { FINANCIAL_OPERATIONS } from './financial-execution';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '@flux/db';
import { authorize, type Principal, type Permission } from '@flux/auth';
import { appendAudit, digest } from '@flux/audit';
import { AppError } from '@flux/shared';
import Decimal from 'decimal.js';
import {
  expenseAnomaly,
  evaluate,
  localDay,
  addDays,
  validDay,
  duplicateSignal,
  paymentBehavior,
  type Fact,
  type Candidate,
} from './financial-rules';

const prepareRules = [
  'INVOICE_REQUIRES_REVIEW',
  'DELIVERY_FAILED',
  'PAYMENT_DUE_SOON',
] as const;
const active = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'];
export class AutopilotService {
  constructor(private readonly db: s.Database) {}
  private async transaction<T>(
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
  private async activity(
    tx: s.Transaction,
    p: Principal,
    action: typeof s.financialActions.$inferSelect | null,
    operation: string,
    facts: Record<string, string | number | boolean | null> = {},
  ) {
    await tx.insert(s.financialActivity).values({
      organizationId: p.organizationId,
      actorId: p.userId,
      actionId: action?.id,
      operation,
      rule: action?.rule,
      ruleVersion: action?.ruleVersion,
      facts,
    });
    await appendAudit(tx, {
      organizationId: p.organizationId,
      actorId: p.userId,
      requestId: p.requestId,
      entityType: 'financial_action',
      entityId: action?.id ?? p.organizationId,
      eventType: `autopilot.${operation}`,
      metadata: {
        rule: action?.rule ?? null,
        version: action?.ruleVersion ?? null,
        factsHash: digest(facts),
      },
    });
  }
  private async fact(
    tx: s.Transaction,
    organizationId: string,
    kind: 'invoice' | 'incoming',
    id: string,
  ): Promise<Fact | null> {
    const base: Fact = {
      id,
      kind,
      number: '',
      amount: null,
      currency: 'EUR',
      issueDay: '',
      dueDay: null,
      paidDay: null,
      settled: false,
      issued: false,
      customerId: null,
      validationFailed: false,
      needsReview: false,
      processingFailed: false,
      deliveryFailed: false,
      deliveryReason: null,
      supplierKey: null,
      supplierName: '',
      hash: null,
      revision: 0,
      approved: false,
      discountDay: null,
      discountRate: null,
      discountBase: null,
      duplicateOf: null,
    };
    if (kind === 'invoice') {
      const [i] = await tx
        .select()
        .from(s.invoices)
        .where(
          and(
            eq(s.invoices.organizationId, organizationId),
            eq(s.invoices.id, id),
          ),
        );
      if (!i) return null;
      Object.assign(base, {
        number: i.number ?? 'Entwurf',
        amount: i.payable,
        currency: i.currency,
        issueDay: i.issueDate,
        dueDay: i.dueDate,
        settled: ['PAID', 'CANCELLED', 'CREDITED'].includes(i.status),
        issued: ['FINALIZED', 'SENT', 'PAID', 'OVERDUE'].includes(i.status),
        customerId: i.customerId,
        revision: i.revision,
      });
      const [run] = await tx
        .select()
        .from(s.validationRuns)
        .where(
          and(
            eq(s.validationRuns.organizationId, organizationId),
            eq(s.validationRuns.invoiceId, id),
            eq(s.validationRuns.revision, i.revision),
            eq(s.validationRuns.profile, 'XRECHNUNG'),
          ),
        )
        .orderBy(desc(s.validationRuns.createdAt), desc(s.validationRuns.id))
        .limit(1);
      const [job] = await tx
        .select()
        .from(s.einvoiceJobs)
        .where(
          and(
            eq(s.einvoiceJobs.organizationId, organizationId),
            eq(s.einvoiceJobs.invoiceId, id),
            eq(s.einvoiceJobs.revision, i.revision),
          ),
        )
        .orderBy(desc(s.einvoiceJobs.createdAt))
        .limit(1);
      base.validationFailed =
        !base.issued &&
        run?.valid === false &&
        !['QUEUED', 'VALIDATING', 'ARCHIVING'].includes(job?.state ?? '');
      base.processingFailed =
        !base.issued &&
        job?.state === 'FAILED' &&
        job.lastErrorCode !== 'VALIDATION_FAILED';
      const [delivery] = await tx
        .select()
        .from(s.invoiceDeliveries)
        .where(
          and(
            eq(s.invoiceDeliveries.organizationId, organizationId),
            eq(s.invoiceDeliveries.invoiceId, id),
          ),
        )
        .orderBy(
          desc(s.invoiceDeliveries.createdAt),
          desc(s.invoiceDeliveries.id),
        )
        .limit(1);
      base.deliveryFailed = ['FAILED', 'BOUNCED'].includes(
        delivery?.status ?? '',
      );
      base.deliveryReason = delivery?.errorCode ?? null;
    } else {
      // Explicit projection: never load original document bytes for a financial brief.
      const [i] = await tx
        .select({
          parsed: s.incomingDocuments.parsed,
          state: s.incomingDocuments.state,
          validation: s.incomingDocuments.validation,
          hash: s.incomingDocuments.sha256,
        })
        .from(s.incomingDocuments)
        .where(
          and(
            eq(s.incomingDocuments.organizationId, organizationId),
            eq(s.incomingDocuments.id, id),
          ),
        );
      if (!i) return null;
      Object.assign(base, {
        number: i.parsed?.number ?? '',
        amount: i.parsed?.totals.payable ?? null,
        currency: i.parsed?.currency ?? '',
        issueDay: i.parsed?.issueDate ?? '',
        dueDay: i.parsed?.dueDate ?? null,
        approved: i.state === 'APPROVED',
        needsReview: i.state === 'REVIEW',
        processingFailed: i.state === 'ERROR',
        validationFailed: i.validation === 'INVALID',
        supplierKey:
          i.parsed?.supplier.vatId ||
          i.parsed?.supplier.name.trim().toLowerCase() ||
          null,
        supplierName: i.parsed?.supplier.name ?? '',
        hash: i.hash,
      });
      const [terms] = await tx
        .select()
        .from(s.incomingFinancialTerms)
        .where(
          and(
            eq(s.incomingFinancialTerms.organizationId, organizationId),
            eq(s.incomingFinancialTerms.incomingId, id),
          ),
        );
      if (terms)
        Object.assign(base, {
          dueDay: terms.dueDay ?? base.dueDay,
          discountDay: terms.discountDay,
          discountRate: terms.discountRate,
          discountBase: terms.discountBase,
        });
      const [decision] = await tx
        .select()
        .from(s.incomingDuplicateDecisions)
        .where(
          and(
            eq(s.incomingDuplicateDecisions.organizationId, organizationId),
            eq(s.incomingDuplicateDecisions.incomingId, id),
            eq(s.incomingDuplicateDecisions.decision, 'DUPLICATE'),
          ),
        )
        .orderBy(desc(s.incomingDuplicateDecisions.createdAt))
        .limit(1);
      base.duplicateOf = decision?.otherId ?? null;
    }
    const [paid] = await tx
      .select()
      .from(s.paymentObservations)
      .where(
        and(
          eq(s.paymentObservations.organizationId, organizationId),
          eq(s.paymentObservations.entityType, kind),
          eq(s.paymentObservations.entityId, id),
          sql`${s.paymentObservations.reversedAt} IS NULL`,
        ),
      )
      .limit(1);
    if (paid) {
      base.settled = true;
      base.paidDay = paid.paidDay;
    }
    if (base.amount && !/^\d{1,16}(\.\d{1,2})?$/.test(base.amount))
      base.amount = null;
    if (base.dueDay && !validDay(base.dueDay)) base.dueDay = null;
    return base;
  }
  /** Worker-only entry. Tenant comes from persisted outbox/reconciliation rows. */
  async reconcile(
    organizationId: string,
    kind: 'invoice' | 'incoming',
    id: string,
  ) {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM organizations WHERE id=${organizationId} FOR UPDATE`,
      );
      await this.project(tx, organizationId, kind, id);
    });
  }
  private async project(
    tx: s.Transaction,
    organizationId: string,
    kind: 'invoice' | 'incoming',
    id: string,
  ) {
    const f = await this.fact(tx, organizationId, kind, id);
    if (!f) return;
    const today = localDay(new Date());
    const fingerprint = digest(f);
    await tx
      .insert(s.financialSources)
      .values({
        organizationId,
        entityType: kind,
        entityId: id,
        customerId: f.customerId,
        supplierKey: f.supplierKey,
        fingerprint: f.hash,
        data: f,
      })
      .onConflictDoUpdate({
        target: [
          s.financialSources.organizationId,
          s.financialSources.entityType,
          s.financialSources.entityId,
        ],
        set: {
          customerId: f.customerId,
          supplierKey: f.supplierKey,
          fingerprint: f.hash,
          data: f,
          updatedAt: new Date(),
        },
      });
    const candidates = evaluate(f, today);
    if (f.customerId) {
      const samples = await tx
        .select({ data: s.financialSources.data })
        .from(s.financialSources)
        .where(
          and(
            eq(s.financialSources.organizationId, organizationId),
            eq(s.financialSources.customerId, f.customerId),
            sql`${s.financialSources.data}->>'paidDay' IS NOT NULL`,
          ),
        )
        .orderBy(sql`${s.financialSources.data}->>'paidDay' DESC`)
        .limit(250);
      const metrics = paymentBehavior(samples.map((x) => x.data));
      if (metrics.deteriorating && !f.settled && f.issued)
        candidates.push({
          rule: 'CUSTOMER_PAYMENT_BEHAVIOR_CHANGED',
          version: '1',
          severity: 'ATTENTION',
          title: 'Dieser Kunde zahlt zuletzt langsamer',
          reason: `Die letzten drei bestätigten Zahlungen dauerten durchschnittlich ${metrics.recentAverage!.toFixed(1)} Tage. Davor waren es ${metrics.previousAverage!.toFixed(1)} Tage (${metrics.sampleSize} bekannte Zahlungen).`,
          recommendation:
            'Offene Zahlungsfristen im Blick behalten. Vergangene Zahlungen sind keine Vorhersage.',
          facts: {
            sampleSize: metrics.sampleSize,
            recentAverage: metrics.recentAverage,
            previousAverage: metrics.previousAverage,
          },
          amount: f.amount,
          dueDay: f.dueDay,
          mandatory: false,
          relatedId: null,
        });
    }
    if (kind === 'incoming') {
      const peers = await tx
        .select()
        .from(s.financialSources)
        .where(
          and(
            eq(s.financialSources.organizationId, organizationId),
            eq(s.financialSources.entityType, 'incoming'),
            sql`${s.financialSources.entityId} <> ${id}`,
            sql`(${s.financialSources.fingerprint}=${f.hash} OR ${s.financialSources.supplierKey}=${f.supplierKey})`,
          ),
        )
        .orderBy(asc(s.financialSources.entityId))
        .limit(100);
      const unusual = expenseAnomaly(
        f,
        peers.map((p) => p.data),
      );
      if (unusual) candidates.push(unusual);
      for (const peer of peers) {
        if (id > peer.entityId) continue;
        const signal = duplicateSignal(f, peer.data);
        if (!signal) continue;
        const pairHash = digest([f.hash, peer.data.hash]);
        const [decision] = await tx
          .select()
          .from(s.incomingDuplicateDecisions)
          .where(
            and(
              eq(s.incomingDuplicateDecisions.organizationId, organizationId),
              eq(s.incomingDuplicateDecisions.incomingId, id),
              eq(s.incomingDuplicateDecisions.otherId, peer.entityId),
              eq(s.incomingDuplicateDecisions.fingerprint, pairHash),
            ),
          )
          .limit(1);
        if (!decision)
          candidates.push({
            rule: signal,
            version: '1',
            severity: 'WARNING',
            title: 'Möglicherweise doppelte Eingangsrechnung',
            reason:
              signal === 'EXACT_DUPLICATE'
                ? 'Die Originaldateien haben denselben SHA-256-Hash.'
                : 'Lieferant und Rechnungsnummer stimmen überein. Bitte vergleichen Sie die Originale.',
            recommendation:
              'Beide Originale vergleichen und die Zuordnung bestätigen.',
            facts: {
              number: f.number,
              otherNumber: peer.data.number,
              signal,
              pairHash,
            },
            amount: f.amount,
            dueDay: f.dueDay,
            mandatory: false,
            relatedId: peer.entityId,
          });
      }
    }
    const old = await tx
      .select()
      .from(s.financialActions)
      .where(
        and(
          eq(s.financialActions.organizationId, organizationId),
          eq(s.financialActions.entityType, kind),
          eq(s.financialActions.entityId, id),
        ),
      );
    const policy = (
      await tx
        .select()
        .from(s.autopilotPolicies)
        .where(eq(s.autopilotPolicies.organizationId, organizationId))
    )[0];
    const keys = new Set<string>();
    for (const c of candidates) {
      c.facts = { ...c.facts, evaluationDay: today };
      const key = `${kind}:${id}:${c.rule}:${c.relatedId ?? ''}`;
      keys.add(key);
      const prior = old.find((a) => a.deduplicationKey === key);
      const status =
        prior &&
        prior.fingerprint === fingerprint &&
        !['RESOLVED', 'SUPERSEDED'].includes(prior.status)
          ? prior.status
          : 'OPEN';
      const [action] = await tx
        .insert(s.financialActions)
        .values({
          organizationId,
          entityType: kind,
          entityId: id,
          deduplicationKey: key,
          fingerprint,
          ...c,
          ruleVersion: c.version,
          status,
        })
        .onConflictDoUpdate({
          target: [
            s.financialActions.organizationId,
            s.financialActions.deduplicationKey,
          ],
          set: {
            ...c,
            ruleVersion: c.version,
            fingerprint,
            status,
            updatedAt: new Date(),
            resolvedAt: null,
            resolution: null,
            snoozedUntil:
              prior?.fingerprint === fingerprint ? prior.snoozedUntil : null,
          },
        })
        .returning();
      const p = {
        organizationId,
        userId: 'SYSTEM_AUTOPILOT',
        requestId: crypto.randomUUID(),
      };
      if (
        !prior ||
        prior.fingerprint !== fingerprint ||
        ['RESOLVED', 'SUPERSEDED'].includes(prior.status)
      )
        await this.activity(tx, p, action!, 'detected', c.facts);
      if (
        status === 'OPEN' &&
        policy?.mode === 'AUTOPILOT' &&
        FINANCIAL_OPERATIONS.checklist.automatic &&
        prepareRules.includes(c.rule as (typeof prepareRules)[number]) &&
        policy.prepareRules.includes(c.rule)
      ) {
        await tx
          .update(s.financialActions)
          .set({ status: 'IN_PROGRESS' })
          .where(eq(s.financialActions.id, action!.id));
        await this.activity(tx, p, action!, 'checklist_prepared', {
          ...c.facts,
          checklist: c.recommendation,
        });
      }
    }
    for (const a of old)
      if (!keys.has(a.deduplicationKey) && active.includes(a.status)) {
        const status =
          f.settled ||
          (kind === 'incoming' &&
            f.approved &&
            a.rule === 'INVOICE_REQUIRES_REVIEW')
            ? 'RESOLVED'
            : 'SUPERSEDED';
        await tx
          .update(s.financialActions)
          .set({
            status,
            resolvedAt: new Date(),
            resolution: 'SOURCE_CHANGED',
            updatedAt: new Date(),
          })
          .where(eq(s.financialActions.id, a.id));
        await this.activity(
          tx,
          {
            organizationId,
            userId: 'SYSTEM_AUTOPILOT',
            requestId: crypto.randomUUID(),
          },
          a,
          status.toLowerCase(),
          { sourceFingerprint: fingerprint },
        );
      }
    await tx
      .delete(s.financialDeadlines)
      .where(
        and(
          eq(s.financialDeadlines.organizationId, organizationId),
          eq(s.financialDeadlines.entityType, kind),
          eq(s.financialDeadlines.entityId, id),
        ),
      );
    for (const [deadline, dueDay] of [
      ['PAYMENT', f.dueDay],
      ['SKONTO', f.discountDay],
    ] as const)
      if (dueDay && !f.settled)
        await tx.insert(s.financialDeadlines).values({
          organizationId,
          entityType: kind,
          entityId: id,
          kind: deadline,
          dueDay,
        });
    if (f.customerId) {
      const samples = await tx
        .select({ data: s.financialSources.data })
        .from(s.financialSources)
        .where(
          and(
            eq(s.financialSources.organizationId, organizationId),
            eq(s.financialSources.customerId, f.customerId),
            sql`${s.financialSources.data}->>'paidDay' IS NOT NULL`,
          ),
        )
        .orderBy(sql`${s.financialSources.data}->>'paidDay' DESC`)
        .limit(250);
      await tx
        .insert(s.customerPaymentMetrics)
        .values({
          organizationId,
          customerId: f.customerId,
          data: paymentBehavior(samples.map((x) => x.data)),
        })
        .onConflictDoUpdate({
          target: s.customerPaymentMetrics.customerId,
          set: {
            data: paymentBehavior(samples.map((x) => x.data)),
            updatedAt: new Date(),
          },
        });
    }
    await this.summarize(tx, organizationId, today);
  }
  private async summarize(
    tx: s.Transaction,
    organizationId: string,
    today: string,
  ) {
    const result = await tx.execute<{
      receivables7: string;
      receivables30: string;
      payables7: string;
      payables30: string;
      overdue: string;
    }>(sql`
      WITH eligible AS (SELECT entity_type, (data->>'amount')::numeric amount, data->>'dueDay' due FROM financial_sources WHERE organization_id=${organizationId} AND data->>'currency'='EUR' AND data->>'settled'='false' AND data->>'duplicateOf' IS NULL AND data->>'amount' ~ '^\\d{1,16}(\\.\\d{1,2})?$' AND ((entity_type='invoice' AND data->>'issued'='true') OR (entity_type='incoming' AND data->>'approved'='true')))
      SELECT coalesce(sum(amount) FILTER(WHERE entity_type='invoice' AND due BETWEEN ${today} AND ${addDays(today, 7)}),0)::text "receivables7", coalesce(sum(amount) FILTER(WHERE entity_type='invoice' AND due BETWEEN ${today} AND ${addDays(today, 30)}),0)::text "receivables30", coalesce(sum(amount) FILTER(WHERE entity_type='incoming' AND due BETWEEN ${today} AND ${addDays(today, 7)}),0)::text "payables7", coalesce(sum(amount) FILTER(WHERE entity_type='incoming' AND due BETWEEN ${today} AND ${addDays(today, 30)}),0)::text "payables30", coalesce(sum(amount) FILTER(WHERE entity_type='invoice' AND due < ${today}),0)::text overdue FROM eligible`);
    const r = result.rows[0]!;
    const { default: Decimal } = await import('decimal.js');
    const data = {
      ...r,
      today,
      net7: new Decimal(r.receivables7).minus(r.payables7).toFixed(2),
      net30: new Decimal(r.receivables30).minus(r.payables30).toFixed(2),
      balanceKnown: false as const,
    };
    await tx
      .insert(s.financialSummaries)
      .values({ organizationId, data })
      .onConflictDoUpdate({
        target: s.financialSummaries.organizationId,
        set: { data, updatedAt: new Date() },
      });
    await this.aggregateAction(
      tx,
      organizationId,
      new Decimal(data.net30).lt(0)
        ? {
            rule: 'CASHFLOW_RISK',
            version: '1',
            severity: 'WARNING',
            title: 'Bekannte Ausgaben übersteigen die erwarteten Einnahmen',
            reason: `In den nächsten 30 Tagen stehen ${data.payables30} EUR bekannte Ausgaben ${data.receivables30} EUR erwarteten Einnahmen gegenüber. Der Kontostand ist nicht bekannt.`,
            recommendation:
              'Zahlungsfristen und vorhandene Rücklagen selbst abgleichen. Diese Übersicht umfasst nur gespeicherte Rechnungen.',
            facts: {
              receivables: data.receivables30,
              payables: data.payables30,
              net: data.net30,
              balanceKnown: false,
            },
            amount: new Decimal(data.net30).abs().toFixed(2),
            dueDay: addDays(today, 30),
            mandatory: false,
            relatedId: null,
          }
        : null,
    );
    const rows = await tx
      .select({ title: s.financialActions.title })
      .from(s.financialActions)
      .where(
        and(
          eq(s.financialActions.organizationId, organizationId),
          sql`${s.financialActions.status} IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')`,
        ),
      )
      .orderBy(
        sql`CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 WHEN 'ATTENTION' THEN 2 ELSE 3 END`,
        asc(s.financialActions.dueDay),
        desc(s.financialActions.detectedAt),
      )
      .limit(50);
    const { content, fingerprint: digestFingerprint } = buildFinancialDigest(
      rows.map((x) => x.title),
      data,
    );
    await tx
      .insert(s.financialDigests)
      .values({
        organizationId,
        day: today,
        fingerprint: digestFingerprint,
        content,
      })
      .onConflictDoUpdate({
        target: [s.financialDigests.organizationId, s.financialDigests.day],
        set: { fingerprint: digestFingerprint, content, updatedAt: new Date() },
      });
  }
  private async aggregateAction(
    tx: s.Transaction,
    organizationId: string,
    c: Candidate | null,
  ) {
    const key = 'organization:CASHFLOW_RISK';
    const [prior] = await tx
      .select()
      .from(s.financialActions)
      .where(
        and(
          eq(s.financialActions.organizationId, organizationId),
          eq(s.financialActions.deduplicationKey, key),
        ),
      );
    const p = {
      organizationId,
      userId: 'SYSTEM_AUTOPILOT',
      requestId: crypto.randomUUID(),
    };
    if (!c) {
      if (prior && active.includes(prior.status)) {
        await tx
          .update(s.financialActions)
          .set({
            status: 'RESOLVED',
            resolvedAt: new Date(),
            resolution: 'OUTLOOK_CHANGED',
          })
          .where(eq(s.financialActions.id, prior.id));
        await this.activity(tx, p, prior, 'resolved');
      }
      return;
    }
    const fingerprint = digest(c.facts);
    const status =
      prior?.fingerprint === fingerprint &&
      !['RESOLVED', 'SUPERSEDED'].includes(prior.status)
        ? prior.status
        : 'OPEN';
    const [action] = await tx
      .insert(s.financialActions)
      .values({
        organizationId,
        entityType: 'organization',
        entityId: organizationId,
        ...c,
        ruleVersion: c.version,
        deduplicationKey: key,
        fingerprint,
        status,
      })
      .onConflictDoUpdate({
        target: [
          s.financialActions.organizationId,
          s.financialActions.deduplicationKey,
        ],
        set: {
          ...c,
          ruleVersion: c.version,
          fingerprint,
          status,
          updatedAt: new Date(),
          resolvedAt: null,
          resolution: null,
        },
      })
      .returning();
    if (
      !prior ||
      prior.fingerprint !== fingerprint ||
      prior.status === 'RESOLVED'
    )
      await this.activity(tx, p, action!, 'detected', c.facts);
  }
  async brief(p: Principal) {
    await authorize(this.db, p, 'read');
    const today = localDay(new Date());
    const [actions, summary, activity, policy, metrics, digestRows] =
      await Promise.all([
        this.db
          .select()
          .from(s.financialActions)
          .where(
            and(
              eq(s.financialActions.organizationId, p.organizationId),
              sql`${s.financialActions.status} IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')`,
              sql`(${s.financialActions.snoozedUntil} IS NULL OR ${s.financialActions.snoozedUntil}<=${today})`,
              sql`(${s.financialActions.mandatory} OR NOT EXISTS(SELECT 1 FROM financial_feedback f WHERE f.organization_id=${p.organizationId} AND f.action_id=${s.financialActions.id} AND f.actor_id=${p.userId} AND f.value='HIDE'))`,
            ),
          )
          .orderBy(
            sql`CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 WHEN 'ATTENTION' THEN 2 ELSE 3 END`,
            asc(s.financialActions.dueDay),
            asc(s.financialActions.id),
          )
          .limit(25),
        this.db
          .select()
          .from(s.financialSummaries)
          .where(eq(s.financialSummaries.organizationId, p.organizationId)),
        this.db
          .select()
          .from(s.financialActivity)
          .where(eq(s.financialActivity.organizationId, p.organizationId))
          .orderBy(
            desc(s.financialActivity.createdAt),
            desc(s.financialActivity.id),
          )
          .limit(25),
        this.db
          .select()
          .from(s.autopilotPolicies)
          .where(eq(s.autopilotPolicies.organizationId, p.organizationId)),
        this.db
          .select({
            data: s.customerPaymentMetrics.data,
            name: s.customers.name,
          })
          .from(s.customerPaymentMetrics)
          .innerJoin(
            s.customers,
            and(
              eq(
                s.customers.organizationId,
                s.customerPaymentMetrics.organizationId,
              ),
              eq(s.customers.id, s.customerPaymentMetrics.customerId),
            ),
          )
          .where(eq(s.customerPaymentMetrics.organizationId, p.organizationId))
          .orderBy(desc(s.customerPaymentMetrics.updatedAt))
          .limit(12),
        this.db
          .select()
          .from(s.financialDigests)
          .where(
            and(
              eq(s.financialDigests.organizationId, p.organizationId),
              eq(s.financialDigests.day, today),
            ),
          ),
      ]);
    return {
      today,
      actions,
      summary: summary[0] ?? null,
      activity,
      policy: policy[0] ?? null,
      metrics,
      digest: digestRows[0] ?? null,
    };
  }
  async detail(
    p: Principal,
    id: string,
    connection: s.Database | s.Transaction = this.db,
  ) {
    z.uuid().parse(id);
    await authorize(connection, p, 'read');
    const [a] = await connection
      .select()
      .from(s.financialActions)
      .where(
        and(
          eq(s.financialActions.organizationId, p.organizationId),
          eq(s.financialActions.id, id),
        ),
      );
    if (!a) throw new AppError('NOT_FOUND', 'Hinweis nicht gefunden.');
    return a;
  }
  async history(p: Principal, before?: string) {
    await authorize(this.db, p, 'read');
    if (before) z.uuid().parse(before);
    const rows = await this.db
      .select()
      .from(s.financialActivity)
      .where(
        and(
          eq(s.financialActivity.organizationId, p.organizationId),
          before
            ? sql`(${s.financialActivity.createdAt},${s.financialActivity.id}) < (SELECT created_at,id FROM financial_activity WHERE organization_id=${p.organizationId} AND id=${before})`
            : undefined,
        ),
      )
      .orderBy(
        desc(s.financialActivity.createdAt),
        desc(s.financialActivity.id),
      )
      .limit(26);
    return {
      rows: rows.slice(0, 25),
      next: rows.length > 25 ? rows[24]!.id : null,
    };
  }
  async respond(p: Principal, id: string, raw: unknown) {
    const operation = z
      .enum([
        'acknowledge',
        'dismiss',
        'snooze',
        'prepare',
        'helpful',
        'irrelevant',
        'hide',
      ])
      .parse(raw);
    return this.transaction(
      p,
      FINANCIAL_OPERATIONS.respond.permission,
      async (tx) => {
        const a = await this.detail(p, id, tx);
        if (!active.includes(a.status))
          throw new AppError(
            'CONFLICT',
            'Dieser Hinweis ist nicht mehr offen.',
          );
        if (a.mandatory && ['dismiss', 'hide', 'snooze'].includes(operation))
          throw new AppError(
            'CONFLICT',
            'Erforderliche Prüfungen bleiben sichtbar.',
          );
        if (['helpful', 'irrelevant', 'hide'].includes(operation))
          await tx
            .insert(s.financialFeedback)
            .values({
              organizationId: p.organizationId,
              actorId: p.userId,
              actionId: id,
              value:
                operation === 'helpful'
                  ? 'HELPFUL'
                  : operation === 'hide'
                    ? 'HIDE'
                    : 'IRRELEVANT',
            })
            .onConflictDoUpdate({
              target: [
                s.financialFeedback.organizationId,
                s.financialFeedback.actorId,
                s.financialFeedback.actionId,
              ],
              set: {
                value:
                  operation === 'helpful'
                    ? 'HELPFUL'
                    : operation === 'hide'
                      ? 'HIDE'
                      : 'IRRELEVANT',
              },
            });
        else {
          if (
            operation === 'prepare' &&
            !prepareRules.includes(a.rule as (typeof prepareRules)[number])
          )
            throw new AppError(
              'CONFLICT',
              'Für diesen Hinweis ist keine automatische Vorbereitung vorhanden.',
            );
          await tx
            .update(s.financialActions)
            .set({
              status:
                operation === 'dismiss'
                  ? 'DISMISSED'
                  : operation === 'prepare'
                    ? 'IN_PROGRESS'
                    : 'ACKNOWLEDGED',
              snoozedUntil:
                operation === 'snooze'
                  ? addDays(localDay(new Date()), 1)
                  : null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(s.financialActions.organizationId, p.organizationId),
                eq(s.financialActions.id, id),
              ),
            );
        }
        await this.activity(
          tx,
          p,
          a,
          operation,
          operation === 'prepare' ? { checklist: a.recommendation } : {},
        );
      },
    );
  }
  async policy(p: Principal, mode: unknown, rules: unknown) {
    const input = z
      .object({
        mode: z.enum(['MANUAL', 'ASSISTED', 'AUTOPILOT']),
        rules: z.array(z.enum(prepareRules)).max(3),
      })
      .parse({ mode, rules });
    await this.transaction(
      p,
      FINANCIAL_OPERATIONS.policy.permission,
      async (tx) => {
        await tx
          .insert(s.autopilotPolicies)
          .values({
            organizationId: p.organizationId,
            mode: input.mode,
            prepareRules: input.rules,
          })
          .onConflictDoUpdate({
            target: s.autopilotPolicies.organizationId,
            set: {
              mode: input.mode,
              prepareRules: input.rules,
              updatedAt: new Date(),
            },
          });
        await this.activity(tx, p, null, 'policy_changed', {
          mode: input.mode,
          rules: input.rules.join(','),
        });
      },
    );
  }
  async preparePayment(p: Principal, id: string, paidDay: string) {
    return this.transaction(
      p,
      FINANCIAL_OPERATIONS.payment.permission,
      async (tx) => {
        const a = await this.detail(p, id, tx);
        const kind = z.enum(['invoice', 'incoming']).parse(a.entityType);
        const f = await this.fact(tx, p.organizationId, kind, a.entityId);
        if (
          !f ||
          f.settled ||
          !(kind === 'invoice' ? f.issued : f.approved) ||
          f.currency !== 'EUR' ||
          !f.amount ||
          new Decimal(f.amount).lte(0) ||
          !validDay(paidDay) ||
          !validDay(f.issueDay) ||
          paidDay < f.issueDay ||
          paidDay > localDay(new Date())
        )
          throw new AppError(
            'CONFLICT',
            'Zahlung oder Zahlungsdatum kann nicht bestätigt werden.',
          );
        const [ticket] = await tx
          .insert(s.financialConfirmations)
          .values({
            organizationId: p.organizationId,
            actionId: id,
            actorId: p.userId,
            operation: 'RECORD_PAID',
            fingerprint: digest(f),
            payload: { paidDay, amount: f.amount },
            expiresAt: new Date(Date.now() + 300000),
          })
          .returning();
        return ticket!;
      },
    );
  }
  async confirmPayment(p: Principal, ticketId: string) {
    z.uuid().parse(ticketId);
    return this.transaction(
      p,
      FINANCIAL_OPERATIONS.payment.permission,
      async (tx) => {
        const [ticket] = await tx
          .select()
          .from(s.financialConfirmations)
          .where(
            and(
              eq(s.financialConfirmations.organizationId, p.organizationId),
              eq(s.financialConfirmations.actorId, p.userId),
              eq(s.financialConfirmations.id, ticketId),
            ),
          )
          .for('update');
        if (!ticket || ticket.operation !== 'RECORD_PAID')
          throw new AppError('NOT_FOUND', 'Bestätigung nicht gefunden.');
        if (ticket.consumedAt) return;
        if (ticket.expiresAt < new Date())
          throw new AppError('CONFLICT', 'Bestätigung abgelaufen.');
        const a = await this.detail(p, ticket.actionId, tx);
        const kind = z.enum(['invoice', 'incoming']).parse(a.entityType);
        const f = await this.fact(tx, p.organizationId, kind, a.entityId);
        if (!f || digest(f) !== ticket.fingerprint)
          throw new AppError('CONFLICT', 'Die Quelldaten haben sich geändert.');
        await tx.insert(s.paymentObservations).values({
          organizationId: p.organizationId,
          entityType: kind,
          entityId: a.entityId,
          paidDay: ticket.payload.paidDay!,
          amount: ticket.payload.amount!,
          actorId: p.userId,
        });
        await tx
          .update(s.financialConfirmations)
          .set({ consumedAt: new Date() })
          .where(eq(s.financialConfirmations.id, ticketId));
        await this.activity(tx, p, a, 'payment_confirmed', ticket.payload);
        await this.project(tx, p.organizationId, kind, a.entityId);
      },
    );
  }
  async saveTerms(p: Principal, id: string, raw: unknown) {
    z.uuid().parse(id);
    const day = z.string().refine(validDay);
    const input = z
      .object({
        dueDay: day.nullable(),
        discountDay: day.nullable(),
        discountRate: z
          .string()
          .regex(/^\d{1,3}(\.\d{1,2})?$/)
          .nullable(),
        discountBase: z
          .string()
          .regex(/^\d{1,16}(\.\d{1,2})?$/)
          .nullable(),
      })
      .parse(raw);
    await this.transaction(p, 'incoming:approve', async (tx) => {
      const f = await this.fact(tx, p.organizationId, 'incoming', id);
      if (!f) throw new AppError('NOT_FOUND', 'Dokument nicht gefunden.');
      const discount = [
        input.discountDay,
        input.discountRate,
        input.discountBase,
      ];
      if (
        discount.some(Boolean) &&
        (!discount.every(Boolean) ||
          !f.amount ||
          f.currency !== 'EUR' ||
          new Decimal(input.discountRate!).lte(0) ||
          new Decimal(input.discountRate!).gt(100) ||
          new Decimal(input.discountBase!).lte(0) ||
          new Decimal(input.discountBase!).gt(f.amount) ||
          (input.dueDay && input.discountDay! > input.dueDay))
      )
        throw new AppError(
          'CONFLICT',
          'Skontobedingungen sind nicht vollständig oder widersprechen dem Rechnungsbetrag.',
        );
      if (input.dueDay && validDay(f.issueDay) && input.dueDay < f.issueDay)
        throw new AppError('CONFLICT', 'Frist liegt vor dem Rechnungsdatum.');
      await tx
        .insert(s.incomingFinancialTerms)
        .values({
          organizationId: p.organizationId,
          incomingId: id,
          actorId: p.userId,
          ...input,
        })
        .onConflictDoUpdate({
          target: s.incomingFinancialTerms.incomingId,
          set: { ...input, actorId: p.userId, updatedAt: new Date() },
        });
      await this.activity(tx, p, null, 'terms_confirmed', {
        entityId: id,
        ...input,
      });
      await this.project(tx, p.organizationId, 'incoming', id);
    });
  }
  async prepareDuplicate(p: Principal, id: string, decision: unknown) {
    const value = z.enum(['DUPLICATE', 'NOT_DUPLICATE']).parse(decision);
    return this.transaction(p, 'incoming:approve', async (tx) => {
      const a = await this.detail(p, id, tx);
      if (
        a.entityType !== 'incoming' ||
        !a.relatedId ||
        !active.includes(a.status)
      )
        throw new AppError('CONFLICT', 'Kein offener Vergleich vorhanden.');
      const left = await this.fact(
          tx,
          p.organizationId,
          'incoming',
          a.entityId,
        ),
        right = await this.fact(tx, p.organizationId, 'incoming', a.relatedId);
      if (!left || !right || !duplicateSignal(left, right))
        throw new AppError(
          'CONFLICT',
          'Die Vergleichsdaten haben sich geändert.',
        );
      const [ticket] = await tx
        .insert(s.financialConfirmations)
        .values({
          organizationId: p.organizationId,
          actionId: id,
          actorId: p.userId,
          operation: 'DUPLICATE_REVIEW',
          fingerprint: digest([left, right]),
          payload: {
            decision: value,
            otherId: a.relatedId,
            pairHash: digest([left.hash, right.hash]),
          },
          expiresAt: new Date(Date.now() + 300000),
        })
        .returning();
      return ticket!;
    });
  }
  async confirmDuplicate(p: Principal, ticketId: string) {
    z.uuid().parse(ticketId);
    await this.transaction(p, 'incoming:approve', async (tx) => {
      const [ticket] = await tx
        .select()
        .from(s.financialConfirmations)
        .where(
          and(
            eq(s.financialConfirmations.organizationId, p.organizationId),
            eq(s.financialConfirmations.actorId, p.userId),
            eq(s.financialConfirmations.id, ticketId),
          ),
        )
        .for('update');
      if (!ticket || ticket.operation !== 'DUPLICATE_REVIEW')
        throw new AppError('NOT_FOUND', 'Bestätigung nicht gefunden.');
      if (ticket.consumedAt) return;
      if (ticket.expiresAt < new Date())
        throw new AppError('CONFLICT', 'Bestätigung abgelaufen.');
      const a = await this.detail(p, ticket.actionId, tx);
      const left = await this.fact(
          tx,
          p.organizationId,
          'incoming',
          a.entityId,
        ),
        right = await this.fact(
          tx,
          p.organizationId,
          'incoming',
          ticket.payload.otherId!,
        );
      if (!left || !right || digest([left, right]) !== ticket.fingerprint)
        throw new AppError(
          'CONFLICT',
          'Die Vergleichsdaten haben sich geändert.',
        );
      await tx
        .insert(s.incomingDuplicateDecisions)
        .values({
          organizationId: p.organizationId,
          incomingId: a.entityId,
          otherId: ticket.payload.otherId!,
          actorId: p.userId,
          decision: ticket.payload.decision!,
          fingerprint: ticket.payload.pairHash!,
        })
        .onConflictDoNothing();
      await tx
        .update(s.financialConfirmations)
        .set({ consumedAt: new Date() })
        .where(eq(s.financialConfirmations.id, ticketId));
      await this.activity(
        tx,
        p,
        a,
        'duplicate_review_confirmed',
        ticket.payload,
      );
      await this.project(tx, p.organizationId, 'incoming', a.entityId);
    });
  }
  /** Bounded keyset sweep, serialized across worker processes. */
  async pulse() {
    await this.db.transaction(async (tx) => {
      const lock = await tx.execute<{ locked: boolean }>(
        sql`SELECT pg_try_advisory_xact_lock(718492,11) locked`,
      );
      if (!lock.rows[0]?.locked) return;
      const [cursor] = await tx
        .select()
        .from(s.autopilotCursors)
        .where(eq(s.autopilotCursors.key, 'reconcile'));
      const rows = await tx.execute<{
        organization_id: string;
        entity_id: string;
        entity_type: 'invoice' | 'incoming';
      }>(
        sql`SELECT * FROM (SELECT organization_id,id entity_id,'invoice'::text entity_type FROM invoices UNION ALL SELECT organization_id,id,'incoming'::text FROM incoming_documents) x WHERE (${cursor?.organizationId ?? null}::uuid IS NULL OR (organization_id,entity_type,entity_id)>(${cursor?.organizationId ?? null}::uuid,${cursor?.entityType ?? 'invoice'},${cursor?.entityId ?? null}::uuid)) ORDER BY organization_id,entity_type,entity_id LIMIT 25`,
      );
      for (const r of rows.rows) {
        await tx.execute(
          sql`SELECT id FROM organizations WHERE id=${r.organization_id} FOR UPDATE`,
        );
        await this.project(tx, r.organization_id, r.entity_type, r.entity_id);
      }
      const last = rows.rows.at(-1);
      await tx
        .insert(s.autopilotCursors)
        .values({
          key: 'reconcile',
          organizationId: last?.organization_id ?? null,
          entityType: last?.entity_type ?? 'invoice',
          entityId: last?.entity_id ?? null,
        })
        .onConflictDoUpdate({
          target: s.autopilotCursors.key,
          set: {
            organizationId: last?.organization_id ?? null,
            entityType: last?.entity_type ?? 'invoice',
            entityId: last?.entity_id ?? null,
            updatedAt: new Date(),
          },
        });
    });
  }
}
