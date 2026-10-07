# Phase 2 completion report

Historical Phase 2 report. The subsequent user-requested letter/PDF/QR extension is documented in [DOCUMENT-IMPORT.md](DOCUMENT-IMPORT.md).

Completed 7 October 2026. The supported local workflow now creates, edits, calculates, validates, finalizes, archives, verifies and securely downloads an XRechnung. The application received a complete product-design pass. This report describes implemented and tested behavior, not production deployment, legal certification or live AWS assurance.

1. **Baseline repository audit.** Inspected Phase 1 reports, architecture, security, compliance, ADRs, domain/application services, auth, tenant constraints, financial calculations, audit/outbox, migrations, UI and CI. Preserved the existing working tree and architecture. See [baseline evidence](PHASE-2-BASELINE.md).

2. **Baseline quality gate.** Before implementation, formatting, lint, strict types, 31 tests, production build, aggregate check, two browser tests, production dependency audit and whitespace checks passed. Actual Phase 1 screens were captured and reviewed.

3. **Authoritative specifications.** Used the [XStandards Einkauf production specification](https://xeinkauf.de/xrechnung/), [official configuration release](https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/tag/v2026-08-31), [KoSIT release](https://github.com/itplr-kosit/validator/releases/tag/v1.6.3) and [CEN artifacts](https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/tag/validation-1.3.16). Research was performed 6 October and production status rechecked 7 October. See [COMPLIANCE.md](../COMPLIANCE.md) for exact boundaries and retention sources.

4. **Normative XRechnung version.** Production family 3.0, effective 1 February 2024; editorial specification 3.0.2. Preliminary 4.0 is excluded.

5. **Technical bundle.** XRechnung 3.0.2 configuration dated 2026-08-31; UBL 2.1 Invoice type 380; XRechnung Schematron 2.6.0. Profile identity is `xrechnung-ubl-3.0.2-2026-08-31`.

6. **Bundle release date.** The dated configuration was published 2 September 2026. Manifest dates distinguish configuration date, publication date and normative effective date.

7. **Validator version.** KoSIT 1.6.3, released 20 August 2026, including the URI-resolution security correction. Java 21 runs outside web requests in the worker.

8. **CEN artifact version.** EN 16931 validation artifacts 1.3.16, as pinned by the official bundle.

9. **Artifact provenance.** The [manifest](../packages/einvoice/compliance/manifest.json) records upstream URLs, versions, identifiers, dates, licenses and hashes. Installer metadata records the installed artifacts. Fixtures are fictional project-authored data; upstream validation artifacts are downloaded rather than silently vendored.

10. **Checksums and integrity.** Bundle SHA-256: `2530cd107c414511c5d0462ec10f886910395abfca820db82e83d70bf01221a8`. Validator JAR SHA-256: `799e64befca97d4080e03608c80b85dd5a5ecc5f4ae4f35d1116ec2855b9a7c9`. Installation and runtime verification include individual rule-file hashes. Documents retain the manifest hash and original candidate hash.

11. **Architecture added.** Frozen relational snapshot → syntax-independent semantic model → versioned profile → deterministic UBL → official validation → recoverable issuance job → verified archive → immutable fiscal state. [Phase 2 ADR](adr/PHASE-2.md) explains the decisions and failure model.

12. **Modules changed.** Added framework-independent `packages/einvoice`, archive adapters in `packages/storage`, application orchestration/runtime, compliance installation and reconciliation scripts. Extended database, worker, observability, authorization, web routes/components, tests and CI. Existing invoice-core remains the authoritative decimal calculation engine.

13. **Database migrations.** Forward migrations `0004_einvoice_jobs.sql` and `0005_fiscal_guards.sql` add durable jobs, versioned validation evidence, document integrity observations, contact snapshots and stronger fiscal guards. Applied to the development database. Fresh installation and a populated Phase 1 upgrade are tested; original migration hashes and invoice data are preserved.

14. **Semantic coverage.** Explicit invoice identity/type/dates/currency, seller/buyer addresses and identifiers, email endpoints, buyer reference, positive lines, quantities/units/prices, line/document adjustments, VAT breakdown, bank transfer and totals. Scope validation rejects unsupported tax/currency/country scenarios. Optional future commercial references and additional syntaxes are not claimed as implemented features.

15. **Business-term mapping.** Central typed mapping connects application fields, semantic properties, EN 16931 terms and UBL locations. Validation navigation and advanced structured-data inspection reuse it instead of scattering business-term identifiers through components.

16. **Supported scenarios.** German seller and buyer, EUR, ordinary positive invoices, standard category S at 19%/7% including mixed VAT, fractional quantities/prices, pieces/hours/days, allowances/charges, bank transfer, buyer reference and supplied B2G routing reference. Recipient-specific routing/acceptance is not independently established.

17. **Unsupported scenarios.** Reverse charge, exemptions, intra-community supply, foreign currencies/countries, credit notes, self-billing, prepayments, invoice chains and special VAT schemes fail safely. No ZUGFeRD, Factur-X, PDF/A-3, Peppol transmission, OCR or accounting-system integrations were added.

18. **Serializer.** XMLBuilder2 emits stable ordered UTF-8 UBL with correct namespaces and escaping. Golden files and safe parsed-value assertions cover deterministic output. XML parsing rejects DTD/entities, stylesheet/XInclude constructs, malformed UTF-8 and oversized/deep documents.

19. **Validator architecture.** Fixed executable arguments without shell interpolation; sanitized environment; private temporary files; pinned rule verification; bounded document/report/output sizes; 256 MiB JVM heap; one active processor; one active validation per instance; 30-second timeout and controlled failures. OS/container network and filesystem confinement remain deployment requirements.

20. **Validation UX.** Normalized issues retain rule, severity, source, field, business term, profile/version and technical location. Users see human explanations and field navigation; advanced details expose technical evidence. Append-only readiness and issuance runs are distinct. Old Phase 1 domain checks do not imply official readiness.

21. **Finalization architecture.** Tenant authorization, optimistic revision and immutable snapshot identity precede asynchronous processing. Preliminary official validation precedes fiscal-number reservation. The numbered artifact passes a separate issuance validation. Only verified archive bytes permit the transactional document/audit/outbox/finalized-state commit.

22. **Archive consistency.** Durable jobs explicitly move through QUEUED, VALIDATING, ARCHIVING and COMPLETED/FAILED. PostgreSQL and object storage are not treated as one transaction. A reserved number, candidate hash and deterministic object key survive retry. Upload-success/DB-failure reuses and verifies the object; unknown orphan objects are not automatically deleted.

23. **Integrity model.** SHA-256 and size bind validation, candidate, stored bytes and immutable document metadata. Exact object versions are read back before finalization and verified again on download. Append-only checks and reconciliation record missing/corrupt objects; failed verification returns no fiscal bytes.

24. **Authorization/security.** Existing server-derived tenant context, composite ownership constraints, Better Auth verification, hostile-origin protection, secure production behavior, actor-bound idempotency, audit chain and log redaction remain. Finalization is restricted to OWNER, ADMIN and ACCOUNTANT. Download requires current authenticated tenant read permission. Staging/production refuse the local archive adapter.

25. **Concurrency/idempotency.** Organization transaction locks protect numbering and state; session advisory locks fence duplicate job processors; outbox leases remain token-fenced. Unique revision/kind jobs and request hashes make repeats deterministic. Database guards protect pending snapshots, finalized content, job identity and append-only evidence.

26. **Failure recovery.** Recoverable failures retain their number/hash and retry with backoff; outbox dead-letters after eight attempts. Lease duration is 180 seconds. Reconciliation verifies archived documents and reports stale jobs; explicit `--retry-failed` only requeues eligible recoverable jobs without active delivery. Validation/snapshot/profile failures are not blindly retried. No automatic object deletion is performed.

27. **Fixture corpus.** Four committed valid golden fixtures cover 19%, 7%, mixed VAT and adjustments, including multiple/fractional lines, Unicode, umlauts, XML escaping, payment and references. Invalid tests cover missing parties/reference, identifiers, dates, totals/VAT, unsupported scope, malformed/tampered XML, XXE and resource bounds. Official validation supplements rather than replaces domain/golden assertions.

28. **Test results.** The final aggregate backend gate passed **62 tests across five files**, lint, strict type checking and production build. Tests include original financial property checks and Phase 1 security invariants, official KoSIT fixtures, lifecycle, storage contracts and migration safety. After the last browser-discovered client fix, formatting, lint, types, build and both browser tests passed again. No failures were ignored or checks disabled. One earlier host-stalled run failed; the unchanged test limits passed on rerun.

29. **Concurrency results.** Existing 30-way number allocation remains tested. Eight concurrent issuance enqueue requests converge on one job; two processors produce one fiscal result. Duplicate requests, stale revisions and tenant/actor conflicts are covered.

30. **Failure-injection results.** Tests cover upload failure/retry, successful upload followed by injected SQL commit failure, number reuse, missing/tampered archive bytes, validator timeout/missing runtime, invalid invoice rejection, snapshot/master-data independence and forbidden fiscal mutation. S3 configuration, encryption, version, retention and bounded-read behavior have contract tests; these are not live AWS tests.

31. **Benchmark results.** Twelve sequential fresh-JVM validations of four fictional fixtures on Apple M5/arm64, Node 24.21.0: p50 **3,190 ms**, p95/max **3,430 ms**. Serialization ranged **0.54–8.31 ms**. Includes JVM startup and cleanup; not a production throughput guarantee. Raw results: [COMPLIANCE-BENCHMARK.json](COMPLIANCE-BENCHMARK.json).

32. **Design system.** Locally bundled Inter, cool blue/ink palette, semantic light/dark surfaces, compact borders/radii, aligned financial typography, coherent functional icons, visible focus and reduced-motion support. Replaced oversized generic cards/sidebar decoration with denser navigation, forms and financial views. Radix supplies dialog behavior; product styling is custom.

33. **Dashboard.** Actual outstanding, overdue, paid and draft totals plus validation/pending work queues. No invented growth, charts or transaction data. Invoice/customer lists add useful search and pagination; customer detail uses real invoice summaries/activity and a prefilled creation action.

34. **Invoice editor.** Compact keyboard-accessible line editing, server-authoritative saves, advisory live totals, preview/validation/structured-data tabs, visible totals and actionable errors. Final confirmation explains customer, amount, profile and numbering/immutability consequences. Issued invoices have a dedicated read-only snapshot view. Unsaved edits block lifecycle actions until the refreshed saved revision arrives, fixing a browser-discovered race.

35. **Onboarding.** Three meaningful steps: company, tax/contact/numbering, payment. Field-specific human messages and explanatory hints replace raw schema-pattern errors. Company/settings forms preserve saved contacts and banking data.

36. **Accessibility.** Semantic controls/tables, associated labels/hints, keyboard command palette, focused field navigation, Radix focus-managed dialogs, status announcements and reduced motion. Automated axe checks pass for reviewed desktop screens in both themes and the finalization dialog against selected WCAG 2/2.1/2.2 AA rules. Color-transition/dialog-opacity contrast defects were fixed. This is not a complete manual WCAG certification.

37. **Responsive/mobile.** Checked 1440×1000 desktop, 834×1112 tablet and 390×844 mobile, both themes. Editor/preview stack, navigation reorganizes, mobile sign-out remains accessible and tables adapt. Automated checks found no horizontal page overflow in the reviewed states. Mobile navigation clipping was fixed during review.

38. **Visual QA.** Compared actual Phase 1 captures with redesigned authentication, onboarding, shell, empty/populated dashboard, customers/detail, invoice editor/invalid/ready/issued states, lists and settings. Final browser run produced **85 screenshots** in ignored `test-results/visual`; representative desktop/tablet/mobile light/dark images were manually inspected, including corrected customer-directory capture and final mobile issuance. Screenshots use isolated fictional test records.

39. **Local development.** Node 24, PostgreSQL at localhost:5432, app at localhost:3000, Mailpit SMTP at localhost:1025 and inbox at localhost:8025 remain documented. Install pinned artifacts, configure Java 21, migrate, then run web and worker. Local archive requires no AWS credentials and is explicitly not WORM. Production email verification is unchanged; browser bypass is isolated to test mode.

40. **Commands executed.** Baseline and final work used `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run check`, `npm run test:e2e`, `npm audit --omit=dev --audit-level=moderate` and `git diff --check`. Also installed/verified compliance artifacts, validated official fixtures, generated/checked goldens, ran fresh/upgrade migrations, applied development migrations, benchmarked validation and executed default reconciliation. CI now provisions Java and pinned rules before testing.

41. **Lint.** Passed with zero warnings after the final client fix.

42. **Typecheck.** Strict TypeScript checks passed after the final client fix, including exact optional properties and unchecked index access protections.

43. **Build.** Next.js production build passed after the final client fix; authenticated application routes and the secure document download route compiled successfully.

44. **E2E.** Final run: **2 passed in 40.7 seconds**. Full workflow covers signup/signin, onboarding, customer creation, mixed-VAT calculation, invalid-reference recovery, field focus, save/revalidate, unsaved-edit protection, finalization, exact XML download, command navigation, logout and hostile-origin rejection. The main workflow includes responsive screenshots and both-theme accessibility assertions.

45. **Production dependency audit.** Zero production vulnerabilities at the final audit. The full dependency audit retains five high findings confined to development tooling in the braces/micromatch/fast-glob/Next ESLint chain; these are documented rather than hidden by weakening the gate. Lockfile versions are pinned.

46. **Remaining risks.** No production deployment or live S3 Object Lock/IAM/KMS verification was performed. Operators must validate actual provider semantics, enforce Java OS confinement and least privilege, configure telemetry SDK/exporters, external audit-head anchoring, backups/restore, legal holds, retention/residency, TLS/SMTP and production hardening such as CSP. A heap cap is not an RSS/container limit. Local read-only files are not regulatory WORM. Recipient acceptance and legal tax treatment remain outside validator guarantees. See [deployment runbook](DEPLOYMENT.md) and [SECURITY.md](../SECURITY.md).

47. **Deferred work.** Parallel future-profile execution/selection, CII, unsupported tax/business cases, formal correction/credit lifecycle, transmission, hybrid PDF and integrations remain outside Phase 2. Stored profile identities and original bytes are preserved; unavailable profiles fail safely. Phase 3 features were not implemented.

48. **Recommended Phase 3 starting point.** First execute staging assurance against the intended Object Lock bucket, IAM/KMS and isolated worker: prove retention/deletion denial, crash/retry recovery, missing-object alerts, tenant boundaries and coordinated restore. Then specify and implement a formally tested correction/credit-note lifecycle before expanding into hybrid PDFs or transmission. This is a recommendation, not work started in this phase.
