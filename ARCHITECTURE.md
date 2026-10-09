# Architecture

## Boundaries

The web adapter authenticates sessions and derives the active organization from the user's earliest persisted membership. Browser organization IDs are never accepted. A principal is an internal capability input, not proof of authentication by itself: only the server session adapter may construct it from a browser request. An explicit membership-validated organization selector can be added later.

Every application service checks membership and permission; every resource lookup is tenant scoped. Composite `(organization_id, resource_id)` foreign keys prevent linking customers, addresses, invoice lines, tax groups, documents and validation issues across tenants. PostgreSQL roles should limit direct table access; application query scoping is the primary read-isolation boundary. RLS is not claimed.

Mutation transactions lock the organization row before checking permissions and writing data. This serializes writes per tenant, simplifies audit and idempotency correctness, and bounds deadlock patterns. Future membership changes must take the same lock. This trades throughput within a very large tenant for simpler correctness. Different tenants remain concurrent. Audit additionally uses a transaction-scoped advisory lock for independent safe appends.

`invoice-core` imports only Zod and decimal.js. It has no Next.js, React, database, authentication or transport dependency. The client uses it for advisory preview; the service always validates and recalculates independently. Persisted invoices use typed relational columns, not primary JSON documents. JSON is limited to allowlisted audit metadata.

## Database tables

| Area                        | Tables                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Authentication              | users, sessions, accounts, verifications, rate_limits                                                          |
| Tenants                     | organizations, organization_members                                                                            |
| Customers                   | customers, customer_addresses                                                                                  |
| Invoices                    | invoices, invoice_items, invoice_parties, invoice_adjustments, invoice_tax_summaries, invoice_number_sequences |
| Validation/documents        | validation_runs, validation_issues, invoice_documents, document_checks, einvoice_jobs                          |
| Reliability                 | audit_events, outbox_events, idempotency_keys                                                                  |
| Future integration metadata | api_keys, webhook_endpoints, webhook_deliveries, integration_connections                                       |

All tenant-owned tables have explicit ownership. Authentication records are global identities with user foreign keys. Cross-tenant resource references use composite keys. Constraints cover supported currency/country/tax rates, nonnegative values, arithmetic totals, revision positivity, due dates, statuses, unique numbers and numbering ranges. Migration `0000_initial_schema` creates the tables; `0001_invariants` installs mutation guards; `0002_timestamps` adds distinct update/availability timestamps; `0003_tenant_indexes` reinforces tenant event references and lookup indexes. Phase 2 adds `0004_einvoice_jobs` (profile/archive/job metadata) and `0005_fiscal_guards` (frozen snapshots, issuance prerequisites, retained validation and job identity). Apply via the Drizzle migration journal; don't use schema push in deployments.

## Draft write transaction

1. Authenticate before entering the service; validate strict input and calculate totals.
2. Lock organization; verify membership and permission.
3. Resolve actor-bound idempotency key + canonical request hash; return prior resource for an identical retry, reject conflicting reuse.
4. Look up the customer in the same organization.
5. Check editable state and expected revision for updates.
6. Persist invoice, line amounts, tax summaries, adjustments and seller/buyer snapshots atomically.
7. Append chained audit event, persist outbox event and successful idempotency result.
8. Commit, then revalidate the UI.

A draft never receives a fiscal invoice number. `allocateNumber` is an internal transactional primitive used by the finalization worker. It locks the tenant, atomically increments the yearly sequence and uses tenant-specific prefix configuration; rollback also rolls back allocation. Thirty simultaneous database transactions are tested.

The original `FLUX_DRAFT/1` validation remains recognizable as a domain check. E-Rechnung readiness uses the current revision's official XRechnung validation. Readiness and issuance runs retain profile, specification, bundle, validator, CEN, manifest/candidate/report hashes, duration, issues and purpose. Editing increments revision and returns to DRAFT while preserving history.

## Lifecycle and immutability

`EinvoiceService` enqueues tenant-scoped VALIDATE/FINALIZE jobs through the transactional outbox. Finalization permission is limited to OWNER, ADMIN and ACCOUNTANT. A FINALIZE job freezes the invoice and children; the worker validates a candidate, reserves a permanent fiscal number, validates the exact numbered artifact, conditionally archives it, verifies a readback, then atomically records metadata, final state, audit and outbox. No external storage call is treated as part of a PostgreSQL transaction.

Once a number is reserved, failure leaves the invoice frozen for recovery. Completed documents, validation records and invoice content are immutable. The database verifies matching issuance validation/job/document identities before FINALIZED. Cancellation, payment recording, sending and credit workflows are not exposed in this phase. Pre-existing enum values are not claims of enabled workflows.

Seller/buyer snapshots are copied at each draft save. Downloads fetch the original object version and verify SHA-256 and length; they never regenerate XML from mutable master data. The local adapter is not WORM. Production requires verified S3 Object Lock, versioning and encryption. See [Phase 2 ADRs](docs/adr/PHASE-2.md) for the complete failure protocol and [compliance boundary](COMPLIANCE.md) for sources/scope.

## Audit/outbox

Events include actor, tenant, entity, request ID, sequence, UTC millisecond timestamp, safe metadata, previous hash and event hash. Canonical serialization sorts keys without locale-dependent ordering, rejects unsupported values and represents sequence as a decimal string. PostgreSQL triggers prevent UPDATE, DELETE and TRUNCATE even by the ordinary table owner. A database superuser can bypass triggers; hashes alone cannot protect against a fully privileged rewrite. Export/sign independent chain heads before claiming stronger tamper evidence. Verification optionally accepts an independently held expected head to detect truncation.

Outbox claims use `FOR UPDATE SKIP LOCKED`, an expiring 180-second lease, unique lease token, bounded exponential backoff and an eight-attempt dead-letter state. Lease tokens fence stale completion. Handlers are **at least once** and must deduplicate externally by event ID; a lease does not make HTTP effects exactly once. Fiscal jobs additionally use a session advisory lock; process deadlines fit within the selected lease. Unknown event types fail closed and dead-letter. `einvoice.requested` runs the real validator/archive handler. Other events have operational logging subscribers; no external delivery integration is claimed.

## UI/data flow

RSC pages fetch tenant-scoped, paginated data. Server Actions are the only business mutation adapter. Client state is limited to form input, preview tabs, pending state and user feedback; no duplicated TanStack Query cache is needed. Customers/invoices list 50 records per page. The invoice editor searches customers server-side with bounded result sets and always retains the selected customer.

Design tokens support explicit persisted light/dark mode and system preference. Navigation, native labels, keyboard-operated tabs, focus rings, skip link and responsive layouts are implemented. The preview is intentionally labeled unissued. Advanced draft JSON is separate from normal form labels. No WCAG certification is claimed.

## Observability and operational tools

Safe structured logs record request correlation, operation, result, duration and controlled error code. OpenTelemetry API instruments expose low-cardinality duration/count measurements; an operator-provided SDK/exporter is required to export them. Reconciliation scans documents in bounded pages and reports aggregate counts, appending integrity observations and optionally requeueing stale recoverable jobs. Audit history remains the detailed tenant-scoped business record. The benchmark command records reproducible fixture timings, not production capacity guarantees.

## Reviewed document input

The later letter/QR extension adds `packages/document-import` for pure bounded extraction and EPC parsing, and a client-only reader/review page at `/invoices/import`. OCR, PDF and QR libraries are lazy-loaded with prepared same-origin assets. Source text and previews are ephemeral. Only explicit user-reviewed fields enter the existing editor and unchanged save/validate/finalize protocol; no invoice number, bank master data, tenant identity or state is imported. See [document import decisions](docs/DOCUMENT-IMPORT.md).

The product presents this alternative as **Aus Dokument erstellen**, alongside the primary **Neue Rechnung** action. Missing imported financial/date values stay blank in incomplete UI form state; the strict invoice input schema and server service still reject missing values. A future incoming XML workflow must use its own direction, model, permissions and original-artifact lifecycle, as specified in [the boundary ADR](docs/adr/DOCUMENT-DRAFTS.md). It is not implemented by this extension.

## Product-intelligence read workflows

The October 2026 product-intelligence iteration adds authenticated workspace discovery and an outgoing attention queue without a new fiscal lifecycle or migration. Search returns at most eight invoice snapshots and eight customer records, with fixed local destinations and no source documents or bank details. Literal wildcard escaping and narrowly recognized decimal strings prevent accidental broad/ambiguous queries. Server Actions derive the principal and log only operation metadata. The client debounces requests, suppresses superseded responses, clears results when changing the query, and exposes retryable failures.

The attention query selects latest current-revision XRechnung evidence and processing jobs within tenant ownership; active retries suppress old validation failures. It observes processing failures, failed validation and overdue issued invoices independently from payment confirmation. Calendar comparison uses Europe/Berlin. Pagination is bounded at 25 rows with deterministic ordering. It never marks paid, sends reminders or changes fiscal state. Incoming records remain outside this query and require the separate model described in the document-drafts ADR.

Correction guidance is product metadata, not a validator or automatic repair engine. It links to the exact customer record or company settings and explains that draft snapshots must be saved again. Unknown fields do not expose a nonfunctional field-jump button. Existing official validation, permissions, version guards and finalization remain authoritative. See [research](docs/PRODUCT-RESEARCH-2026.md), [roadmap](docs/PRODUCT-ROADMAP-2026.md) and [delivery evidence](docs/PRODUCT-IMPLEMENTATION-REPORT.md).

## Separately authorized incoming workflow

The subsequent inbox extension implements the separate domain required above: `/incoming`, tenant-owned immutable originals, append-only checks, dedicated permissions and asynchronous archive/validation processing. `packages/incoming` projects UBL/CII without applying the outgoing fiscal schema. Approval uses current validation evidence and explicit business review; it neither issues an invoice nor initiates payment. Future ingestion channels share the intake/outbox boundary. See [incoming architecture and delivery evidence](docs/INCOMING-INVOICES.md).
