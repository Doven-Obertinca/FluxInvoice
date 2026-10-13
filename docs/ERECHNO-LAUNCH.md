# ERechno launch architecture and audit

## Current state

Next.js App Router and server actions adapt a relational PostgreSQL domain. Authentication uses Better Auth, verified email, database rate limits and secure production cookies. Sessions derive the tenant from persisted membership. Services authorize and scope resources; composite foreign keys enforce tenant relationships. Organization row locks serialize mutations. Decimal arithmetic, frozen invoice snapshots, KoSIT validation, numbered issuance, exact-byte archival, idempotency and outbox recovery already exist. Preserve these boundaries.

The product supports German domestic EUR XRechnung UBL invoices with 19%/7% VAT, incoming UBL/CII inspection, original downloads, email delivery, customer management and reviewed local OCR import. It does **not** support ZUGFeRD issuance, authoritative downloadable invoice PDFs, VAT exemptions/Kleinunternehmer issuance, credit notes, DATEV, Peppol, paid checkout or product catalogs. A browser preview is not an invoice PDF. Do not advertise those as shipped.

The root previously redirected to the private dashboard. Branding was duplicated, no public SEO routes existed, and no subscriptions or quota enforcement existed. Existing security defenses should be retained; this audit is not a penetration test or compliance certification.

## Launch decisions and migration

1. Centralize public brand and plan definitions in shared modules. Retain `@flux/*`, database names, storage locations, historical validation identifiers, metrics and fixture/test account identities. Rename human-facing text without changing issued artifacts or historical migrations.
2. Add organization subscriptions and per-invoice usage reservations with composite tenant foreign keys. New organizations default to Free. Backfill finalized historical invoices into their actual Berlin calendar month; never rewrite invoice bytes or numbers. Apply migrations before deploying quota-aware workers.
3. Free/Starter/Business/Pro limits are 3/25/100/500. Price cents are 0/399/799/1499. Paid checkout must remain unavailable until a billing provider is selected and verified webhook processing is implemented. A client must never assign its own plan. Published prices are intended monthly prices; tax presentation must be settled before commercial launch.
4. Drafts and checks are free. Reserve capacity before enqueueing finalization; consume once in the same transaction as successful issuance. Pending reservations prevent parallel bypass. Use PostgreSQL time and Europe/Berlin calendar months. Recheck rollover before number allocation and final commit. Failed readiness releases capacity; recoverable numbered jobs retain their reservation. Retry of an issued invoice consumes nothing extra. Cancelling does not refund usage; a future newly issued correction/credit note consumes its own slot, but these workflows are currently unsupported.
5. Subscription access has explicit active-period bounds. Expired/non-active paid subscriptions fall back to Free. Cancellation at period end preserves access until paid expiry. Provider event IDs, monotonic updates, webhook signatures, currency/amount checks, cancellation and refund policy are required before paid activation. No unauthenticated upgrade endpoint.

Reservations already admitted in the same calendar month are honored during recovery, including after paid access expires; they cannot create extra admissions. Rollover moves a reservation to the month of successful issuance and checks that month's capacity again. Infrastructure failures keep recoverable slots reserved. An unnumbered invalid invoice releases its slot; an allocated fiscal number is never discarded to reset a quota. Subscription updates must acquire the same organization lock. Usage time and invoice finalization time come from the same PostgreSQL clock reading.

## Search intent and route map

| Intent                                            | Canonical destination              | Value                                              |
| ------------------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| E-Rechnung kostenlos erstellen / online generator | `/`                                | Free offer, actual signup → create workflow        |
| Preis / Softwarevergleich                         | `/preise`                          | Central plan comparison and precise availability   |
| XRechnung erstellen                               | `/xrechnung`                       | Supported scope and direct creation link           |
| XRechnung anzeigen / öffnen                       | `/kostenlos/xrechnung-anzeigen`    | Local-only XML viewer                              |
| E-Rechnung empfangen                              | `/e-rechnung-empfangen`            | Existing authenticated inbox and review workflow   |
| XRechnung oder ZUGFeRD                            | `/ratgeber/xrechnung-oder-zugferd` | Actual format differences and support boundaries   |
| Sicherheit / Hilfe                                | `/sicherheit`, `/hilfe`            | Processing boundaries and useful workflow guidance |

Merge overlapping generator/free/software routes using permanent redirects, rather than creating doorway pages. Do not generate profession-specific thin pages or market unsupported Kleinunternehmer tax treatment. Later add researched legal guides, actual validator tools and ZUGFeRD creation only with verified capabilities. Anonymous official validation needs a bounded isolated worker, rate limits, hardened XML parsing, no network resolution, deadlines, ephemeral storage and clear privacy policy. Reuse KoSIT; never equate a viewer/parser with validation.

## SEO and trust architecture

Public pages use server rendering, distinct metadata, canonical URLs, German headings, internal links, Open Graph and truthful WebApplication/Breadcrumb markup. Sitemap is an explicit public allowlist. Private layouts/auth pages and API responses use noindex; sessions still enforce access. Robots blocking is not access control. A configured canonical origin determines sitemap and metadata; the production proxy must enforce HTTPS and canonical host. Staging must not be indexed. Search Console verification is environment configuration, never fabricated verification data.

Keep public pages free of authentication/database imports. Use responsive CSS and minimal client code; lazy-load the XML viewer. Measure CWV in a production deployment before claiming targets. No fake ratings, reviews or blanket legal assurances. Company identity, address, legal notice, privacy controller/subprocessors/retention, contact and billing tax details are release dependencies requiring owner facts, not invented legal pages.

## Analytics and conversion

Track only allowlisted event names and bounded properties (plan, public route, count bucket, result). Never export document text, names, email, bank details, tax identifiers, invoice IDs or arbitrary URLs. Consent and retention must be defined before enabling an external analytics provider. Google impressions come from Search Console, not browser tracking. Server business audit remains separate from marketing analytics. Preserve operational logs without financial content. Start with usage feedback and pricing links; real checkout/subscription events require a real provider.

Implemented aggregate OpenTelemetry instruments observe successful signup, invoice creation, issuance and the first/second/third Free invoice and quota reached. They contain no tenant/user/document identifiers. The outbox delivers at least once, so aggregate counters are observational and may duplicate on retry; the immutable usage ledger is authoritative for billing. No external exporter or client tracker is installed. Organic attribution, consent-based browser events, Search Console import and checkout events remain integration work.

## Phases and release gates

P0: retain fiscal validation/immutability and tenant isolation; test quota concurrency, rollback, retries, expiry and migration. P1: brand, Free entitlement, paid catalog, public homepage/pricing, usage UI, private noindex, sitemap and metadata; complete Starter checkout and verified provider webhooks once the owner chooses a provider. P2: useful viewer and researched content, then anonymous validator and supported ZUGFeRD/PDF capabilities. P3: DATEV, API and reviewed automation as independent deliverables. Never enable an integration via a marketing flag alone.

Production launch requires legal/contact/domain details, billing/tax decisions, live archive assurance, production migrations and worker grants, official validation checks, deployment CWV and Search Console verification. The existing private invoice data and historical identifiers remain intact.

## Implemented and verified

Central brand constants, UI/auth email branding, plan catalog, tenant subscription schema, server quota admission/consumption, immutable usage history, historical backfill, dashboard/invoice usage and billing view are implemented. Public homepage, pricing, XRechnung creation explanation, incoming explanation, comparison guide, help/security/about, local XML viewer, metadata, public sitemap allowlist, robots, private noindex headers, redirects, icon, manifest and Open Graph image are implemented. Legal/privacy/contact pages accept owner-provided text and remain noindex; absent facts are explicitly unfinished.

Local migration was applied successfully. Lint, TypeScript and production build passed. The full existing suite plus quota tests passed (120 tests); final fiscal/quota/privacy checks passed (32 tests). The signup/invoice/import/auth-origin browser workflows passed, as did the separate desktop/mobile accessibility, local viewer privacy, DTD rejection and private indexing checks. Screenshots were reviewed at 1280 and 390 px. CWV targets are not claimed from these checks.

Paid checkout, full legal content, public anonymous validation, ZUGFeRD/PDF issuance, additional guides, catalogs and growth integrations are not shipped by this phase. Restart the development launcher after updating so its long-running worker loads the new quota logic. Production deployments must coordinate migrations, worker rollout and refreshed runtime grants.

Subsequent pricing iteration: all four plans are selectable through signup/onboarding, with modern aligned cards and hosted Stripe checkout/webhooks/portal code. Merchant configuration and real test-mode payment verification remain required; see [billing setup and provider limitations](BILLING.md). Card and recurring PayPal are supported by the adapter. Klarna is excluded from the B2B flow under Stripe's eligibility rules.
