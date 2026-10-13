import { AutopilotService } from '../packages/application/src/autopilot';
import { DeliveryService } from '../packages/application/src/delivery';
import { emailProvider } from '../packages/application/src/email-provider';
import { resolve } from 'node:path';
import { IncomingService } from '../packages/application/src/incoming';
import { EinvoiceService } from '../packages/application/src/einvoice';
import { complianceRuntime } from '../packages/application/src/runtime';
import 'dotenv/config';
import { setTimeout } from 'node:timers/promises';
import { environment } from '@flux/shared';
import { connect, auditEvents } from '@flux/db';
import { and, eq } from 'drizzle-orm';
import { processOne } from '../packages/application/src/outbox';
import { logOperation, metric, acquisitionEvent } from '@flux/observability';
const { db, pool } = connect(environment('worker').DATABASE_URL);
const runtime = complianceRuntime(resolve('.'));
const einvoice = new EinvoiceService(
  db,
  pool,
  runtime.validator,
  runtime.archive,
);
const incoming = new IncomingService(
  db,
  pool,
  runtime.validator,
  runtime.archive,
);
const autopilot = new AutopilotService(db);
let nextReconcile = 0;
let running = true;
process.on('SIGTERM', () => {
  running = false;
});
process.on('SIGINT', () => {
  running = false;
});
// Phase 1 events have no external subscribers. Record consumption; add idempotent
// external handlers only with their integrations in subsequent phases.
const types = [
  'organization.created',
  'organization.updated',
  'customer.created',
  'customer.updated',
  'invoice.created',
  'invoice.updated',
  'invoice.validated',
  'einvoice.validated',
  'einvoice.failed',
  'invoice.finalized',
  'document.downloaded',
];
const handlers = Object.fromEntries(
  types.map((type) => [
    type,
    async (job: import('../packages/application/src/outbox').Job) => {
      if (job.eventType === 'invoice.created')
        acquisitionEvent('invoice_started', { route: 'workspace' });
      if (job.eventType === 'invoice.finalized') {
        acquisitionEvent('invoice_finalized', {
          route: 'workspace',
          result: 'success',
        });
        const [audit] = await db
          .select({ metadata: auditEvents.metadata })
          .from(auditEvents)
          .where(
            and(
              eq(auditEvents.organizationId, job.organizationId),
              eq(auditEvents.entityId, job.entityId),
              eq(auditEvents.eventType, 'invoice.finalized'),
            ),
          )
          .limit(1);
        if (audit?.metadata.usagePlan === 'FREE') {
          const count = audit.metadata.usageCount;
          if (count === 1) acquisitionEvent('free_invoice_1', { plan: 'FREE' });
          if (count === 2) acquisitionEvent('free_invoice_2', { plan: 'FREE' });
          if (count === 3) {
            acquisitionEvent('free_invoice_3', { plan: 'FREE' });
            acquisitionEvent('free_quota_reached', { plan: 'FREE' });
          }
        }
      }
      if (
        job.eventType.startsWith('invoice.') ||
        job.eventType.startsWith('einvoice.')
      )
        await autopilot.reconcile(job.organizationId, 'invoice', job.entityId);
      logOperation({
        requestId: job.requestId,
        operation: job.eventType,
        result: 'consumed',
      });
    },
  ]),
);
handlers['financial.invoice.changed'] = (job) =>
  autopilot.reconcile(job.organizationId, 'invoice', job.entityId);
handlers['financial.incoming.changed'] = (job) =>
  autopilot.reconcile(job.organizationId, 'incoming', job.entityId);
const delivery = new DeliveryService(db, runtime.archive, emailProvider());
handlers['delivery.requested'] = (job) =>
  delivery.process(job.organizationId, job.entityId);
handlers['incoming.process'] = async (job) => {
  await incoming.process(job.organizationId, job.entityId);
  await autopilot.reconcile(job.organizationId, 'incoming', job.entityId);
};
handlers['einvoice.requested'] = async (job) => {
  const started = performance.now();
  try {
    await einvoice.process(job.organizationId, job.entityId);
    metric('job.process', 'success', performance.now() - started);
    logOperation({
      requestId: job.requestId,
      operation: 'einvoice.process',
      result: 'completed',
      durationMs: Math.round(performance.now() - started),
    });
  } catch {
    metric('job.process', 'failure', performance.now() - started);
    logOperation({
      requestId: job.requestId,
      operation: 'einvoice.process',
      result: 'failed',
      durationMs: Math.round(performance.now() - started),
      errorCode: 'EINVOICE_RETRY_REQUIRED',
    });
    throw new Error('EINVOICE_RETRY_REQUIRED');
  }
};
try {
  while (running) {
    if (Date.now() >= nextReconcile) {
      nextReconcile = Date.now() + 10000;
      try {
        await autopilot.pulse();
      } catch {
        logOperation({
          requestId: crypto.randomUUID(),
          operation: 'autopilot.reconcile',
          result: 'failed',
          errorCode: 'RECONCILE_RETRY_REQUIRED',
        });
      }
    }
    if (!(await processOne(db, handlers))) await setTimeout(1000);
  }
} finally {
  await pool.end();
}
