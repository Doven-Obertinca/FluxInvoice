# ERechno deployment preparation — 12 October 2026

## A. Files changed by this task

- `.env.example`, `.vercelignore`
- `apps/web/vercel.json`, `apps/web/package.json`, `apps/web/next.config.ts`
- `apps/web/lib/server.ts`, `apps/web/lib/brand.ts`, `apps/web/lib/payments.ts`
- `packages/shared/src/index.ts`, `packages/shared/src/production.ts`
- `packages/db/src/index.ts`
- `packages/application/src/runtime.ts`, `packages/application/src/einvoice.ts`, `packages/application/src/incoming.ts`
- `scripts/worker.ts`, `scripts/migrate.ts`, `scripts/autopilot-reconcile.ts`, `drizzle.config.ts`
- `tests/production-environment.test.ts`
- `docs/DEPLOYMENT.md`, `docs/PRODUCTION-ENVIRONMENT.md`, this report

Extensive pre-existing working-tree edits were preserved. Root package.json and package-lock.json already contained the necessary workspace/runtime dependencies; no dependency duplication or replacement was needed. No commit, push, deployment or DNS mutation was performed.

## B. Architecture changes

The existing DB outbox remains the worker boundary. Web services enqueue jobs, serve immutable artifacts and upload incoming documents to S3; the web validator now explicitly refuses direct JVM validation. Worker-only processing methods also refuse execution on Vercel. Java KoSIT and ZUGFeRD PDF extraction remain on the persistent worker, with unchanged validation rules/integrity verification. No extra validator service is required.

The existing local-development and AWS S3 Object Lock archive adapters are retained. Hosted configuration requires Object Lock storage. Web PostgreSQL pools are reused across warm requests and limited to two connections, with verified TLS and a provider pooler required. Billing uses its separate role/pool. Migrations are explicit operator actions with a session advisory lock; builds never migrate.

Workspace prebuild prepares pinned browser OCR/PDF assets when Vercel builds apps/web directly. File tracing includes the repository root and excludes local data/env files. Vercel installs from the root lockfile with npm ci.

## C. Security changes

Central hosted checks reject development/test APP_ENV on Vercel, local/test hostnames, insecure auth origins/secrets, default email senders, plaintext SMTP, non-verifying DB TLS, local archives, missing storage configuration, incomplete billing and shared billing DB roles. Error messages omit credential values. Auth and public origins must agree. Existing HTTPS secure cookies and exact trusted origins are preserved. Authentication mail transport refuses filesystem/URL attachment resolution. Next does not load the local root .env on Vercel. Vercel must supply an AWS credential pair because no OIDC-to-AWS exchange adapter exists.

No live Stripe key, AWS access-key pattern or private-key block was found in tracked working-tree files or the four reachable Git commits. Pattern scans are limited to those patterns and reachable history, not proof that every possible secret type is absent.

## D. Environment variables

See [PRODUCTION-ENVIRONMENT.md](PRODUCTION-ENVIRONMENT.md) for the exact names, required/optional status, Production/Preview scope, expected type and credential source, including worker/dev/test/secrets categories.

Vercel always requires APP_ENV, APP_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET, DATABASE_URL, SMTP_URL, MAIL_FROM, ARCHIVE_MODE, ARCHIVE_BUCKET, ARCHIVE_KMS_KEY_ARN, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY. Temporary AWS credentials additionally need AWS_SESSION_TOKEN. Production uses APP_ENV=production; Preview uses staging and separate resources. Provider callbacks need DELIVERY_WEBHOOK_SECRET. Billing settings are conditional on BILLING_ENABLED=true; legal/support/SEO settings are listed in the inventory. No Java/local archive configuration belongs in Vercel.

## E. External infrastructure still required

1. External PostgreSQL with verified TLS, a serverless-compatible provider pooler, backups and separate migration/runtime identities; separate billing role if enabled.
2. Private versioned AWS S3 bucket with Object Lock COMPLIANCE retention, dedicated KMS key, tested least-privilege credentials for web and worker.
3. Authenticated TLS SMTP provider with verified MAIL_FROM and DELIVERY_FROM senders.
4. Managed Node 24/Java 21 worker hosting and pinned KoSIT assets. Monitor outbox/dead letters and worker health.
5. Stripe catalog/portal/webhooks only if billing is enabled. An invoice delivery gateway is optional.

## F. Verification

- `npm ci --ignore-scripts`: passed for initial dependency inspection.
- Full `npm ci` with Node 24 and network access: passed. Initial sandbox attempt stalled in the pinned Node install script; rerun succeeded.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: **16 files, 169 tests passed**, including disposable PostgreSQL migration/tenant/immutability tests and the pinned Java validator. Initial sandbox run could not connect to loopback DB; rerun with local service access passed.
- `npx vitest run tests/production-environment.test.ts`: **14 tests passed** after the final hosted configuration refinements.
- `npm run build -w @flux/web`: passed twice, including the final safeguards, directly exercising Vercel's workspace build entry point and asset prebuild. Build used the local development configuration; it does not verify external production services or credentials.
- `git diff --check`: passed.
- `npm audit --omit=dev`: **zero vulnerabilities**.
- Full `npm audit`: **five high-severity development-chain findings** caused by the unpatched braces advisory in ESLint tooling. Details and upstream advisory are in the inventory. Do not force a Next 14 tooling downgrade.
- No traced `.local` or `.env` file was found in generated Next function trace manifests.

## G. Remaining deployment gates

No repository build/test blocker remains. External credentials/services, migration/grants, actual IAM/Object Lock/KMS behavior, mail delivery and worker startup must still be verified. Without the worker, invoice validation/issuance, incoming processing, delivery and periodic reconciliation remain pending. Public launch also requires real reviewed legal/privacy/company/support details. The development-only dependency advisory remains tracked; no upstream patched release exists.

## H. Exact next manual Vercel action

Keep project **erechno**, framework **Next.js**, Root Directory **apps/web**. Select **Node 24.x** and enable **Include source files outside of the Root Directory in the Build Step**. Install command: `cd ../.. && npm ci`. Build command: `npm run build`. Output Directory: `.next`. These overrides are recorded in apps/web/vercel.json.

Add the environment variables from the inventory using real service-issued credentials. For the first deployment, configure APP_URL and BETTER_AUTH_URL to the same stable project HTTPS Vercel origin. Provision/migrate the database and verify archive/mail/worker prerequisites before manually pressing Deploy. After the first working deployment, manually connect erechno.de, verify DNS/TLS and update both origins to https://erechno.de. Namecheap DNS was untouched.
