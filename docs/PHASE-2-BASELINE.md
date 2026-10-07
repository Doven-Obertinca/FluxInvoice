# Phase 2 baseline — 2026-10-06

Existing Phase 1 architecture retained. Read report, ADRs, schema/migrations, domain/calculation, service/authorization, auth, audit, outbox, UI and tests. No storage implementation existed. The repository has only the initial git commit; all Phase 1 working files are preserved.

Before changes, every requested command passed: format:check, lint, typecheck, test (31 tests), build, check (31 tests), test:e2e (2 tests), production npm audit (0 advisories), git diff --check. Screens captured in an isolated database/browser session: sign-in/up, onboarding, dashboard, invoice list/new/detail, customers/detail, company/members settings. Captures live in ignored `.local/phase2-baseline`; the baseline shows large cards, oversized form spacing, low-information sidebar decoration and technical domain-check terminology.

No Java or Docker was installed. PostgreSQL and Phase 1 tests were available. A project-local checksum-verified Temurin runtime and pinned official validator are being installed; production must supply equivalent sandbox controls. No production email verification or origin protection is disabled.

Research: official KoSIT release metadata confirms XRechnung normative 3.0, specification 3.0.2, technical bundle 2026-08-31 published 2026-09-02, validator 1.6.3 (URI-resolution security fix), CEN 1.3.16, XRechnung Schematron 2.6.0. Preliminary 4.0 is explicitly excluded. See the machine-readable compliance manifest for assets and hashes.
