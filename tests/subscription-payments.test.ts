import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import * as s from '@flux/db';
import { fixture } from '../packages/einvoice/fixtures/supported';
import { dropTestDatabase } from './database-cleanup';
import {
  SubscriptionPayments,
  verifiedPricePlan,
  type PaymentConfig,
} from '../packages/application/src/subscription-payments';
import { BillingService } from '../packages/application/src/billing';
const name = `flux_test_${randomUUID().replaceAll('-', '')}`;
const adminUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://flux:flux@localhost:5432/postgres';
const admin = new Pool({ connectionString: adminUrl });
const url = new URL(adminUrl);
url.pathname = '/' + name;
const { db, pool } = s.connect(url.toString());
const config: PaymentConfig = {
  origin: 'http://localhost:3000',
  webhookSecret: 'whsec_test_secret',
  prices: {
    STARTER: 'price_starter',
    BUSINESS: 'price_business',
    PRO: 'price_pro',
  },
  paypal: true,
  automaticTax: false,
  portalConfiguration: 'bpc_test',
};
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  await migrate(db, { migrationsFolder: 'packages/db/migrations' });
});
afterAll(async () => {
  await pool.end();
  await dropTestDatabase(admin, name);
  await admin.end();
});
const price = (id = 'price_starter', amount = 399) =>
  ({
    id,
    active: true,
    type: 'recurring',
    currency: 'eur',
    unit_amount: amount,
    recurring: { interval: 'month', interval_count: 1 },
  }) as Stripe.Price;
async function scenario() {
  const userId = randomUUID();
  await db
    .insert(s.user)
    .values({ id: userId, name: 'Test', email: `${userId}@example.test` });
  const [organization] = await db
    .insert(s.organizations)
    .values({ ...fixture.seller, numberPrefix: 'RE-' })
    .returning();
  const p = {
    organizationId: organization!.id,
    userId,
    requestId: randomUUID(),
  };
  await db
    .insert(s.members)
    .values({ organizationId: p.organizationId, userId, role: 'OWNER' });
  const stripe = new Stripe('sk_test_not_a_real_key');
  vi.spyOn(stripe.billingPortal.configurations, 'retrieve').mockResolvedValue({
    active: true,
    features: { subscription_cancel: { enabled: true, mode: 'at_period_end' } },
  } as never);
  const sessions = new Map<string, Stripe.Checkout.Session>();
  vi.spyOn(stripe.customers, 'create').mockResolvedValue({
    id: `cus_${userId}`,
  } as never);
  vi.spyOn(stripe.prices, 'retrieve').mockImplementation(
    async (id) =>
      price(
        id,
        id === 'price_business' ? 799 : id === 'price_pro' ? 1499 : 399,
      ) as never,
  );
  const create = vi
    .spyOn(stripe.checkout.sessions, 'create')
    .mockImplementation(async () => {
      const id = `cs_test_${randomUUID()}`;
      const session = {
        id,
        url: `https://checkout.stripe.com/c/pay/${id}`,
        status: 'open',
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        subscription: null,
      } as Stripe.Checkout.Session;
      sessions.set(id, session);
      return session as never;
    });
  vi.spyOn(stripe.checkout.sessions, 'retrieve').mockImplementation(
    async (id) => sessions.get(id)! as never,
  );
  vi.spyOn(stripe.checkout.sessions, 'expire').mockImplementation(
    async (id) => {
      const session = sessions.get(id)!;
      session.status = 'expired';
      return session as never;
    },
  );
  const payments = new SubscriptionPayments(db, stripe, config);
  return { p, stripe, payments, create, sessions };
}
async function subscription(p: { organizationId: string }, paid = true) {
  const [binding] = await db
    .select()
    .from(s.billingCheckouts)
    .where(eq(s.billingCheckouts.organizationId, p.organizationId));
  const start = Math.floor(Date.now() / 1000) - 60,
    end = start + 2592000;
  return {
    id: `sub_${p.organizationId}`,
    customer: binding!.customerId,
    status: paid ? 'active' : 'past_due',
    cancel_at_period_end: false,
    metadata: {
      organization_id: p.organizationId,
      checkout_request_key: binding!.requestKey,
    },
    items: {
      data: [
        {
          price: price(),
          quantity: 1,
          current_period_start: start,
          current_period_end: end,
        },
      ],
    },
    latest_invoice: {
      status: paid ? 'paid' : 'open',
      currency: 'eur',
      amount_paid: paid ? 399 : 0,
      lines: {
        data: [
          {
            pricing: { price_details: { price: 'price_starter' } },
            period: { start, end },
          },
        ],
      },
    },
  } as unknown as Stripe.Subscription;
}
function signed(
  stripe: Stripe,
  sub: Stripe.Subscription,
  id = `evt_${randomUUID()}`,
  timestamp?: number,
) {
  const raw = JSON.stringify({
    id,
    object: 'event',
    type: 'customer.subscription.updated',
    data: { object: sub },
  });
  return {
    raw,
    signature: stripe.webhooks.generateTestHeaderString({
      payload: raw,
      secret: config.webhookSecret,
      ...(timestamp ? { timestamp } : {}),
    }),
  };
}
it('parallel clicks reuse one checkout and never grant paid access from selection', async () => {
  const { p, payments, create } = await scenario();
  const urls = await Promise.all(
    Array.from({ length: 6 }, () => payments.checkout(p, 'STARTER')),
  );
  expect(new Set(urls).size).toBe(1);
  expect(create).toHaveBeenCalledTimes(1);
  const params = create.mock.calls[0]![0]!;
  expect(params.mode).toBe('subscription');
  expect(params.allowed_payment_method_types).toEqual(['card', 'paypal']);
  expect(params.line_items).toEqual([{ price: 'price_starter', quantity: 1 }]);
  expect((await new BillingService(db).usage(p)).plan).toBe('FREE');
});
it('switching plans expires the old checkout instead of leaving two payable sessions', async () => {
  const { p, payments, create, sessions } = await scenario();
  await payments.checkout(p, 'STARTER');
  await payments.checkout(p, 'BUSINESS');
  expect(create).toHaveBeenCalledTimes(2);
  expect(
    [...sessions.values()].filter((s) => s.status === 'open'),
  ).toHaveLength(1);
  expect(create.mock.calls[1]![0]!.line_items).toEqual([
    { price: 'price_business', quantity: 1 },
  ]);
});
it('restricts payment changes to authenticated tenant owners', async () => {
  const { p, payments, create } = await scenario();
  await db
    .update(s.members)
    .set({ role: 'VIEWER' })
    .where(eq(s.members.userId, p.userId));
  await expect(payments.checkout(p, 'STARTER')).rejects.toMatchObject({
    code: 'AUTHORIZATION',
  });
  await expect(
    payments.checkout({ ...p, userId: 'spoofed-user' }, 'STARTER'),
  ).rejects.toMatchObject({ code: 'AUTHORIZATION' });
  expect(create).not.toHaveBeenCalled();
});
it('requires valid fresh webhook signatures, a paid invoice, and server-owned customer binding', async () => {
  const { p, payments, stripe } = await scenario();
  await payments.checkout(p, 'STARTER');
  let latest = await subscription(p);
  const retrieve = vi
    .spyOn(stripe.subscriptions, 'retrieve')
    .mockImplementation(async () => latest as never);
  const message = signed(stripe, latest);
  await expect(payments.webhook(message.raw, 'invalid')).rejects.toThrow();
  const expired = signed(
    stripe,
    latest,
    undefined,
    Math.floor(Date.now() / 1000) - 3600,
  );
  await expect(
    payments.webhook(expired.raw, expired.signature),
  ).rejects.toThrow();
  expect(retrieve).not.toHaveBeenCalled();
  const rightCustomer = latest.customer;
  latest.customer = 'cus_wrong_tenant';
  await payments.webhook(message.raw, message.signature);
  expect((await new BillingService(db).usage(p)).plan).toBe('FREE');
  latest.customer = rightCustomer;
  await payments.webhook(message.raw, message.signature);
  await payments.webhook(message.raw, message.signature);
  expect(await new BillingService(db).usage(p)).toMatchObject({
    plan: 'STARTER',
    limit: 25,
  });
  await expect(payments.checkout(p, 'PRO')).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  expect(
    await db
      .select()
      .from(s.billingEvents)
      .where(eq(s.billingEvents.organizationId, p.organizationId)),
  ).toHaveLength(1);
  latest = await subscription(p, false);
  await db
    .update(s.subscriptions)
    .set({
      periodStart: new Date(Date.now() - 172800000),
      periodEnd: new Date(Date.now() - 86400000),
    })
    .where(eq(s.subscriptions.organizationId, p.organizationId));
  const failure = signed(stripe, latest);
  await payments.webhook(failure.raw, failure.signature);
  expect((await new BillingService(db).usage(p)).plan).toBe('FREE');
  // An older signed event must retrieve current provider state, not resurrect access.
  const oldEvent = signed(stripe, await subscription(p));
  await payments.webhook(oldEvent.raw, oldEvent.signature);
  expect((await new BillingService(db).usage(p)).plan).toBe('FREE');
});
it('accepts a provider-paid prorated change and preserves access until period-end cancellation', async () => {
  const { p, payments, stripe } = await scenario();
  await payments.checkout(p, 'STARTER');
  const latest = await subscription(p);
  latest.cancel_at_period_end = true;
  const invoice = latest.latest_invoice as Stripe.Invoice;
  invoice.amount_paid = 199;
  latest.items.data[0]!.current_period_start -= 86400;
  vi.spyOn(stripe.subscriptions, 'retrieve').mockResolvedValue(latest as never);
  const message = signed(stripe, latest);
  await payments.webhook(message.raw, message.signature);
  expect(await new BillingService(db).usage(p)).toMatchObject({
    plan: 'STARTER',
    limit: 25,
  });
});
it('rejects mismatched currency, amount, cadence and unknown provider prices', () => {
  for (const value of [
    { ...price(), currency: 'usd' },
    price('price_starter', 1),
    price('price_unknown'),
    { ...price(), recurring: { interval: 'year', interval_count: 1 } },
  ])
    expect(() => verifiedPricePlan(value as Stripe.Price, config)).toThrow(
      'BILLING_PRICE_MISMATCH',
    );
});

it('keeps the already paid tier during an unpaid upgrade and activates the new tier only after payment', async () => {
  const { p, payments, stripe } = await scenario();
  await payments.checkout(p, 'STARTER');
  const latest = await subscription(p);
  vi.spyOn(stripe.subscriptions, 'retrieve').mockImplementation(
    async () => latest as never,
  );
  let message = signed(stripe, latest);
  await payments.webhook(message.raw, message.signature);
  latest.items.data[0]!.price = price('price_business', 799);
  const invoice = latest.latest_invoice as Stripe.Invoice;
  invoice.status = 'open';
  invoice.lines.data[0]!.pricing!.price_details!.price = 'price_business';
  message = signed(stripe, latest);
  await payments.webhook(message.raw, message.signature);
  expect((await new BillingService(db).usage(p)).plan).toBe('STARTER');
  invoice.status = 'paid';
  message = signed(stripe, latest);
  await payments.webhook(message.raw, message.signature);
  expect(await new BillingService(db).usage(p)).toMatchObject({
    plan: 'BUSINESS',
    limit: 100,
  });
});
