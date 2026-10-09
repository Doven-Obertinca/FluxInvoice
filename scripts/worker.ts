import { DeliveryService } from '../packages/application/src/delivery';
import { emailProvider } from '../packages/application/src/email-provider';
import { resolve } from 'node:path';
import { IncomingService } from '../packages/application/src/incoming';
import { EinvoiceService } from '../packages/application/src/einvoice';
import { complianceRuntime } from '../packages/application/src/runtime';
import 'dotenv/config';
import { setTimeout } from 'node:timers/promises';
import { environment } from '@flux/shared';
import { connect } from '@flux/db';
import { processOne } from '../packages/application/src/outbox';
import { logOperation, metric } from '@flux/observability';
const { db, pool } = connect(environment().DATABASE_URL);
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
      logOperation({
        requestId: job.requestId,
        operation: job.eventType,
        result: 'consumed',
      });
    },
  ]),
);
const delivery = new DeliveryService(db, runtime.archive, emailProvider());
handlers['delivery.requested'] = (job) =>
  delivery.process(job.organizationId, job.entityId);
handlers['incoming.process'] = (job) =>
  incoming.process(job.organizationId, job.entityId);
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
    if (!(await processOne(db, handlers))) await setTimeout(1000);
  }
} finally {
  await pool.end();
}
