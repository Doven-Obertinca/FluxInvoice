# FluxInvoice (DE)

A German, tenant-isolated invoice application with a complete supported XRechnung lifecycle: create, edit, officially validate, finalize once, archive, verify and securely download. The deliberately narrow scope is domestic German EUR invoices with 19%/7% VAT and bank transfer. See [COMPLIANCE.md](COMPLIANCE.md) for exact limits; this is not a general tax-compliance certification.

## Local setup

Use Node **24 LTS** (`nvm use`) and npm. Versions are pinned in `package-lock.json`.

```sh
npm ci
cp .env.example .env
# Replace BETTER_AUTH_SECRET with a random secret, e.g. openssl rand -base64 48.
docker compose up -d
npm run db:migrate
npm run compliance:install
# Supply Java 21: export JAVA_BIN=/absolute/path/to/java
npm run dev
# In a second terminal: npm run worker
```

Open http://localhost:3000. Register and open the verification email in Mailpit at http://localhost:8025. Follow the link, configure the company, add a customer and create an invoice. Email verification is required in development, staging and production. SMTP also delivers password-reset links. Supply an SMTP service if not using Mailpit.

Without Docker, `npm run db:local` starts a persistent, loopback-only PostgreSQL 18 development instance in `.local/postgres` using the development credentials in `.env.example`. Run it in a separate terminal. SMTP is still required for account verification. Never use this database launcher or its fixed credentials in production.

Optional fictional data: create and verify an account **without completing onboarding**, then:

```sh
SEED_USER_EMAIL=your-local-account@example.test npm run db:seed
```

For a reusable local login, run `npm run dev:account` after migrations. This creates the verified account `test@fluxinvoice.test` with a generated password saved in the ignored `.local/test-login.json` file. Rerunning the command preserves the account and password. It only runs in development with local database and app URLs. Complete company onboarding on first login.

The seed rejects non-development environments and existing memberships. It creates fictional company/customer records, no shared passwords. Example IBAN data is for development only.

## Quality gates

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm exec playwright install chromium
npm run test:e2e
```

Tests require reachable PostgreSQL. `TEST_DATABASE_URL` defaults to the local admin database `postgresql://flux:flux@localhost:5432/postgres`. Use a dedicated test database server/account with CREATE DATABASE privileges. Both integration and browser tests create random isolated databases, apply **all real migrations**, then drop only those databases. They fail rather than silently skip if PostgreSQL is unavailable.

Browser tests start the **production build** on loopback port 3100. Their isolated `APP_ENV=test` disables email verification only to make browser tests deterministic; this mode must never be deployed. The workflow exercises registration, sign-in, onboarding, customer creation, mixed VAT, draft save/reload, server validation, preview, mobile overflow and sign-out. It also executes official validation, confirmation, finalization, archived download, read-only issued view, command navigation, responsive light/dark screenshots and automated accessibility checks. Java 21 and pinned compliance artifacts are required; tests fail rather than skipping compliance.

## Commands

| Command                       | Purpose                                           |
| ----------------------------- | ------------------------------------------------- |
| `npm run dev`                 | Next.js development server                        |
| `npm run build` / `npm start` | Production build / server                         |
| `npm run db:generate`         | Generate reviewed Drizzle SQL migrations          |
| `npm run db:migrate`          | Apply versioned migrations                        |
| `npm run db:local`            | Optional local PostgreSQL                         |
| `npm run db:seed`             | Fictional development data                        |
| `npm run worker`              | Outbox consumer, validator and archive worker     |
| `npm run check`               | Lint, strict types, unit/integration tests, build |
| `npm run test:e2e`            | Isolated production-browser workflow              |

Additional commands: `npm run compliance:install` installs checksum-pinned official artifacts; `npm run compliance:check` validates fixtures and fiscal lifecycle; `npm run archive:reconcile` audits stored document integrity; add `-- --retry-failed` to explicitly requeue recoverable stale jobs. `node --import tsx scripts/benchmark-compliance.ts` writes benchmark evidence.

## Repository map

- `apps/web`: App Router, Better Auth wiring, Server Actions, German UI, reusable shadcn-style Radix button.
- `packages/invoice-core`: framework-free input schemas, decimal arithmetic, VAT groups, lifecycle, validation, numbering presentation.
- `packages/einvoice`: normalized semantic model, business-term mapping, pinned profile, deterministic UBL, official Java validator and hostile-XML boundary.
- `packages/storage`: exact-byte local development archive and S3 Object Lock adapter.
- `packages/db`: PostgreSQL/Drizzle schema, migrations, connection factory.
- `packages/application`: tenant-scoped transactional business services and outbox consumer.
- `packages/auth`: central permissions and membership authorization.
- `packages/audit`: canonical SHA-256 chain, transactional append, verification.
- `packages/shared`: environment/customer/company schemas and safe application errors.
- `packages/observability`: allowlisted structured operational logs.
- `tests`: financial properties, real database/security tests and Playwright workflows.

Read [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [COMPLIANCE.md](COMPLIANCE.md), [deployment guidance](docs/DEPLOYMENT.md) and [ADRs](docs/adr/README.md) before expanding the system.

## Phase boundary

No exemptions, reverse charge, credit notes, cross-border treatment, self-billing, prepayment chains, delivery integrations, Peppol transmission, ZUGFeRD/PDF or accounting integrations. No member invitation UI, API credentials or tenant-switching workflow is activated. Settings disclose unavailable features. Existing Phase 1 audit/calculation/authorization guarantees remain in place.

Local archives are not immutable regulatory storage. Staging/production require `ARCHIVE_MODE=S3_OBJECT_LOCK`, region, bucket and KMS key configuration. A queued job requires the separate worker; a stalled worker does not mean an invoice was finalized. The [deployment runbook](docs/DEPLOYMENT.md) covers installation, IAM, reconciliation and remaining staging assurance.

## Aus Dokument erstellen

Keep **Neue Rechnung** as the primary creation workflow. Use **Rechnungen → Aus Dokument erstellen** to read a photo/PDF or scan a QR code, review its contents and prepare an editable outgoing invoice. OCR and QR decoding run locally in the browser. Payment codes never set VAT or replace your company bank details. Save, validate and finalize through the existing invoice workflow. See [supported formats, limits and privacy](docs/DOCUMENT-IMPORT.md).

Reader assets are prepared automatically by root `npm run dev` and `npm run build`; `npm run reader:prepare` is available separately. Include `apps/web/public/reader` in deployment. No database migration or external recognition credentials are needed.

### Product-intelligence iteration

Cmd/Ctrl+K now searches saved invoices and customers by name, invoice number, buyer reference, VAT ID or exact EUR amount. The outgoing **Handlungsbedarf** queue is available from the dashboard and command palette. It separates current validation/processing failures from overdue issued invoices; correction guidance explains the next action and snapshot refresh requirements.

See the [2026 research](docs/PRODUCT-RESEARCH-2026.md), [prioritized roadmap](docs/PRODUCT-ROADMAP-2026.md), [DATEV strategy](docs/DATEV-INTEGRATION-STRATEGY.md) and [implementation report](docs/PRODUCT-IMPLEMENTATION-REPORT.md). DATEV automated handoff remains a roadmap item.

## Incoming E-Rechnungen

The separately authorized **Eingangsrechnungen** workflow preserves existing originals, displays UBL/CII and embedded hybrid XML, records validation evidence and requires explicit business review before approval. It is separate from creating an outgoing draft. Apply migrations and run the worker. Official validation is currently limited to the supported XRechnung profile; other readable profiles cannot be approved. See the [incoming implementation report](docs/INCOMING-INVOICES.md) for security, deployment, format limits and verification.
