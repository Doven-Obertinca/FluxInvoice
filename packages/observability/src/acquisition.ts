import { metrics } from '@opentelemetry/api';
import { z } from 'zod';
const eventSchema = z.enum([
  'organic_landing_view',
  'free_tool_started',
  'free_tool_completed',
  'signup_started',
  'signup_completed',
  'invoice_started',
  'invoice_finalized',
  'free_invoice_1',
  'free_invoice_2',
  'free_invoice_3',
  'free_quota_reached',
  'pricing_viewed',
  'upgrade_clicked',
  'checkout_started',
  'subscription_created',
]);
const propertiesSchema = z
  .object({
    plan: z.enum(['FREE', 'STARTER', 'BUSINESS', 'PRO']).optional(),
    route: z
      .enum(['home', 'pricing', 'viewer', 'signup', 'workspace'])
      .optional(),
    result: z.enum(['success', 'failure']).optional(),
  })
  .strict();
const counter = metrics
  .getMeter('erechno.acquisition', '1.0.0')
  .createCounter('erechno.acquisition.events');
/** No external exporter is installed here. Payloads cannot contain arbitrary user data. */
export function acquisitionEvent(
  event: z.infer<typeof eventSchema>,
  properties: z.infer<typeof propertiesSchema> = {},
) {
  const attributes = {
    event: eventSchema.parse(event),
    ...propertiesSchema.parse(properties),
  };
  try {
    counter.add(1, attributes);
  } catch {
    /* Telemetry must never fail a business operation. */
  }
}
