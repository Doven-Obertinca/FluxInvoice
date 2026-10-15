import pino from 'pino';
// Only accept an allowlist of operational data, never arbitrary request/error objects.
const logger = pino({ level: 'info', base: null });
export function logOperation(data: {
  requestId: string;
  operation: string;
  result: string;
  durationMs?: number;
  errorCode?: string;
  errorName?: string;
  errorMessage?: string;
}) {
  logger.info(data);
}

// Low-cardinality instruments. A deployment may attach its OpenTelemetry SDK;
// no tenant, invoice, email, reference or document content is a metric label.
export { metric } from './metrics';
export { acquisitionEvent } from './acquisition';
