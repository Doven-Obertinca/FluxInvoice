import { roundMoney, normalizeDecimal } from '@flux/invoice-core';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '@flux/db';
import { authorize, type Principal, type Permission } from '@flux/auth';
import { appendAudit, digest } from '@flux/audit';
import { AppError, companySchema, customerSchema } from '@flux/shared';
import {
  assertEditable,
  calculate,
  formatNumber,
  invoiceInputSchema,
  transition,
  validate,
  type InvoiceInput,
} from '@flux/invoice-core';
import { searchTerm } from './discovery';
export class InvoiceService {
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
  private async event(
    tx: s.Transaction,
    p: Principal,
    eventType: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, string | number | boolean | null> = {},
  ) {
    await appendAudit(tx, {
      organizationId: p.organizationId,
      actorId: p.userId,
      eventType,
      entityType,
      entityId,
      requestId: p.requestId,
      metadata,
    });
    await tx.insert(s.outbox).values({
      organizationId: p.organizationId,
      eventType,
      entityId,
      requestId: p.requestId,
    });
  }
  async createOrganization(userId: string, raw: unknown, requestId: string) {
    const input = companySchema.parse(raw);
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId},2))`,
      );
      const [existing] = await tx
        .select()
        .from(s.members)
        .where(eq(s.members.userId, userId));
      if (existing)
        throw new AppError(
          'CONFLICT',
          'Ein Unternehmen ist bereits eingerichtet.',
        );
      const [org] = await tx
        .insert(s.organizations)
        .values({
          name: input.name,
          email: input.email,
          ...input.address,
          vatId: input.vatId,
          taxNumber: input.taxNumber,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          iban: input.iban,
          bic: input.bic,
          numberPrefix: input.numberPrefix,
        })
        .returning();
      if (!org) throw new Error('Insert failed');
      await tx
        .insert(s.members)
        .values({ organizationId: org.id, userId, role: 'OWNER' });
      await this.event(
        tx,
        { organizationId: org.id, userId, requestId },
        'organization.created',
        'organization',
        org.id,
      );
      return org.id;
    });
  }
  async company(p: Principal) {
    await authorize(this.db, p, 'read');
    const [org] = await this.db
      .select()
      .from(s.organizations)
      .where(eq(s.organizations.id, p.organizationId));
    if (!org) throw new AppError('NOT_FOUND', 'Unternehmen nicht gefunden.');
    return org;
  }
  async updateCompany(p: Principal, raw: unknown) {
    const input = companySchema.parse(raw);
    await this.transaction(p, 'company:write', async (tx) => {
      await tx
        .update(s.organizations)
        .set({
          name: input.name,
          email: input.email,
          ...input.address,
          vatId: input.vatId,
          taxNumber: input.taxNumber,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          iban: input.iban,
          bic: input.bic,
          numberPrefix: input.numberPrefix,
        })
        .where(eq(s.organizations.id, p.organizationId));
      await this.event(
        tx,
        p,
        'organization.updated',
        'organization',
        p.organizationId,
      );
    });
  }
  async listMembers(p: Principal) {
    await authorize(this.db, p, 'members:read');
    return this.db
      .select({
        id: s.members.id,
        role: s.members.role,
        name: s.user.name,
        email: s.user.email,
      })
      .from(s.members)
      .innerJoin(s.user, eq(s.members.userId, s.user.id))
      .where(eq(s.members.organizationId, p.organizationId));
  }
  async createCustomer(p: Principal, raw: unknown) {
    const input = customerSchema.parse(raw);
    return this.transaction(p, 'customer:write', async (tx) => {
      const [customer] = await tx
        .insert(s.customers)
        .values({
          organizationId: p.organizationId,
          name: input.name,
          email: input.email,
          vatId: input.vatId,
        })
        .returning();
      if (!customer) throw new Error('Insert failed');
      await tx.insert(s.customerAddresses).values({
        organizationId: p.organizationId,
        customerId: customer.id,
        ...input.address,
      });
      await this.event(tx, p, 'customer.created', 'customer', customer.id);
      return customer.id;
    });
  }
  async updateCustomer(p: Principal, id: string, raw: unknown) {
    z.uuid().parse(id);
    const input = customerSchema.parse(raw);
    await this.transaction(p, 'customer:write', async (tx) => {
      const [customer] = await tx
        .update(s.customers)
        .set({
          name: input.name,
          email: input.email,
          vatId: input.vatId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(s.customers.organizationId, p.organizationId),
            eq(s.customers.id, id),
          ),
        )
        .returning();
      if (!customer) throw new AppError('NOT_FOUND', 'Kunde nicht gefunden.');
      await tx
        .update(s.customerAddresses)
        .set(input.address)
        .where(
          and(
            eq(s.customerAddresses.organizationId, p.organizationId),
            eq(s.customerAddresses.customerId, id),
          ),
        );
      await this.event(tx, p, 'customer.updated', 'customer', id);
    });
  }
  async listCustomers(p: Principal, page = 1, search = '') {
    await authorize(this.db, p, 'read');
    return this.db
      .select()
      .from(s.customers)
      .where(
        and(
          eq(s.customers.organizationId, p.organizationId),
          ilike(
            s.customers.name,
            `%${z
              .string()
              .trim()
              .max(100)
              .parse(search)
              .replace(/[\\%_]/g, '\\$&')}%`,
          ),
        ),
      )
      .orderBy(asc(s.customers.name), asc(s.customers.id))
      .limit(50)
      .offset((z.number().int().min(1).max(10000).parse(page) - 1) * 50);
  }
  async customer(p: Principal, id: string) {
    z.uuid().parse(id);
    await authorize(this.db, p, 'read');
    const [row] = await this.db
      .select({ customer: s.customers, address: s.customerAddresses })
      .from(s.customers)
      .innerJoin(
        s.customerAddresses,
        and(
          eq(s.customerAddresses.customerId, s.customers.id),
          eq(s.customerAddresses.organizationId, s.customers.organizationId),
        ),
      )
      .where(
        and(
          eq(s.customers.organizationId, p.organizationId),
          eq(s.customers.id, id),
        ),
      );
    if (!row) throw new AppError('NOT_FOUND', 'Kunde nicht gefunden.');
    return row;
  }
  async listInvoices(
    p: Principal,
    page = 1,
    search = '',
    status = '',
    customerId?: string,
  ) {
    await authorize(this.db, p, 'read');
    const term = z
      .string()
      .trim()
      .max(100)
      .parse(search)
      .replace(/[\\%_]/g, '\\$&');
    const filter = z
      .enum([
        '',
        'DRAFT',
        'VALIDATED',
        'FINALIZED',
        'SENT',
        'PAID',
        'OVERDUE',
        'CANCELLED',
        'CREDITED',
      ])
      .parse(status);
    return this.db
      .select({
        invoice: s.invoices,
        buyer: s.invoiceParties.name,
        ready: sql<boolean>`EXISTS (SELECT 1 FROM validation_runs v WHERE v.organization_id=${s.invoices.organizationId} AND v.invoice_id=${s.invoices.id} AND v.revision=${s.invoices.revision} AND v.profile='XRECHNUNG' AND v.valid AND NOT EXISTS (SELECT 1 FROM validation_runs n WHERE n.organization_id=v.organization_id AND n.invoice_id=v.invoice_id AND n.revision=v.revision AND n.profile='XRECHNUNG' AND n.created_at>v.created_at AND NOT n.valid))`,
      })
      .from(s.invoices)
      .innerJoin(
        s.invoiceParties,
        and(
          eq(s.invoiceParties.invoiceId, s.invoices.id),
          eq(s.invoiceParties.organizationId, s.invoices.organizationId),
          eq(s.invoiceParties.kind, 'BUYER'),
        ),
      )
      .where(
        and(
          eq(s.invoices.organizationId, p.organizationId),
          sql`(${s.invoiceParties.name} ILIKE ${'%' + term + '%'} OR coalesce(${s.invoices.number},'') ILIKE ${'%' + term + '%'})`,
          filter ? eq(s.invoices.status, filter) : undefined,
          customerId
            ? eq(s.invoices.customerId, z.uuid().parse(customerId))
            : undefined,
        ),
      )
      .orderBy(desc(s.invoices.createdAt), desc(s.invoices.id))
      .limit(50)
      .offset((z.number().int().min(1).max(10000).parse(page) - 1) * 50);
  }
  /** Bounded discovery; only display metadata leaves the application boundary. */
  async searchWorkspace(p: Principal, raw: unknown) {
    await authorize(this.db, p, 'read');
    const { text, pattern, amount } = searchTerm(raw);
    if (text.length < 2) return [];
    const [invoices, customers] = await Promise.all([
      this.db
        .select({
          id: s.invoices.id,
          number: s.invoices.number,
          name: s.invoiceParties.name,
          payable: s.invoices.payable,
          reference: s.invoices.buyerReference,
        })
        .from(s.invoices)
        .innerJoin(
          s.invoiceParties,
          and(
            eq(s.invoiceParties.organizationId, s.invoices.organizationId),
            eq(s.invoiceParties.invoiceId, s.invoices.id),
            eq(s.invoiceParties.kind, 'BUYER'),
          ),
        )
        .where(
          and(
            eq(s.invoices.organizationId, p.organizationId),
            sql`(${s.invoiceParties.name} ILIKE ${pattern} OR ${s.invoiceParties.vatId} ILIKE ${pattern} OR ${s.invoices.number} ILIKE ${pattern} OR ${s.invoices.buyerReference} ILIKE ${pattern} OR ${s.invoices.payable} = ${amount}::numeric)`,
          ),
        )
        .orderBy(desc(s.invoices.createdAt), desc(s.invoices.id))
        .limit(8),
      this.db
        .select({ id: s.customers.id, name: s.customers.name })
        .from(s.customers)
        .where(
          and(
            eq(s.customers.organizationId, p.organizationId),
            sql`(${s.customers.name} ILIKE ${pattern} OR ${s.customers.vatId} ILIKE ${pattern})`,
          ),
        )
        .orderBy(asc(s.customers.name), asc(s.customers.id))
        .limit(8),
    ]);
    return [
      ...invoices.map((i) => ({
        href: `/invoices/${i.id}`,
        label: `${i.number ?? 'Entwurf'} · ${i.name}`,
        detail: `${i.payable.replace('.', ',')} EUR${i.reference ? ' · ' + i.reference : ''}`,
        kind: 'Rechnung',
      })),
      ...customers.map((c) => ({
        href: `/customers/${c.id}`,
        label: c.name,
        detail: 'Kundendaten öffnen',
        kind: 'Kunde',
      })),
    ];
  }
  /** Observations only: no payment, reminder or fiscal-state mutation. */
  async attention(p: Principal, page = 1) {
    await authorize(this.db, p, 'read');
    const offset = (z.number().int().min(1).max(10000).parse(page) - 1) * 25;
    const result = await this.db.execute<{
      id: string;
      number: string | null;
      buyer: string;
      payable: string;
      due_date: string;
      reason: 'PROCESSING' | 'VALIDATION' | 'OVERDUE';
    }>(sql`
      SELECT * FROM (
        SELECT i.id, i.number, b.name AS buyer, i.payable::text, i.due_date::text,
          CASE
            WHEN i.status IN ('DRAFT','VALIDATED') AND j.state='FAILED' AND j.last_error_code IS DISTINCT FROM 'VALIDATION_FAILED' THEN 'PROCESSING'
            WHEN i.status IN ('DRAFT','VALIDATED') AND v.valid=false AND (j.state IS NULL OR j.state NOT IN ('QUEUED','VALIDATING','ARCHIVING')) THEN 'VALIDATION'
            WHEN i.status IN ('FINALIZED','SENT','OVERDUE') AND i.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Berlin')::date THEN 'OVERDUE'
          END AS reason
        FROM invoices i
        JOIN invoice_parties b ON b.organization_id=i.organization_id AND b.invoice_id=i.id AND b.kind='BUYER'
        LEFT JOIN LATERAL (
          SELECT valid FROM validation_runs v WHERE v.organization_id=i.organization_id AND v.invoice_id=i.id AND v.revision=i.revision AND v.profile='XRECHNUNG' ORDER BY v.created_at DESC, v.id DESC LIMIT 1
        ) v ON true
        LEFT JOIN LATERAL (
          SELECT state, last_error_code FROM einvoice_jobs j WHERE j.organization_id=i.organization_id AND j.invoice_id=i.id AND j.revision=i.revision ORDER BY j.created_at DESC, j.id DESC LIMIT 1
        ) j ON true
        WHERE i.organization_id=${p.organizationId}
      ) observed WHERE reason IS NOT NULL
      ORDER BY CASE reason WHEN 'PROCESSING' THEN 0 WHEN 'VALIDATION' THEN 1 ELSE 2 END, due_date, id
      LIMIT 25 OFFSET ${offset}
    `);
    return result.rows;
  }
  async summary(p: Principal, customerId?: string) {
    await authorize(this.db, p, 'read');
    const [r] = await this.db
      .select({
        count: sql<string>`count(*)::text`,
        drafts: sql<string>`count(*) FILTER (WHERE status='DRAFT')::text`,
        validated: sql<string>`count(*) FILTER (WHERE status='VALIDATED')::text`,
        total: sql<string>`coalesce(sum(payable) FILTER (WHERE status IN ('DRAFT','VALIDATED')),0)::text`,
        outstanding: sql<string>`coalesce(sum(payable) FILTER (WHERE status IN ('FINALIZED','SENT','OVERDUE')),0)::text`,
        overdue: sql<string>`coalesce(sum(payable) FILTER (WHERE status IN ('FINALIZED','SENT','OVERDUE') AND due_date<CURRENT_DATE),0)::text`,
        paid: sql<string>`coalesce(sum(payable) FILTER (WHERE status='PAID'),0)::text`,
        ready: sql<string>`count(*) FILTER (WHERE status IN ('DRAFT','VALIDATED') AND EXISTS(SELECT 1 FROM validation_runs v WHERE v.organization_id=${s.invoices.organizationId} AND v.invoice_id=${s.invoices.id} AND v.revision=${s.invoices.revision} AND v.profile='XRECHNUNG' AND v.valid AND NOT EXISTS(SELECT 1 FROM validation_runs n WHERE n.organization_id=v.organization_id AND n.invoice_id=v.invoice_id AND n.revision=v.revision AND n.profile='XRECHNUNG' AND n.created_at>v.created_at AND NOT n.valid)))::text`,
        pending: sql<string>`count(*) FILTER (WHERE finalization_pending)::text`,
      })
      .from(s.invoices)
      .where(
        and(
          eq(s.invoices.organizationId, p.organizationId),
          customerId
            ? eq(s.invoices.customerId, z.uuid().parse(customerId))
            : undefined,
        ),
      );
    return r!;
  }
  async invoice(p: Principal, id: string) {
    z.uuid().parse(id);
    await authorize(this.db, p, 'read');
    return this.load(this.db, p, id);
  }
  /** Internal loader: caller must already authorize and hold its mutation lock. */
  async load(db: s.Database | s.Transaction, p: Principal, id: string) {
    const where = and(
      eq(s.invoices.organizationId, p.organizationId),
      eq(s.invoices.id, id),
    );
    const [invoice] = await db.select().from(s.invoices).where(where);
    if (!invoice) throw new AppError('NOT_FOUND', 'Rechnung nicht gefunden.');
    const lines = await db
      .select()
      .from(s.invoiceItems)
      .where(
        and(
          eq(s.invoiceItems.organizationId, p.organizationId),
          eq(s.invoiceItems.invoiceId, id),
        ),
      )
      .orderBy(asc(s.invoiceItems.position));
    const parties = await db
      .select()
      .from(s.invoiceParties)
      .where(
        and(
          eq(s.invoiceParties.organizationId, p.organizationId),
          eq(s.invoiceParties.invoiceId, id),
        ),
      );
    const adjustments = await db
      .select()
      .from(s.invoiceAdjustments)
      .where(
        and(
          eq(s.invoiceAdjustments.organizationId, p.organizationId),
          eq(s.invoiceAdjustments.invoiceId, id),
        ),
      )
      .orderBy(asc(s.invoiceAdjustments.id));
    const [run] = await db
      .select()
      .from(s.validationRuns)
      .where(
        and(
          eq(s.validationRuns.organizationId, p.organizationId),
          eq(s.validationRuns.invoiceId, id),
          eq(s.validationRuns.revision, invoice.revision),
        ),
      )
      .orderBy(desc(s.validationRuns.createdAt))
      .limit(1);
    const issues = run
      ? await db
          .select()
          .from(s.validationIssues)
          .where(
            and(
              eq(s.validationIssues.organizationId, p.organizationId),
              eq(s.validationIssues.runId, run.id),
            ),
          )
      : [];
    return { invoice, lines, parties, adjustments, run: run ?? null, issues };
  }
  async saveInvoice(
    p: Principal,
    raw: unknown,
    options: { id?: string; revision?: number; idempotencyKey: string },
  ) {
    const input = invoiceInputSchema.parse(raw);
    const totals = calculate(input);
    z.uuid().parse(options.idempotencyKey);
    if (options.id) z.uuid().parse(options.id);
    const requestHash = digest({
      input,
      id: options.id ?? null,
      revision: options.revision ?? null,
    });
    return this.transaction(p, 'invoice:write', async (tx) => {
      const [prior] = await tx
        .select()
        .from(s.idempotencyKeys)
        .where(
          and(
            eq(s.idempotencyKeys.organizationId, p.organizationId),
            eq(s.idempotencyKeys.operation, 'invoice.save'),
            eq(s.idempotencyKeys.key, options.idempotencyKey),
          ),
        );
      if (prior) {
        if (prior.requestHash !== requestHash || prior.actorId !== p.userId)
          throw new AppError(
            'CONFLICT',
            'Idempotenzschlüssel wurde bereits verwendet.',
          );
        return prior.resourceId;
      }
      const [customer] = await tx
        .select({ customer: s.customers, address: s.customerAddresses })
        .from(s.customers)
        .innerJoin(
          s.customerAddresses,
          and(
            eq(s.customerAddresses.customerId, s.customers.id),
            eq(s.customerAddresses.organizationId, s.customers.organizationId),
          ),
        )
        .where(
          and(
            eq(s.customers.organizationId, p.organizationId),
            eq(s.customers.id, input.customerId),
          ),
        );
      if (!customer) throw new AppError('NOT_FOUND', 'Kunde nicht gefunden.');
      const [org] = await tx
        .select()
        .from(s.organizations)
        .where(eq(s.organizations.id, p.organizationId));
      if (!org) throw new AppError('NOT_FOUND', 'Unternehmen nicht gefunden.');
      const id = options.id ?? randomUUID();
      const values = {
        customerId: input.customerId,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        serviceDate: input.serviceDate,
        currency: input.currency,
        buyerReference: input.buyerReference,
        notes: input.notes,
        net: totals.net,
        tax: totals.tax,
        payable: totals.payable,
        status: 'DRAFT' as const,
        updatedAt: new Date(),
      };
      if (options.id) {
        const previous = await this.load(tx, p, id);
        assertEditable(previous.invoice.status);
        if (previous.invoice.finalizationPending)
          throw new AppError(
            'CONFLICT',
            'Die Rechnung wird finalisiert und kann nicht mehr bearbeitet werden.',
          );
        if (previous.invoice.revision !== options.revision)
          throw new AppError(
            'CONFLICT',
            'Die Rechnung wurde inzwischen geändert. Bitte neu laden.',
          );
        await tx
          .update(s.invoices)
          .set({ ...values, revision: previous.invoice.revision + 1 })
          .where(
            and(
              eq(s.invoices.id, id),
              eq(s.invoices.organizationId, p.organizationId),
            ),
          );
        for (const table of [
          s.invoiceItems,
          s.invoiceParties,
          s.invoiceAdjustments,
          s.invoiceTaxSummaries,
        ])
          await tx
            .delete(table)
            .where(
              and(
                eq(table.organizationId, p.organizationId),
                eq(table.invoiceId, id),
              ),
            );
      } else
        await tx
          .insert(s.invoices)
          .values({ id, organizationId: p.organizationId, ...values });
      await tx.insert(s.invoiceItems).values(
        input.lines.map((line, position) => ({
          ...line,
          organizationId: p.organizationId,
          invoiceId: id,
          position,
          net: totals.lines[position]!.net,
          allowance: roundMoney(line.allowance),
          charge: roundMoney(line.charge),
        })),
      );
      if (input.adjustments.length)
        await tx.insert(s.invoiceAdjustments).values(
          input.adjustments.map((a) => ({
            ...a,
            amount: roundMoney(a.amount),
            organizationId: p.organizationId,
            invoiceId: id,
          })),
        );
      await tx.insert(s.invoiceTaxSummaries).values(
        totals.taxes.map((t) => ({
          ...t,
          organizationId: p.organizationId,
          invoiceId: id,
        })),
      );
      const partyBase = { organizationId: p.organizationId, invoiceId: id };
      await tx.insert(s.invoiceParties).values([
        {
          ...partyBase,
          kind: 'SELLER',
          name: org.name,
          email: org.email,
          line1: org.line1,
          city: org.city,
          postalCode: org.postalCode,
          country: org.country,
          vatId: org.vatId,
          taxNumber: org.taxNumber,
          contactName: org.contactName,
          contactPhone: org.contactPhone,
          iban: org.iban,
          bic: org.bic,
        },
        {
          ...partyBase,
          kind: 'BUYER',
          name: customer.customer.name,
          email: customer.customer.email,
          vatId: customer.customer.vatId,
          line1: customer.address.line1,
          city: customer.address.city,
          postalCode: customer.address.postalCode,
          country: customer.address.country,
        },
      ]);
      await this.event(
        tx,
        p,
        options.id ? 'invoice.updated' : 'invoice.created',
        'invoice',
        id,
      );
      await tx.insert(s.idempotencyKeys).values({
        organizationId: p.organizationId,
        actorId: p.userId,
        operation: 'invoice.save',
        key: options.idempotencyKey,
        requestHash,
        resourceId: id,
      });
      return id;
    });
  }
  async validateInvoice(p: Principal, id: string, revision: number) {
    z.uuid().parse(id);
    return this.transaction(p, 'invoice:write', async (tx) => {
      const detail = await this.load(tx, p, id);
      assertEditable(detail.invoice.status);
      if (detail.invoice.revision !== revision)
        throw new AppError(
          'CONFLICT',
          'Die Rechnung wurde inzwischen geändert.',
        );
      const input = toInput(detail);
      const issues = validate(input);
      if (!issues.length) {
        const totals = calculate(input);
        if (
          totals.net !== detail.invoice.net ||
          totals.tax !== detail.invoice.tax ||
          totals.payable !== detail.invoice.payable ||
          totals.lines.some(
            (line, index) => line.net !== detail.lines[index]?.net,
          )
        ) {
          issues.push({
            code: 'STORED_TOTAL_MISMATCH',
            ruleId: 'FLUX-INTEGRITY',
            severity: 'ERROR',
            fieldPath: 'lines',
            message:
              'Gespeicherte Beträge stimmen nicht mit der Neuberechnung überein. Speichern Sie den Entwurf erneut.',
            source: 'DOMAIN',
            profile: 'FLUX_DRAFT',
            rulesetVersion: '1',
          });
        }
      }

      const [run] = await tx
        .insert(s.validationRuns)
        .values({
          organizationId: p.organizationId,
          invoiceId: id,
          revision,
          profile: 'FLUX_DRAFT',
          rulesetVersion: '1',
          valid: issues.length === 0,
        })
        .returning();
      if (!run) throw new Error('Insert failed');
      if (issues.length)
        await tx.insert(s.validationIssues).values(
          issues.map((i) => ({
            ...i,
            organizationId: p.organizationId,
            runId: run.id,
          })),
        );
      if (!issues.length && detail.invoice.status === 'DRAFT')
        await tx
          .update(s.invoices)
          .set({
            status: transition('DRAFT', 'VALIDATED'),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(s.invoices.id, id),
              eq(s.invoices.organizationId, p.organizationId),
            ),
          );
      await this.event(tx, p, 'invoice.validated', 'invoice', id, {
        valid: issues.length === 0,
        revision,
      });
      return issues;
    });
  }
}
export type InvoiceDetail = Awaited<ReturnType<InvoiceService['invoice']>>;
export function toInput(detail: InvoiceDetail): InvoiceInput {
  return invoiceInputSchema.parse({
    customerId: detail.invoice.customerId,
    issueDate: detail.invoice.issueDate,
    dueDate: detail.invoice.dueDate,
    serviceDate: detail.invoice.serviceDate,
    currency: detail.invoice.currency,
    buyerReference: detail.invoice.buyerReference,
    notes: detail.invoice.notes,
    lines: detail.lines.map((l) => ({
      description: l.description,
      quantity: normalizeDecimal(l.quantity),
      unitPrice: normalizeDecimal(l.unitPrice),
      unit: l.unit,
      vatRate: l.vatRate,
      allowance: normalizeDecimal(l.allowance),
      charge: normalizeDecimal(l.charge),
    })),
    adjustments: detail.adjustments.map((a) => ({
      kind: a.kind,
      reason: a.reason,
      amount: normalizeDecimal(a.amount),
      vatRate: a.vatRate,
    })),
  });
}
// Internal primitive. Caller must hold the organization's transaction lock and permission.
export async function allocateNumber(
  tx: s.Transaction,
  organizationId: string,
  year: number,
) {
  const [org] = await tx
    .select()
    .from(s.organizations)
    .where(eq(s.organizations.id, organizationId))
    .for('update');
  if (!org) throw new AppError('NOT_FOUND', 'Unternehmen nicht gefunden.');
  const [sequence] = await tx
    .insert(s.sequences)
    .values({ organizationId, year, value: 1n })
    .onConflictDoUpdate({
      target: [s.sequences.organizationId, s.sequences.year],
      set: { value: sql`${s.sequences.value}+1` },
    })
    .returning();
  return formatNumber(org.numberPrefix, year, sequence!.value);
}
