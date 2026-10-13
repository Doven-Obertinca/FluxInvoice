# ERechno subscription checkout

The application now offers all four selectable plans. Selecting a plan stores an HTTP-only, one-day preference cookie; it grants no entitlement and charges nothing. Selection survives signup, verification/sign-in and company onboarding. Free proceeds to the workspace. Paid plans proceed to hosted checkout after the merchant connects billing.

## Provider and methods

The implemented adapter uses the official Stripe SDK, pinned at 23.0.0. It offers eligible enabled card methods and optionally PayPal recurring payments. Checkout collects billing information at Stripe; ERechno never receives card numbers. No business invoice, source document, customer IBAN or tax data from the user's invoice workflow is sent to Stripe. The platform account email and opaque organization identifier establish billing ownership; Stripe collects the subscriber's billing address/tax identity.

Stripe's Klarna integration does not support B2B purchases. Therefore this German business SaaS does not present Klarna as a working checkout method. Adding Klarna requires a provider arrangement explicitly eligible for these purchases; it must not be enabled by simply changing a UI label.

Official references checked 12 October 2026: [Checkout API](https://docs.stripe.com/api/checkout/sessions/create), [PayPal recurring support](https://docs.stripe.com/payments/paypal), [Klarna eligibility](https://docs.stripe.com/payments/klarna), [subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks).

## Connect a merchant account

1. Apply database migrations. For production, provision a separate `flux_billing` role and apply `scripts/billing-grants.sql`; reapply normal runtime restrictions in `scripts/runtime-grants.sql`. Set `BILLING_DATABASE_URL` to that role. The normal app role can read billing state but cannot assign paid access.
2. In Stripe test mode, create three EUR monthly recurring Prices, interval count 1, quantity 1: Starter 399 cents, Business 799 cents and Pro 1499 cents. Set the corresponding `STRIPE_PRICE_*` environment values. The server verifies actual provider price/currency/cadence against the shared catalog before Checkout and after payment.
3. Configure a Stripe Customer Portal configuration with cancellation enabled **at period end**. Set `STRIPE_PORTAL_CONFIGURATION`. Checkout verifies this policy before creating the payment page. Enable allowed plan changes only among the configured catalog prices. The portal manages cancellation and existing subscriptions; new Checkout cannot stack a second paid subscription on the same organization.
4. Configure tax behavior, merchant tax registrations, legal selling information, invoices/receipts and the tax wording beside displayed prices. If using Stripe Tax, configure it fully and set `STRIPE_AUTOMATIC_TAX=true`. Prices and public tax disclosures must agree before enabling live billing. Do not silently change an existing Price ID/cadence or delete historical catalog mappings when introducing new pricing; grandfathered subscriptions need an explicit migration/catalog extension.
5. Configure a signed webhook endpoint at `/api/billing/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` and `invoice.payment_action_required`. Use the matching mode's webhook signing secret.
6. Set the private `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, canonical `APP_URL`, price IDs and portal configuration in the deployment secret/environment manager. Enable recurring PayPal in Stripe and obtain any required approval before setting `STRIPE_PAYPAL_ENABLED=true`. Set `BILLING_ENABLED=true` only after test payments, renewals, failed payments and cancellation have been exercised against the real test merchant.
7. Rebuild public pages and restart the app after configuration. Use live credentials only after the same release checks. Do not paste secret keys into chat or commit them.

## Payment correctness

Only a persisted tenant OWNER may initiate or manage payments. Server Actions apply Next.js origin protection. Prices and customer ownership come from the server. One organization has one current customer/checkout binding. Before creating a Checkout session the request key is persisted; repeated and concurrent clicks reuse it. A known open session is expired before changing plans. Uncertain responses are recovered using the same Stripe idempotency key. Customer creation is also idempotent. Existing unpaid/active subscriptions block duplicate Checkout.

A browser return, selected plan or signed event's status alone never grants access. Webhooks validate the raw payload signature and its timestamp, retrieve current Stripe subscription state, check the server-created customer/request binding, verify the price and quantity, and require a paid EUR invoice matching the current billing period. Tenant locks serialize provider snapshots; event IDs are processed once transactionally. Invalid signatures cause 400; processing/provider failures cause 500 so Stripe retries. A completed write and its event receipt commit together. Payloads, signatures and provider errors are never logged or returned to the browser.

Paid access expires at the recorded provider period end. A failed renewal falls back to Free after paid access expires. An unpaid mid-period upgrade retains the already-paid lower tier until its original expiry; it cannot grant the higher tier. Cancellation at period end preserves active paid access until expiry. Invoice usage still resets by Europe/Berlin **calendar month**, while subscription charges recur from the purchase date. Downloads and drafts remain available. Refunds/disputes require an explicit merchant policy and corresponding provider cancellation/adjustment; refunds alone are not a promise to rewrite issued invoice history.

## Verification and limits

Automated tests use a real isolated PostgreSQL schema and mocked Stripe resource responses, plus the SDK's real webhook signature implementation. They cover concurrent checkout reuse, switching-plan expiration, tenant/owner authorization, signature rejection/expiry, paid invoice activation, replay idempotency, stale events and provider price mismatches. They do not constitute a live merchant or PayPal approval test. No real charge was made during implementation.

Absent merchant configuration, every plan remains selectable and the billing page explains why payment is not yet available. The existing Free experience remains usable; paid access cannot be granted by an unchecked URL or UI state.

Final verification: production build, TypeScript and lint passed; 128 unit/integration tests passed. Existing invoice/auth browser workflows passed. Desktop/mobile pricing checks verified aligned buttons, accessibility, all four plan choices, and persistence across the registration/sign-in pages. Screenshots were reviewed. Live Stripe/PayPal merchant verification remains pending configuration.
