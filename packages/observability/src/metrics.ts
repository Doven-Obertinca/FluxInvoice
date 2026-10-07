import { metrics } from '@opentelemetry/api';
const meter = metrics.getMeter('fluxinvoice', '0.2.0');
const operations = meter.createCounter('fluxinvoice.operations', {
  description: 'Completed e-invoice operations',
});
const duration = meter.createHistogram('fluxinvoice.operation.duration', {
  unit: 'ms',
  description: 'E-invoice operation duration',
});
export function metric(
  operation:
    | 'job.process'
    | 'validation'
    | 'finalization'
    | 'archive.write'
    | 'archive.read',
  result: 'success' | 'failure',
  durationMs: number,
) {
  const attributes = { operation, result };
  operations.add(1, attributes);
  duration.record(durationMs, attributes);
}
