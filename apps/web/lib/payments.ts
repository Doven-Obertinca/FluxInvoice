import 'server-only';
import { connect } from '@flux/db';
import { validateProduction } from '@flux/shared';
import {
  paymentConfig,
  stripeClient,
  SubscriptionPayments,
} from '../../../packages/application/src/subscription-payments';
const state = globalThis as typeof globalThis & {
  erechnoBilling?: ReturnType<typeof connect>;
};
export function payments() {
  validateProduction(process.env);
  const config = paymentConfig();
  if (!config) return null;
  if (process.env.APP_ENV === 'production' && !process.env.BILLING_DATABASE_URL)
    throw new Error('Separate billing database role required');
  const url = process.env.BILLING_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Billing database missing');
  const connection = (state.erechnoBilling ??= connect(url));
  return new SubscriptionPayments(connection.db, stripeClient(), config);
}
