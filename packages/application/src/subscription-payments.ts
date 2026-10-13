import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '@flux/db';
import { authorize, type Principal } from '@flux/auth';
import { AppError, APP_NAME, PLANS, type PlanId } from '@flux/shared';
export type PaidPlan = Exclude<PlanId, 'FREE'>;
export type PaymentConfig = {
  origin: string;
  webhookSecret: string;
  prices: Record<PaidPlan, string>;
  paypal: boolean;
  automaticTax: boolean;
  portalConfiguration: string;
};
export function paymentConfig(): PaymentConfig | null {
  if (
    process.env.BILLING_ENABLED !== 'true' ||
    !process.env.STRIPE_SECRET_KEY ||
    !process.env.STRIPE_WEBHOOK_SECRET
  )
    return null;
  if (!process.env.STRIPE_PORTAL_CONFIGURATION) return null;
  const prices = {
    STARTER: process.env.STRIPE_PRICE_STARTER,
    BUSINESS: process.env.STRIPE_PRICE_BUSINESS,
    PRO: process.env.STRIPE_PRICE_PRO,
  };
  if (!prices.STARTER || !prices.BUSINESS || !prices.PRO) return null;
  if (
    new Set(Object.values(prices)).size !== 3 ||
    Object.values(prices).some((id) => !/^price_[A-Za-z0-9]+$/.test(id!))
  )
    throw new Error('Invalid billing price configuration');
  const url = new URL(
    process.env.APP_URL ??
      process.env.BETTER_AUTH_URL ??
      'http://localhost:3000',
  );
  if (
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    !['http:', 'https:'].includes(url.protocol)
  )
    throw new Error('Invalid billing origin');
  if (
    process.env.APP_ENV === 'production' &&
    (!process.env.APP_URL || url.protocol !== 'https:')
  )
    throw new Error('Production billing requires a canonical HTTPS origin');
  return {
    origin: url.origin,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    prices: prices as Record<PaidPlan, string>,
    paypal: process.env.STRIPE_PAYPAL_ENABLED === 'true',
    automaticTax: process.env.STRIPE_AUTOMATIC_TAX === 'true',
    portalConfiguration: process.env.STRIPE_PORTAL_CONFIGURATION,
  };
}
export function stripeClient() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    timeout: 10000,
    maxNetworkRetries: 1,
  });
}
function objectId(value: string | { id: string } | null) {
  return typeof value === 'string' ? value : value?.id;
}
export function verifiedPricePlan(
  price: Stripe.Price,
  config: PaymentConfig,
): PaidPlan {
  const plan = (Object.keys(config.prices) as PaidPlan[]).find(
    (id) => config.prices[id] === price.id,
  );
  if (
    !plan ||
    price.currency !== 'eur' ||
    price.unit_amount !== PLANS[plan].monthlyPriceCents ||
    price.recurring?.interval !== 'month' ||
    price.recurring.interval_count !== 1 ||
    price.type !== 'recurring'
  )
    throw new Error('BILLING_PRICE_MISMATCH');
  return plan;
}
/** Uses a separate billing DB role in production. No client can assign entitlements. */
export class SubscriptionPayments {
  constructor(
    private readonly db: s.Database,
    private readonly stripe: Stripe,
    private readonly config: PaymentConfig,
  ) {}
  private async owner(tx: s.Transaction, p: Principal) {
    await tx.execute(
      sql`SELECT id FROM organizations WHERE id=${p.organizationId} FOR UPDATE`,
    );
    const membership = await authorize(tx, p, 'read');
    if (membership.role !== 'OWNER')
      throw new AppError(
        'AUTHORIZATION',
        'Nur der Inhaber kann den kostenpflichtigen Tarif verwalten.',
      );
  }
  async checkout(p: Principal, value: unknown) {
    const plan = z.enum(['STARTER', 'BUSINESS', 'PRO']).parse(value);
    // Persist provider customer and request identity BEFORE creating a session.
    // An uncertain network result can then be retried with the same Stripe key.
    await this.db.transaction(async (tx) => {
      await this.owner(tx, p);
      const [binding] = await tx
        .select()
        .from(s.billingCheckouts)
        .where(eq(s.billingCheckouts.organizationId, p.organizationId));
      if (binding) return;
      const [user] = await tx
        .select({ email: s.user.email })
        .from(s.user)
        .where(eq(s.user.id, p.userId));
      const customer = await this.stripe.customers.create(
        { email: user!.email, metadata: { organization_id: p.organizationId } },
        { idempotencyKey: `erechno-customer-${p.organizationId}` },
      );
      await tx.insert(s.billingCheckouts).values({
        organizationId: p.organizationId,
        customerId: customer.id,
        plan,
        requestKey: randomUUID(),
      });
    });
    // Prepare or reuse a stable intent; never permit two open sessions per tenant.
    await this.db.transaction(async (tx) => {
      await this.owner(tx, p);
      const [binding] = await tx
        .select()
        .from(s.billingCheckouts)
        .where(eq(s.billingCheckouts.organizationId, p.organizationId));
      if (binding!.subscriptionId) {
        const subscription = await this.stripe.subscriptions.retrieve(
          binding!.subscriptionId,
        );
        if (!['canceled', 'incomplete_expired'].includes(subscription.status))
          throw new AppError(
            'CONFLICT',
            'Es besteht bereits ein Abonnement. Bitte öffnen Sie die Abo-Verwaltung.',
          );
      }
      if (binding!.sessionId) {
        const prior = await this.stripe.checkout.sessions.retrieve(
          binding!.sessionId,
        );
        if (prior.status === 'complete' && objectId(prior.subscription)) {
          const subscription = await this.stripe.subscriptions.retrieve(
            objectId(prior.subscription)!,
          );
          if (!['canceled', 'incomplete_expired'].includes(subscription.status))
            throw new AppError(
              'CONFLICT',
              'Die Zahlung wird bereits verarbeitet. Bitte öffnen Sie die Abo-Verwaltung oder laden Sie später neu.',
            );
        }
        if (prior.status === 'open' && binding!.plan === plan) return;
        if (prior.status === 'open')
          await this.stripe.checkout.sessions.expire(prior.id);
        await tx
          .update(s.billingCheckouts)
          .set({
            plan,
            requestKey: randomUUID(),
            sessionId: null,
            subscriptionId: null,
            expiresAt: null,
            updatedAt: new Date(),
          })
          .where(eq(s.billingCheckouts.organizationId, p.organizationId));
      } else if (binding!.plan !== plan) {
        // A previously attempted session might exist despite a lost response.
        // Recover it with its original parameters before switching plans.
        const recovered = await this.createSession(p.organizationId, binding!);
        if (recovered.status !== 'open')
          throw new AppError(
            'CONFLICT',
            'Bitte prüfen Sie den bisherigen Zahlungsvorgang in der Abo-Verwaltung.',
          );
        await this.stripe.checkout.sessions.expire(recovered.id);
        await tx
          .update(s.billingCheckouts)
          .set({ plan, requestKey: randomUUID(), updatedAt: new Date() })
          .where(eq(s.billingCheckouts.organizationId, p.organizationId));
      }
    });
    return this.db.transaction(async (tx) => {
      await this.owner(tx, p);
      const [binding] = await tx
        .select()
        .from(s.billingCheckouts)
        .where(eq(s.billingCheckouts.organizationId, p.organizationId));
      if (binding!.plan !== plan)
        throw new AppError(
          'CONFLICT',
          'Die Tarifauswahl wurde geändert. Bitte erneut wählen.',
        );
      const session = binding!.sessionId
        ? await this.stripe.checkout.sessions.retrieve(binding!.sessionId)
        : await this.createSession(p.organizationId, binding!);
      if (session.status !== 'open' || !session.url)
        throw new AppError(
          'CONFLICT',
          'Bitte prüfen Sie den bisherigen Zahlungsvorgang.',
        );
      await tx
        .update(s.billingCheckouts)
        .set({
          sessionId: session.id,
          expiresAt: new Date(session.expires_at * 1000),
          updatedAt: new Date(),
        })
        .where(eq(s.billingCheckouts.organizationId, p.organizationId));
      return session.url;
    });
  }
  private async createSession(
    organizationId: string,
    binding: typeof s.billingCheckouts.$inferSelect,
  ) {
    if (binding.plan === 'FREE') throw new Error('INVALID_PAID_PLAN');
    const portal = await this.stripe.billingPortal.configurations.retrieve(
      this.config.portalConfiguration,
    );
    if (
      !portal.active ||
      !portal.features.subscription_cancel.enabled ||
      portal.features.subscription_cancel.mode !== 'at_period_end'
    )
      throw new Error('BILLING_CANCELLATION_NOT_CONFIGURED');
    const price = await this.stripe.prices.retrieve(
      this.config.prices[binding.plan],
    );
    if (!price.active || verifiedPricePlan(price, this.config) !== binding.plan)
      throw new Error('BILLING_PRICE_MISMATCH');
    return this.stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: binding.customerId,
        line_items: [{ price: price.id, quantity: 1 }],
        allowed_payment_method_types: this.config.paypal
          ? ['card', 'paypal']
          : ['card'],
        billing_address_collection: 'required',
        tax_id_collection: { enabled: true },
        customer_update: { address: 'auto', name: 'auto' },
        automatic_tax: { enabled: this.config.automaticTax },
        success_url: `${this.config.origin}/billing?checkout=returned`,
        cancel_url: `${this.config.origin}/billing?checkout=cancelled`,
        client_reference_id: organizationId,
        subscription_data: {
          metadata: {
            organization_id: organizationId,
            checkout_request_key: binding.requestKey,
          },
        },
        metadata: { organization_id: organizationId },
        custom_text: {
          submit: {
            message: `${APP_NAME} ${PLANS[binding.plan].name} · monatliches Abonnement. Monatlich kündbar.`,
          },
        },
      },
      { idempotencyKey: `erechno-checkout-${binding.requestKey}` },
    );
  }
  async portal(p: Principal) {
    return this.db.transaction(async (tx) => {
      await this.owner(tx, p);
      const [binding] = await tx
        .select()
        .from(s.billingCheckouts)
        .where(eq(s.billingCheckouts.organizationId, p.organizationId));
      if (!binding)
        throw new AppError(
          'NOT_FOUND',
          'Es besteht noch kein zahlungspflichtiges Abonnement.',
        );
      return (
        await this.stripe.billingPortal.sessions.create({
          customer: binding.customerId,
          configuration: this.config.portalConfiguration,
          return_url: `${this.config.origin}/billing`,
        })
      ).url;
    });
  }
  async webhook(raw: string, signature: string) {
    const event = this.stripe.webhooks.constructEvent(
      raw,
      signature,
      this.config.webhookSecret,
      300,
    );
    let subscriptionId: string | undefined;
    const object = event.data.object;
    if (event.type.startsWith('customer.subscription.'))
      subscriptionId = (object as Stripe.Subscription).id;
    else if (event.type.startsWith('checkout.session.'))
      subscriptionId = objectId(
        (object as Stripe.Checkout.Session).subscription,
      );
    else if (event.type.startsWith('invoice.'))
      subscriptionId = objectId(
        (object as Stripe.Invoice).parent?.subscription_details?.subscription ??
          null,
      );
    if (!subscriptionId) return;
    const [processed] = await this.db
      .select({ id: s.billingEvents.id })
      .from(s.billingEvents)
      .where(eq(s.billingEvents.id, event.id));
    if (processed) return;
    // The signed payload identifies the resource, never grants paid access itself.
    const lookup = await this.stripe.subscriptions.retrieve(subscriptionId);
    const organizationId = z.uuid().safeParse(lookup.metadata.organization_id);
    if (!organizationId.success) return;
    await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM organizations WHERE id=${organizationId.data} FOR UPDATE`,
      );
      const [seen] = await tx
        .select()
        .from(s.billingEvents)
        .where(eq(s.billingEvents.id, event.id));
      if (seen) return;
      const [binding] = await tx
        .select()
        .from(s.billingCheckouts)
        .where(eq(s.billingCheckouts.organizationId, organizationId.data));
      // Retrieve latest provider state while holding the tenant lock: older events
      // cannot overwrite a newer renewal/cancellation snapshot.
      const subscription = await this.stripe.subscriptions.retrieve(
        subscriptionId!,
        { expand: ['latest_invoice'] },
      );
      if (
        !binding ||
        binding.customerId !== objectId(subscription.customer) ||
        subscription.metadata.checkout_request_key !== binding.requestKey ||
        (binding.subscriptionId && binding.subscriptionId !== subscription.id)
      )
        return;
      if (subscription.items.data.length !== 1)
        throw new Error('UNEXPECTED_SUBSCRIPTION_ITEMS');
      const item = subscription.items.data[0]!;
      const plan = verifiedPricePlan(item.price, this.config);
      if (item.quantity !== 1)
        throw new Error('UNEXPECTED_SUBSCRIPTION_QUANTITY');
      const invoice = subscription.latest_invoice;
      const paid =
        invoice &&
        typeof invoice !== 'string' &&
        invoice.status === 'paid' &&
        invoice.currency === 'eur' &&
        // Provider-paid invoices also cover legitimate prorations/customer credit.
        // The catalog price and quantity were verified independently above.
        invoice.lines.data.some(
          (line) =>
            line.pricing?.price_details?.price === item.price.id &&
            line.period.start >= item.current_period_start &&
            line.period.start <= Math.floor(Date.now() / 1000) &&
            line.period.start < item.current_period_end &&
            line.period.end === item.current_period_end,
        );
      const active = subscription.status === 'active' && !!paid;
      const status = active
        ? 'ACTIVE'
        : subscription.status === 'canceled'
          ? 'CANCELLED'
          : 'PAST_DUE';
      const [previous] = await tx
        .select()
        .from(s.subscriptions)
        .where(eq(s.subscriptions.organizationId, organizationId.data));
      const keepPaidPeriod =
        !active &&
        subscription.status !== 'canceled' &&
        previous?.status === 'ACTIVE' &&
        previous.providerSubscriptionId === subscription.id &&
        previous.periodEnd &&
        previous.periodEnd > new Date();
      const state = {
        plan,
        status,
        periodStart: new Date(item.current_period_start * 1000),
        periodEnd: new Date(item.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        providerCustomerId: binding.customerId,
        providerSubscriptionId: subscription.id,
        updatedAt: new Date(),
      };
      // An unpaid mid-period upgrade must not erase the already paid lower tier.
      if (keepPaidPeriod)
        Object.assign(state, {
          plan: previous.plan,
          status: 'ACTIVE',
          periodStart: previous.periodStart,
          periodEnd: previous.periodEnd,
        });
      await tx
        .insert(s.subscriptions)
        .values({ organizationId: organizationId.data, ...state })
        .onConflictDoUpdate({
          target: s.subscriptions.organizationId,
          set: state,
        });
      await tx
        .update(s.billingCheckouts)
        .set({ subscriptionId: subscription.id, plan, updatedAt: new Date() })
        .where(eq(s.billingCheckouts.organizationId, organizationId.data));
      await tx.insert(s.billingEvents).values({
        id: event.id,
        organizationId: organizationId.data,
        type: event.type,
      });
    });
  }
}
