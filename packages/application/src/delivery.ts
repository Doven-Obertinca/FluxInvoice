import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { sql, and, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '@flux/db';
import { authorize, type Principal } from '@flux/auth';
import { appendAudit, digest } from '@flux/audit';
import { AppError } from '@flux/shared';
import { hashBytes, type Archive } from '@flux/storage';
import { InvoiceService } from './index';
import {
  defaults,
  renderTemplate,
  mailSettingsSchema,
  sendSchema,
  type MailSettings,
} from './email-template';
import { type EmailProvider } from './email-provider';
export interface Attempt {
  id: string;
  invoice_id: string;
  organization_id: string;
  document_id: string;
  actor_id: string;
  request_id: string;
  request_hash: string;
  recipient: string;
  subject: string;
  message: string;
  sender_name: string;
  reply_to: string;
  attachment_hash: string;
  filename: string;
  status: string;
  error_code: string | null;
  provider_id: string | null;
  provider: string | null;
  claimed_at: Date | null;
  created_at: Date;
}
export class DeliveryService {
  constructor(
    private db: s.Database,
    private archive: Archive,
    private provider: EmailProvider,
  ) {}
  async settings(
    p: Principal,
    db: s.Database | s.Transaction = this.db,
  ): Promise<MailSettings> {
    await authorize(db, p, 'read');
    const [company] = await db
      .select()
      .from(s.organizations)
      .where(eq(s.organizations.id, p.organizationId));
    if (!company)
      throw new AppError('NOT_FOUND', 'Unternehmen nicht gefunden.');
    const result = await db.execute(
      sql`SELECT settings FROM email_settings WHERE organization_id=${p.organizationId}`,
    );
    return mailSettingsSchema.parse(
      (result.rows[0]?.settings as MailSettings) ?? {
        language: 'de',
        senderName: company.name,
        replyTo: company.email,
        contactEmail: company.email,
        contactPhone: company.contactPhone,
        ...defaults('de'),
      },
    );
  }
  async saveSettings(p: Principal, raw: unknown) {
    const value = mailSettingsSchema.parse(raw);
    await this.db.transaction(async (tx) => {
      await authorize(tx, p, 'company:write');
      await tx.execute(
        sql`INSERT INTO email_settings VALUES (${p.organizationId},${JSON.stringify(value)}::jsonb) ON CONFLICT (organization_id) DO UPDATE SET settings=excluded.settings`,
      );
      await this.event(tx, p, 'delivery.settings.updated', p.organizationId);
    });
  }
  private async event(
    tx: s.Transaction,
    p: Principal,
    eventType: string,
    id: string,
    metadata: Record<string, string> = {},
  ) {
    await appendAudit(tx, {
      organizationId: p.organizationId,
      actorId: p.userId,
      requestId: p.requestId,
      eventType,
      entityType: 'invoice',
      entityId: id,
      metadata,
    });
    if (eventType !== 'delivery.settings.updated')
      await tx
        .insert(s.outbox)
        .values({
          organizationId: p.organizationId,
          entityId: id,
          eventType: 'financial.invoice.changed',
          requestId: p.requestId,
        });
  }
  private async authoritative(
    db: s.Database | s.Transaction,
    org: string,
    id: string,
  ) {
    const [row] = await db
      .select({
        document: s.invoiceDocuments,
        invoice: s.invoices,
        run: s.validationRuns,
      })
      .from(s.invoices)
      .innerJoin(
        s.invoiceDocuments,
        and(
          eq(s.invoiceDocuments.invoiceId, s.invoices.id),
          eq(s.invoiceDocuments.organizationId, s.invoices.organizationId),
        ),
      )
      .innerJoin(
        s.validationRuns,
        and(
          eq(s.validationRuns.id, s.invoiceDocuments.validationRunId),
          eq(s.validationRuns.organizationId, s.invoices.organizationId),
        ),
      )
      .where(and(eq(s.invoices.organizationId, org), eq(s.invoices.id, id)));
    if (
      !row ||
      !row.invoice.finalizedAt ||
      !row.run.valid ||
      row.run.purpose !== 'ISSUANCE' ||
      row.run.invoiceId !== id ||
      row.run.candidateHash !== row.document.sha256 ||
      row.document.profile !== 'XRECHNUNG'
    )
      throw new AppError(
        'CONFLICT',
        'Eine finalisierte, validierte XRechnung ist erforderlich.',
      );
    return row;
  }
  async compose(p: Principal, id: string) {
    z.uuid().parse(id);
    await authorize(this.db, p, 'invoice:send');
    const { document, invoice } = await this.authoritative(
      this.db,
      p.organizationId,
      id,
    );
    const service = new InvoiceService(this.db),
      detail = await service.invoice(p, id),
      company = await service.company(p),
      settings = await this.settings(p);
    const [user] = await this.db
      .select()
      .from(s.user)
      .where(eq(s.user.id, p.userId));
    const buyer = detail.parties.find((v) => v.kind === 'BUYER')!;
    const date = (v: string | null) =>
      v
        ? new Intl.DateTimeFormat(
            settings.language === 'de' ? 'de-DE' : 'en-GB',
            { timeZone: 'UTC' },
          ).format(new Date(v))
        : '';
    const values: Record<string, string> = {
      'customer.name': buyer.name,
      'customer.contact_name': buyer.contactName || '',
      'invoice.number': invoice.number!,
      'invoice.issue_date': date(invoice.issueDate),
      'invoice.due_date': date(invoice.dueDate),
      'invoice.total': new Intl.NumberFormat(
        settings.language === 'de' ? 'de-DE' : 'en-GB',
        { style: 'currency', currency: invoice.currency },
      ).format(Number(invoice.payable)),
      'company.name': company.name,
      'company.email': settings.contactEmail,
      'company.phone': settings.contactPhone,
      'user.name': user?.name ?? '',
    };
    return {
      recipient: buyer.email,
      subject: renderTemplate(settings.subject, values),
      message:
        renderTemplate(settings.message, values) +
        '\n\n' +
        renderTemplate(settings.signature, values),
      senderName: settings.senderName,
      replyTo: settings.replyTo,
      attachment: {
        filename: this.filename(invoice.number!),
        sha256: document.sha256,
        size: Number(document.size),
      },
    };
  }
  private filename(number: string) {
    return number.replace(/[^A-Za-z0-9_-]/g, '_') + '.xml';
  }
  async history(p: Principal, id: string) {
    await new InvoiceService(this.db).invoice(p, id);
    return (
      await this.db.execute(
        sql`SELECT * FROM invoice_deliveries WHERE organization_id=${p.organizationId} AND invoice_id=${id} ORDER BY created_at DESC LIMIT 100`,
      )
    ).rows as unknown as Attempt[];
  }
  async enqueue(p: Principal, id: string, raw: unknown) {
    z.uuid().parse(id);
    const input = sendSchema.parse(raw);
    const hash = digest({ id, ...input });
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM organizations WHERE id=${p.organizationId} FOR UPDATE`,
      );
      await authorize(tx, p, 'invoice:send');
      const existing = (
        await tx.execute(
          sql`SELECT * FROM invoice_deliveries WHERE organization_id=${p.organizationId} AND request_key=${input.key}`,
        )
      ).rows[0];
      if (existing) {
        if (existing.request_hash !== hash)
          throw new AppError(
            'CONFLICT',
            'Dieser Versandauftrag wurde bereits verwendet.',
          );
        return existing.id as string;
      }
      const { document, invoice } = await this.authoritative(
        tx,
        p.organizationId,
        id,
      );
      const previous = (
        await tx.execute(
          sql`SELECT * FROM invoice_deliveries WHERE organization_id=${p.organizationId} AND invoice_id=${id} ORDER BY created_at DESC LIMIT 1`,
        )
      ).rows[0];
      if (
        previous &&
        (previous.id !== input.resendOf || previous.status === 'QUEUED')
      )
        throw new AppError(
          'CONFLICT',
          'Bitte prüfen Sie den letzten Versand und wählen Sie bewusst „Erneut senden“.',
        );
      if (!previous && input.resendOf)
        throw new AppError('CONFLICT', 'Versandversuch nicht gefunden.');
      const count = (
        await tx.execute(
          sql`SELECT count(*)::int AS n FROM invoice_deliveries WHERE organization_id=${p.organizationId} AND created_at>now()-interval '1 hour'`,
        )
      ).rows[0]!;
      if (
        Number(count.n) >= 100 ||
        (previous &&
          new Date(previous.created_at as string).getTime() >
            Date.now() - 30000)
      )
        throw new AppError(
          'CONFLICT',
          'Versandlimit erreicht. Bitte versuchen Sie es später erneut.',
        );
      const settings = await this.settings(p, tx);
      const attempt = randomUUID();
      await tx.execute(
        sql`INSERT INTO invoice_deliveries (id,organization_id,invoice_id,document_id,actor_id,request_id,request_key,request_hash,recipient,subject,message,sender_name,reply_to,attachment_hash,filename,resend_of) VALUES (${attempt},${p.organizationId},${id},${document.id},${p.userId},${p.requestId},${input.key},${hash},${input.recipient},${input.subject},${input.message},${settings.senderName},${settings.replyTo},${document.sha256},${this.filename(invoice.number!)},${input.resendOf ?? null})`,
      );
      await tx.insert(s.outbox).values({
        organizationId: p.organizationId,
        eventType: 'delivery.requested',
        entityId: attempt,
        requestId: p.requestId,
      });
      await this.event(tx, p, 'delivery.queued', id, {
        attemptId: attempt,
        documentId: document.id,
        sha256: document.sha256,
      });
      return attempt;
    });
  }
  async process(org: string, id: string) {
    // Persist the claim BEFORE external I/O. Never automatically retry an ambiguous SMTP submission.
    const result = await this.db.execute(
      sql`UPDATE invoice_deliveries SET claimed_at=now(),provider=${this.provider.name} WHERE organization_id=${org} AND id=${id} AND channel='EMAIL' AND status='QUEUED' AND claimed_at IS NULL RETURNING *`,
    );
    const attempt = result.rows[0] as unknown as Attempt | undefined;
    if (!attempt) {
      const stale = (
        await this.db.execute(
          sql`SELECT * FROM invoice_deliveries WHERE organization_id=${org} AND id=${id} AND channel='EMAIL' AND status='QUEUED' AND claimed_at<now()-interval '2 minutes'`,
        )
      ).rows[0] as unknown as Attempt | undefined;
      if (stale) await this.finish(stale, 'FAILED', null, 'SUBMISSION_UNKNOWN');
      return;
    }
    let providerId: string;
    try {
      const p = {
        organizationId: org,
        userId: attempt.actor_id,
        requestId: attempt.request_id,
      };
      await authorize(this.db, p, 'invoice:send');
      const { document } = await this.authoritative(
        this.db,
        org,
        attempt.invoice_id,
      );
      if (
        document.id !== attempt.document_id ||
        document.sha256 !== attempt.attachment_hash
      )
        throw Error('ATTACHMENT_INTEGRITY');
      const bytes = await this.archive.get(
        document.objectKey,
        document.objectVersion,
      );
      if (
        hashBytes(bytes) !== attempt.attachment_hash ||
        BigInt(bytes.length) !== document.size
      )
        throw Error('ATTACHMENT_INTEGRITY');
      providerId = await this.provider.send({
        id: attempt.id,
        recipient: attempt.recipient,
        subject: attempt.subject,
        message: attempt.message,
        senderName: attempt.sender_name,
        replyTo: attempt.reply_to,
        attachments: [
          {
            filename: attempt.filename,
            content: bytes,
            contentType: document.mimeType,
          },
        ],
      });
    } catch (error) {
      await this.finish(
        attempt,
        'FAILED',
        null,
        error instanceof AppError
          ? 'AUTHORIZATION'
          : error instanceof Error && error.message === 'ATTACHMENT_INTEGRITY'
            ? 'ATTACHMENT_INTEGRITY'
            : 'SUBMISSION_UNKNOWN',
      );
      return;
    }
    await this.finish(attempt, 'SUBMITTED', providerId, null);
  }
  private async finish(
    a: Attempt,
    status: string,
    providerId: string | null,
    error: string | null,
  ) {
    await this.db.transaction(async (tx) => {
      const changed = await tx.execute(
        sql`UPDATE invoice_deliveries SET status=${status},provider_id=${providerId},error_code=${error},updated_at=now() WHERE id=${a.id} AND organization_id=${a.organization_id} AND status='QUEUED' RETURNING id`,
      );
      if (changed.rows.length)
        await this.event(
          tx,
          {
            organizationId: a.organization_id,
            userId: a.actor_id,
            requestId: a.request_id,
          },
          status === 'SUBMITTED' ? 'delivery.submitted' : 'delivery.failed',
          a.invoice_id,
          { attemptId: a.id },
        );
    });
  }
  async receipt(body: string, timestamp: string, signature: string) {
    const secret = process.env.DELIVERY_WEBHOOK_SECRET;
    if (
      !secret ||
      secret.length < 32 ||
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !/^[a-f0-9]{64}$/.test(signature)
    )
      throw Error('INVALID_RECEIPT');
    const expected = createHmac('sha256', secret)
      .update(timestamp + '.' + body)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      throw Error('INVALID_RECEIPT');
    const input = z
      .object({
        eventId: z.string().min(1).max(200),
        attemptId: z.uuid(),
        providerId: z.string().min(1).max(300),
        status: z.enum(['DELIVERED', 'BOUNCED', 'FAILED']),
      })
      .strict()
      .parse(JSON.parse(body));
    await this.db.transaction(async (tx) => {
      const a = (
        await tx.execute(
          sql`SELECT * FROM invoice_deliveries WHERE id=${input.attemptId} FOR UPDATE`,
        )
      ).rows[0] as unknown as Attempt | undefined;
      if (!a || a.provider !== 'gateway' || a.provider_id !== input.providerId)
        throw Error('RECEIPT_NOT_READY');
      const inserted = await tx.execute(
        sql`INSERT INTO delivery_receipts(event_id,attempt_id) VALUES (${input.eventId},${a.id}) ON CONFLICT DO NOTHING RETURNING event_id`,
      );
      if (!inserted.rows.length || a.status !== 'SUBMITTED') return;
      await tx.execute(
        sql`UPDATE invoice_deliveries SET status=${input.status},updated_at=now() WHERE id=${a.id}`,
      );
      await this.event(
        tx,
        {
          organizationId: a.organization_id,
          userId: 'delivery-provider',
          requestId: randomUUID(),
        },
        'delivery.' + input.status.toLowerCase(),
        a.invoice_id,
        { attemptId: a.id },
      );
    });
  }
}
