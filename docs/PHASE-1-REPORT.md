# Phase 1 implementation report

Date: 2026-10-06. Scope: Phase 1 only. The repository initially contained only `README.md`; no working infrastructure was replaced.

## Delivered architecture and modules

An npm workspace with strict TypeScript, Node 24 LTS, Next.js App Router/React, PostgreSQL/Drizzle and independent domain/application packages. `invoice-core` is protected by a lint import boundary against Next.js, React and persistence/auth packages.

| Location                                | Delivered responsibility                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app`                          | Protected dashboard, onboarding, customer list/detail, invoice list/new/detail, company/member/API/integration settings; sign-in/up/reset screens |
| `apps/web/components`                   | German responsive shell, customer/company forms, invoice editor, live preview, keyboard-accessible validation/data tabs, Radix/CVA button         |
| `apps/web/lib`                          | Better Auth configuration, session-derived principals, guarded Server Actions and safe errors                                                     |
| `packages/invoice-core`                 | Decimal money/VAT, mixed tax groups, discounts/charges, totals, input/domain validation, lifecycle, number formatting                             |
| `packages/db`                           | 25 relational tables, tenant references, constraints, indexes and migrations                                                                      |
| `packages/application`                  | Transactional organization/customer/invoice services, snapshots, revisions, idempotency, validation, numbering, leased outbox worker              |
| `packages/auth`                         | Membership checks and OWNER/ADMIN/ACCOUNTANT/MEMBER/VIEWER permissions                                                                            |
| `packages/audit`                        | Canonical SHA-256 append and chain verification                                                                                                   |
| `packages/shared`                       | Startup environment validation, company/customer validation and typed application errors                                                          |
| `packages/observability`                | Allowlisted JSON operation logs with request IDs and durations                                                                                    |
| `scripts`, `tests`, `.github/workflows` | Database setup/migration/seed/worker tools; property, integration and browser tests; CI quality gate                                              |

Database tables: organizations, users, organization_members, sessions, accounts, verifications, rate_limits, customers, customer_addresses, invoices, invoice_items, invoice_parties, invoice_adjustments, invoice_tax_summaries, invoice_documents, invoice_number_sequences, validation_runs, validation_issues, audit_events, api_keys, webhook_endpoints, webhook_deliveries, integration_connections, idempotency_keys and outbox_events.

Four committed-source migration files: `0000_initial_schema.sql`, `0001_invariants.sql`, `0002_timestamps.sql`, `0003_tenant_indexes.sql`. All were applied successfully to isolated test databases and the local development database. A final `db:generate` reports no schema drift. No git commit was created.

## Security/correctness decisions

- Session and membership derive tenant ownership; browser input cannot set tenant, status, totals or compliance results. Strict schemas reject mass assignment. Composite foreign keys enforce tenant-consistent references.
- Decimal strings and decimal.js; two-decimal half-up monetary rounding, six-decimal quantity/price inputs, group-level VAT. Client preview is advisory; persisted totals are computed server-side and checked again during validation.
- Organization-row locks, transaction boundaries, optimistic revisions, actor-bound idempotency and unique number constraints. Drafts never consume fiscal numbers.
- Seller/buyer snapshots preserve saved history when customer master data changes. Database guards reject finalization until Phase 2 and prevent edits to immutable states.
- Audit appends and outbox writes commit with business mutations. UPDATE/DELETE/TRUNCATE audit guards, canonical chaining, expected-head verification. Hash chains do not establish full GoBD compliance.
- Better Auth owns cryptography/session controls; verification/reset SMTP is configured, secure cookie/origin protections and database-backed throttling are enabled. Password-reset revokes sessions. No credentials or invoice bodies enter application logs; request URL logging is disabled.
- Outbox uses fenced leases, SKIP LOCKED claims, exponential retries and dead letters. Future external handlers must be idempotent; no fictional delivery implementation is present.

## Commands and observed results

| Command                                           | Final result                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| `npm install` and targeted exact-version installs | Completed; lockfile pins runtime/toolchain dependencies                    |
| `npm run db:local`                                | PostgreSQL 18.4 started locally, loopback only                             |
| `npm run db:generate`                             | Four migrations produced/reviewed; final run reports no changes            |
| `npm run db:migrate`                              | All migrations applied to local development database                       |
| `npm run format:check`                            | PASS                                                                       |
| `npm run lint`                                    | PASS, zero warnings                                                        |
| `npm run typecheck`                               | PASS, strict checks enabled                                                |
| `npm test`                                        | PASS: 31 tests, 2 suites, zero skipped                                     |
| `npm run build`                                   | PASS: optimized Next.js production build, all application routes generated |
| `npm run check`                                   | PASS: lint, types, unit/integration tests and build                        |
| `npm exec playwright install chromium`            | Browser installed                                                          |
| `npm run test:e2e`                                | PASS: 2 Chromium tests against final production build                      |
| `npm audit --omit=dev --audit-level=moderate`     | PASS: zero production advisories                                           |
| `git diff --check`                                | PASS                                                                       |

Unit coverage includes mixed VAT, rounding boundaries, fractional prices/quantities, allowances, input limits, lifecycle, numbering, canonical hashing, permissions and environment/IBAN checks. A property test runs 300 random invoice cases. Database tests cover cross-tenant reads/writes/foreign keys/search, saved snapshots, total-corruption detection, concurrent idempotency, stale revisions, blocked finalization, 30 concurrent number allocations, rollback, append-only audit/tamper detection, concurrent outbox claims and dead letters.

Browser coverage: account registration/sign-in, organization onboarding, customer creation, invoice entry with mixed 19%/7% VAT, actionable validation focus, save/reload, server validation, preview, mobile overflow, sign-out/protected redirects and hostile-origin rejection. Desktop/mobile screenshots were rendered and visually inspected. This is targeted accessibility verification, not a full WCAG audit.

Issues found and corrected during verification: duplicate timestamp column names, generated foreign-key/unique-constraint ordering, incompatible ESLint 10 plugin APIs, password help-text labeling, native-select test targeting and legacy esbuild advisory. No lint/type/test suppression was used.

## Remaining risks and boundaries

1. Five development dependency audit entries remain for one underlying unpatched braces advisory through the current Next ESLint glob chain. Runtime audit is clear. ESLint 9.39.5 remains necessary for current compatible plugins. Isolate tooling to trusted CI and update when a compatible patch exists.
2. Live SMTP verification/password-reset delivery, staging ingress/cookie/IP configuration, least-privilege runtime database grants, backup restoration, penetration testing and full accessibility review require deployment-specific validation. Browser tests use an isolated test-mode email-verification bypass.
3. This is a Phase 1 drafting system. No finalized invoices, official electronic validation, immutable S3 archive, download, email/Peppol invoice delivery, credit/cancellation workflows, member invitations, tenant switching or public business API are activated. Corresponding future metadata tables do not imply implemented integrations.
4. RLS, strict nonce-based CSP, external audit-head anchoring and an OpenTelemetry exporter are not installed. Tenant-scoped service authorization is the current isolation boundary; privileged database administrators remain trusted.
5. Outbox delivery is at least once. Long-running future handlers need lease renewal, external deduplication and reconciliation. The worker currently runs via the TypeScript toolchain.
6. No real secrets were committed, no deployment was performed, and no real personal data was seeded. Local environment and database files are git-ignored. Local signup requires reachable SMTP (Mailpit via Compose or a configured alternative).

## Exact recommended next step

Provision a staging SMTP service and separate migration/runtime database identities, apply the documented grants and exercise real verification/reset delivery and restore procedures. Resolve or formally accept the recorded tooling advisory under the team's security policy. Then begin Phase 2 with authoritative, version-pinned EN 16931/XRechnung research and validator fixtures; keep finalization disabled until archive recovery and official validation pass their gates.

Setup: [README](../README.md). Design: [Architecture](../ARCHITECTURE.md). Risks: [Security](../SECURITY.md). Scope: [Compliance](../COMPLIANCE.md). Operations: [Deployment](DEPLOYMENT.md). Decisions: [ADRs](adr/README.md).
