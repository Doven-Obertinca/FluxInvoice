# Architecture decisions

## 001 — Decimal strings and decimal.js

All financial input crosses boundaries as decimal strings, never JS numbers. A private decimal.js constructor uses 40 significant digits and half-up rounding. Quantities/prices permit six decimals; money rounds to two. Product amount rounds to cents; line allowances/charges round separately; line nets group by rate; document allowances/charges modify their tax group before group-level tax rounding. Money formatting never converts through native Number. Bounds reject unsupported magnitudes and tax categories. This policy is deterministic, unit/property tested and versioned as FLUX_DRAFT/1; it must be reconciled against official semantic rules before fiscal output. PostgreSQL numeric columns independently constrain storage.

## 002 — Better Auth and centralized authorization

Use Better Auth 1.7.7 with Drizzle/PostgreSQL and Next's cookie adapter, rather than custom password/session cryptography. Verification/reset delivery uses SMTP. Authorization is an independent permission layer so future API adapters reuse the same services. Better Auth's plugin architecture offers a path to MFA/SSO; SCIM requires a reviewed provisioning integration. No unused authentication provider is pretended to be configured.

Sources verified 2026-10-06: [Next.js integration](https://better-auth.com/docs/integrations/next), [email/password](https://better-auth.com/docs/authentication/email-password), [rate limiting](https://better-auth.com/docs/concepts/rate-limit). Installed package types were used to verify APIs.

## 003 — PostgreSQL transactional outbox

Use existing PostgreSQL for Phase 1 jobs instead of introducing a second distributed datastore. Business transaction and outbox insert are atomic. SKIP LOCKED claims and fenced leases support multiple workers; bounded retries and dead-letter state expose failures. Delivery is at least once, so future provider handlers need event-ID idempotency and reconciliation. Current handlers only record internal event consumption.

## 004 — Tenant/year numbering

Allocate a number inside the finalization transaction with an atomic PostgreSQL upsert protected by the tenant lock. A unique tenant/number index is the final backstop. Prefix is configurable, year is explicit, sequence is bigint. Drafts do not consume numbers. Tested concurrent transactions and rollback. No claim of legally required gaplessness is made.

## 005 — Relational snapshots and gated finalization

Invoice parties, lines, adjustments and tax breakdowns are relational, tenant-owned snapshots. Finalization is disabled at the database until Phase 2 has a verified artifact/archive recovery path. Document metadata anticipates S3 versioning/Object Lock, versioned retention and hashes without pretending an archive exists. A storage adapter/validator choice is deferred until actual runtime, specification and retention constraints have been verified.

## 006 — Workspace and tooling

Use npm workspaces with a single exact lockfile and strict TypeScript, including unchecked index access and exact optional properties. Node 24.21.0 is the selected LTS toolchain. Next 16.3.8/React 19.3.0 and Drizzle 0.45.3 were resolved from current stable npm versions. Next's current React/import lint plugins require ESLint 9; ESLint 10 was tested and rejected due to incompatible APIs. Pin 9.39.5, retain all rules and track upstream compatibility. Third-party dev-tool advisories are explicitly recorded in SECURITY.md.

The legacy Drizzle loader uses esbuild's transform API; a global 0.28.2 override removes its vulnerable 0.18 transitive release. Migration generation and the complete application gate verify compatibility.

## Phase 2 decisions

See [Phase 2 ADRs](PHASE-2.md) for semantic/profile versioning, XML serialization, authoritative Java validation, archive trust, PostgreSQL/object-storage recovery, and the product design system.

See [document-to-draft boundary](DOCUMENT-DRAFTS.md) for reviewed outgoing invoice preparation and separation from any future inbound E-Rechnung workflow.
