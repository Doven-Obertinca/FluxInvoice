# Authoritative environment inventory

Audited direct `process.env` reads across application, scripts, tests, Next and Drizzle configuration. No application `NEXT_PUBLIC_*` secret exposure was found. Values below are types, never real credentials. Production and Preview need separate DBs, archives, mail and Stripe environments; previews use `APP_ENV=staging`, never development/test. Hosted validation is also enforced when Vercel sets `VERCEL=1`.

## Exact Vercel environment names

Every row applies to **both Production and Preview** unless explicitly stated. Secrets must be marked sensitive and obtained from the named provider/secret manager. These variables are needed during build and runtime; they must not be placed in client-facing Next config.

| Name                        | Required?                                      | Value type / source                                                                                         |
| --------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| APP_ENV                     | Required                                       | `production` in Production; `staging` in Preview; operator setting                                          |
| APP_URL                     | Required                                       | Public HTTPS origin from Vercel project; later `https://erechno.de` after manual DNS/TLS                    |
| BETTER_AUTH_URL             | Required                                       | Same origin as APP_URL; no path/query/credentials                                                           |
| BETTER_AUTH_SECRET          | Required, secret                               | Fresh random secret, at least 32 characters, generated in your secret manager; separate by environment      |
| DATABASE_URL                | Required, secret                               | Provider-issued pooled PostgreSQL URL, restricted runtime role, `sslmode=verify-full`; external DB provider |
| SMTP_URL                    | Required, secret                               | Provider-issued authenticated `smtps://` URL, normally port 465; SMTP provider                              |
| MAIL_FROM                   | Required                                       | Plain verified sender email; SMTP provider/domain verification                                              |
| ARCHIVE_MODE                | Required                                       | `S3_OBJECT_LOCK`; operator setting                                                                          |
| ARCHIVE_BUCKET              | Required                                       | Private versioned Object Lock bucket name; AWS storage administrator                                        |
| ARCHIVE_KMS_KEY_ARN         | Required                                       | Dedicated KMS key ARN; AWS administrator                                                                    |
| AWS_REGION                  | Required                                       | Bucket region; AWS administrator                                                                            |
| AWS_ACCESS_KEY_ID           | Required on Vercel, secret                     | Restricted IAM access key required on Vercel by the current adapter; AWS IAM                                |
| AWS_SECRET_ACCESS_KEY       | Required on Vercel, secret                     | Matching IAM secret; AWS IAM/secret manager                                                                 |
| AWS_SESSION_TOKEN           | Conditional, secret                            | Temporary credentials token when using STS; credential issuer                                               |
| DELIVERY_WEBHOOK_SECRET     | Conditional, secret                            | At least 32-character signing secret when provider callbacks are configured; shared with provider/gateway   |
| COMPANY_NAME                | Optional technical; required for public launch | Actual legal company name; business owner                                                                   |
| SUPPORT_EMAIL               | Optional technical; required for public launch | Actual monitored email address; business owner                                                              |
| LEGAL_NOTICE                | Optional technical; required for public launch | Reviewed legal notice plain text; business owner/legal adviser                                              |
| PRIVACY_NOTICE              | Optional technical; required for public launch | Reviewed privacy notice plain text; business owner/legal adviser                                            |
| GOOGLE_SITE_VERIFICATION    | Optional                                       | Search Console verification token; Google Search Console                                                    |
| BILLING_ENABLED             | Optional                                       | `true` only after configuring all rows below; otherwise `false` or absent                                   |
| BILLING_DATABASE_URL        | Required if billing enabled, secret            | Separate restricted billing role on same DB, verified TLS URL; DB administrator                             |
| STRIPE_SECRET_KEY           | Required if billing enabled, secret            | Provider-issued API secret; Stripe. Live key in Production, test key in Preview                             |
| STRIPE_WEBHOOK_SECRET       | Required if billing enabled, secret            | Signing secret for this environment endpoint; Stripe                                                        |
| STRIPE_PRICE_STARTER        | Required if billing enabled                    | Distinct `price_` ID; Stripe catalog                                                                        |
| STRIPE_PRICE_BUSINESS       | Required if billing enabled                    | Distinct `price_` ID; Stripe catalog                                                                        |
| STRIPE_PRICE_PRO            | Required if billing enabled                    | Distinct `price_` ID; Stripe catalog                                                                        |
| STRIPE_PORTAL_CONFIGURATION | Required if billing enabled                    | `bpc_` ID; Stripe portal settings                                                                           |
| STRIPE_PAYPAL_ENABLED       | Optional                                       | `true` only with recurring PayPal approved in Stripe; otherwise false                                       |
| STRIPE_AUTOMATIC_TAX        | Optional                                       | `true` only with Stripe Tax and correct price tax behavior configured                                       |

AWS SDK ambient credential variables are consumed by the SDK rather than direct application reads. The current Vercel adapter requires a restricted AWS access key pair. The default SDK chain does not exchange Vercel OIDC tokens; an OIDC exchange adapter would need separate implementation before removing this requirement. On the worker, prefer an IAM workload role where available. A credential chain must work in both web and worker. Do not copy local AWS profiles or credential files into deployments. Vercel-managed `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `NODE_ENV` are platform metadata, not manually created credentials. `VERCEL_URL` is not used to silently infer an auth origin. Stable preview origins must be explicitly configured; no wildcard trusted origins.

## Worker-only settings

The worker uses the common DB/archive settings above; its current shared environment validation also requires auth origin/secret, SMTP and MAIL_FROM. It additionally requires `DELIVERY_FROM` (real provider-verified invoice envelope address), `JAVA_BIN` (absolute Java 21 executable path), and `COMPLIANCE_HOME` (absolute read-only pinned KoSIT asset directory). No JVM is needed by Vercel. `DELIVERY_GATEWAY_URL` is an optional public HTTPS invoice delivery endpoint; if present, `DELIVERY_GATEWAY_TOKEN` is a required secret from its operator. SMTP is still required for web authentication mail. `DELIVERY_WEBHOOK_SECRET` must also be available to the callback verifier in web when configured. These delivery gateway settings belong on the worker; they are not needed in Vercel. The worker and web must share the same archive/DB for their environment.

## Development-only / test-only

- Development: `ARCHIVE_LOCAL_DIR`, `ARCHIVE_MODE=LOCAL`, localhost DATABASE_URL/SMTP_URL/BETTER_AUTH_URL; `SEED_USER_EMAIL` for the seed utility. `JAVA_BIN` and `COMPLIANCE_HOME` also configure local pinned validator assets. `.env` is loaded locally only by Next, never on Vercel.
- Tests: `TEST_DATABASE_URL` (disposable DB); `CI` controls Playwright retries. Test fixtures deliberately use fake credentials/addresses and loopback services. Never point tests at a production database.
- Process variables: `PATH` is passed to isolated child processes; validator supplies its own `LANG`, `TMPDIR`, `NODE_ENV`. These are operating-system settings, not service credentials.

## Secrets / security audit

Secret names: DATABASE_URL, BILLING_DATABASE_URL, BETTER_AUTH_SECRET, SMTP_URL, DELIVERY_GATEWAY_TOKEN, DELIVERY_WEBHOOK_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN. Configuration errors contain names and requirements, not values. Only `.env.example` is tracked; credential files/local infrastructure are excluded. Working-tree scans found no live Stripe key, AWS access-key pattern or private-key block outside ignored local data. The same patterns found no matches across all four reachable Git commits. This remains a limited pattern audit, not a certification that every secret type, unreachable history or externally issued credential is clean; rotate any credentials previously shared or exposed.

Dependency audit: `npm audit --omit=dev` reports zero runtime vulnerabilities. The full audit reports five high-severity entries in the ESLint → fast-glob → micromatch → braces development dependency chain. The upstream advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched braces release. These tools process trusted repository glob patterns during lint/build; they are not an application input endpoint. Do not apply the suggested forced downgrade of eslint-config-next to Next 14. Track an upstream fix and avoid accepting untrusted glob patterns in tooling.

## Explicit zero-infrastructure beta on Vercel

Set `ERECHNO_BETA_MODE=true`, `APP_ENV=production`, `BILLING_ENABLED=false`,
`APP_URL=https://erechno.de`, and `BETTER_AUTH_URL=https://erechno.de`.
Keep the configured random `BETTER_AUTH_SECRET` and restricted Neon `DATABASE_URL`
with `sslmode=verify-full`. These security requirements remain mandatory.

Beta overrides `ARCHIVE_MODE`: all archival capabilities are disabled even if
`S3_OBJECT_LOCK` or old AWS settings remain. Remove `ARCHIVE_MODE`, `ARCHIVE_BUCKET`,
`ARCHIVE_KMS_KEY_ARN`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and
`AWS_SESSION_TOKEN` from the beta web environment. No alternate archive stores data.
Remove absent/unavailable `SMTP_URL` and `MAIL_FROM`; do not use placeholders.
Leave Stripe and billing database credentials unset. Remove delivery gateway settings
and do not schedule worker/reconciliation jobs for this deployment.

Safe beta features: public pages, verified-account sign-in, onboarding, customer
management, invoice drafts, previews, and browser document reading/import into drafts.
Finalization, immutable archive reads/writes, invoice delivery/receipts, KoSIT job
submission and processing, incoming invoice archival/import/approval/revalidation,
and subscriptions are unavailable. Server commands reject unavailable operations
before database mutations. The browser reader is not compliance validation.

Without SMTP, new signup, verification mail and password recovery are explicitly
unavailable. Existing verified accounts can sign in; verification, password rules,
rate limiting, origin checking, and secure sessions remain enforced. No test-login
or automatic verification is introduced. Add a provider-authenticated `smtps://`
`SMTP_URL` and verified `MAIL_FROM` later to restore signup/recovery while retaining
beta. Email transport success requires provider acceptance; archive/delivery remain
disabled. Never set `APP_ENV=test` to bypass verification on Vercel.

For full production, remove the beta flag or set it to `false` and configure the
complete existing production inventory above. Strict SMTP, S3 Object Lock/KMS,
AWS, database TLS, authentication and billing checks remain in force. The persistent
Java/KoSIT worker must run externally, never in Vercel. S3 writes still verify actual
bucket versioning, lock, encryption and retained object evidence.
