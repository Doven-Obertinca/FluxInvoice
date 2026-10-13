# ERechno live launch status — 12 October 2026

## Completed external configuration

Created the previously missing Vercel project `erechno` in `doven-obertincas-projects`. The existing browser import form was only a draft; API project listing confirmed no ERechno project existed.

Verified settings through the authenticated Vercel API:

- Root Directory: `apps/web`
- Framework: Next.js
- Node: `24.x`
- Include sources outside root: enabled
- Install: `cd ../.. && npm ci`
- Build: `npm run build`
- Output: `.next`

Configured and verified variable metadata only, never displaying credential values:

| Name               | Production                             | Preview                                          | Storage type |
| ------------------ | -------------------------------------- | ------------------------------------------------ | ------------ |
| APP_ENV            | production                             | staging                                          | Plain        |
| APP_URL            | https://erechno.de                     | Pending isolated stable preview origin           | Plain        |
| BETTER_AUTH_URL    | https://erechno.de                     | Pending isolated stable preview origin           | Plain        |
| BETTER_AUTH_SECRET | Fresh independent cryptographic secret | Different fresh independent cryptographic secret | Sensitive    |
| BILLING_ENABLED    | false                                  | false                                            | Plain        |
| ARCHIVE_MODE       | S3_OBJECT_LOCK                         | S3_OBJECT_LOCK                                   | Plain        |

Secrets were generated with a cryptographic random generator in process memory and submitted directly to Vercel. No secret file, command-line secret, Git secret or displayed secret was created. No Stripe configuration was created. No deployment was triggered, no Git repo was connected to automatic deployments, no DNS was changed and no paid service was provisioned.

Neon sign-in using the owner-authorized Google account succeeded. The available Neon organization is an existing Vercel-managed Free installation; direct resource creation in its console is disabled. The unrelated existing database was not reused or modified. Through Vercel, an isolated Free database wizard is prepared with Frankfurt and optional Neon Auth **false**, named `erechno-production-db`. After owner approval, both isolated databases were created and verified as Available, Free, region fra1, with Neon Auth false. Production resource: erechno-production-db (Neon project dark-sound-84348513). Preview resource: erechno-preview-db (Neon project winter-rice-99618149). The owner supplied both admin connections privately. All 12 explicit migrations, schema checks, migration fingerprint checks, restricted runtime roles and pooled certificate-verified TLS connections have passed for each database. Vercel has separate sensitive DATABASE_URL entries scoped solely to Production and Preview. The temporary administrator input was truncated, synced and removed after verification.

Brevo is at its login screen; account-specific sign-in authorization was requested. No credentials, sender or verification DNS record has been issued, so no SMTP/DNS values can truthfully be configured yet.

## Current requested report (A–N)

| Item                    | Actual status                                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Live URL             | Intended canonical URL: https://erechno.de; no live ERechno URL yet                                                                                                                                                                    |
| B. Vercel deployment    | Project/settings configured; zero Production/Preview deployments                                                                                                                                                                       |
| C. Custom domain        | Not attached yet; user requested attachment after the first working deployment. Namecheap remains registrar                                                                                                                            |
| D. TLS                  | Not verified/active for the intended application; public apex/www DNS lookups failed from this workstation. No certificate warning was bypassed or SSL purchased                                                                       |
| E. Database             | READY: both isolated projects migrated; runtime roles/grants and pooled certificate-verified TLS tested; sensitive Vercel URLs configured                                                                                              |
| F. Auth                 | Production/Preview secrets stored as sensitive; origins configured for final production domain; live session/signup/login/logout verification blocked on deployment/DB/mail                                                            |
| G. Email                | Brevo Free candidate verified technically; sign-in, sender/domain verification and actual SMTP credentials outstanding                                                                                                                 |
| H. Archive              | S3 Object Lock + dedicated KMS design preserved; no paid resources created; required credentials absent                                                                                                                                |
| I. Worker/validator     | Existing processes/rules preserved; systemd service and read-only preflight prepared; no host provisioned or worker activated                                                                                                          |
| J. Smoke tests          | Live tests not run because application is not deployed. No real fiscal invoice or third-party invoice email was created/sent                                                                                                           |
| K. Security             | Secrets kept out of repository/logs; billing false; exact auth origin; verified database TLS enforced; local archives rejected in hosted mode; no web JVM validation. Live least-privilege and retention tests remain outstanding      |
| L. Current monthly cost | No incremental paid commitment made by this task. Vercel project is Hobby. Existing domain/account invoices are unknown; no claim that total ownership cost is €0                                                                      |
| M. Free limitations     | See cost table below; free Vercel is non-commercial, free Neon does not cover continuous current-worker polling for a full month, free Oracle VMs may be reclaimed                                                                     |
| N. Commercial blockers  | Vercel commercial eligibility; archive cost authorization/provisioning; reliable worker/DB capacity; SMTP verification; migrations and restricted roles; owner legal information; custom-domain DNS/TLS and live security/smoke checks |

## Service selection and explicit costs

These are researched plan candidates, not subscriptions or purchases. Prices are provider currencies, before any applicable tax/FX. Current ERechno resources are only the undeployed Vercel project; uncreated services have **no current plan/charge**, not an active free service.

| Service / provider                       | Current plan / cost attributable to this work                                   | Free allowance / suitability                                                                                                                                                                                                                                              | What causes payment or blocks use                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web: Vercel                              | Hobby; €0 incremental project cost                                              | Appropriate only for personal non-commercial development. Custom domains and Vercel TLS need no separate Namecheap certificate                                                                                                                                            | Commercial use needs an eligible plan. Published Pro platform fee is $20/month with one deploying seat and $20 usage credit; overages/add-ons/extra seats add cost. No upgrade performed                                                                                                                                                                                              |
| DB: Neon Frankfurt                       | Two isolated ERechno Free projects created; €0 new charge within Free allowance | 100 projects; 1 GB per project; 100 CU-hours/month/project; 10 branches; 6-hour instant restore. Verified Frankfurt choice and Free details in actual provisioning UI. PostgreSQL/PgBouncer/TLS fit the existing driver                                                   | Free quotas constrain service. Upgrade is an explicit owner action; paid plans bill compute/storage/history/egress. The existing one-second worker poll and ten-second reconciliation keep compute active. At 0.25 CU a 31-day month is 186 CU-hours, beyond 100. Limited development/private beta is feasible; continuous commercial operation needs a reviewed capacity/backup plan |
| SMTP: Brevo                              | No account/session configured here; €0 new charge                               | Free transactional email allowance advertised as 300 emails/day; authenticated SMTP includes port 465. EU hosting posture documented; owner must review DPA/subprocessors. Suitable for beta/low-volume business if verified sender/account approval/limits meet needs    | Daily send cap, volume/features or a paid plan chosen by owner. No automatic paid upgrade requested. Deliverability and actual sender verification must be tested                                                                                                                                                                                                                     |
| Archive: AWS S3 + dedicated KMS          | Not provisioned; no new charge                                                  | Object Lock/versioning/KMS match actual archive checks. Free KMS usage includes 20,000 requests/month, **not customer-managed key storage**. AWS promotional credits depend on account eligibility and expiry; they are not permanent free archive capacity               | Each customer-managed key is $1/month before rotations; S3 storage, requests and transfer are separately metered. Separate production/preview keys mean $2/month baseline key storage before other charges. COMPLIANCE retention creates long-lived non-deletable obligations. No archive resource was created under the no-paid-commitments rule                                     |
| Worker candidate: OCI Ampere Always Free | Not provisioned; no charge                                                      | Current official limits: 1,500 OCPU-hours and 9,000 GB-hours/month (approximately 2 OCPU/12 GB continuous capacity), subject to home-region availability. A VM can run Node 24/Java 21; suitable only for controlled development/private beta with accepted interruptions | Idle instances can be reclaimed; capacity may be unavailable; registration/identity/card/terms need owner action. Do not manufacture load to evade reclamation. No reliable commercial worker guarantee; not selected as production hosting                                                                                                                                           |
| Worker fallback: Hetzner EU CX23         | Not provisioned; no charge                                                      | Dedicated application VM is technically suitable for a single low-volume Node/Java worker; production needs monitoring, host security, verified backups and restore procedures. No free allowance                                                                         | Published EU CX23 is €5.49/month excluding VAT and IPv4, plus any IP/backup/extra usage charges. Purchase explicitly prohibited and not performed                                                                                                                                                                                                                                     |
| Domain/TLS: Namecheap + Vercel           | Registrar unchanged; renewal/previous purchases unknown                         | Existing registered domain can stay at Namecheap; Vercel provides custom-domain TLS once correctly attached/verified                                                                                                                                                      | Existing domain renewal remains an owner expense. No domain transfer or PositiveSSL purchase needed/performed                                                                                                                                                                                                                                                                         |

### Development / private beta

Local development remains viable at no new provider cost. Isolated Neon Free and Brevo Free can support limited controlled testing, but a Vercel deployment with commercial purpose must not be represented as permitted Hobby use. Free/reclaimable worker capacity and the free DB quota are interruption-prone. Retained archive testing still needs authorized S3/KMS funding or verified applicable time-limited credits; it cannot be replaced with mutable storage.

### Real commercial production

There is no truthful sustainable €0 launch with this unchanged architecture and current constraints. Known baseline candidates are Vercel Pro $20/month, two isolated KMS keys $2/month, and EU worker €5.49/month excluding VAT/IPv4, **plus** S3 usage, DB capacity/backups, applicable SMTP volume and existing domain renewal. These are not a complete fixed quote or a commitment: DB and storage costs depend on actual resource selection/usage. No plan was purchased. A paid-capable existing account/host may lower incremental cost only after explicit owner identification and technical verification.

## Repository work added during this continuation

- `scripts/production-check.ts` and `npm run production:check`: read-only DB TLS/role/schema, archive and SMTP checks; `--worker` also checks pinned validation with an in-memory fixture. No email, fiscal artifact or row is created.
- `ops/erechno-worker.service`: unprivileged persistent worker service, provider preflight, private temporary files, read-only deployment, memory bound and graceful termination.
- `ops/archive-runtime-policy.json`: unapplied scoped S3/KMS IAM template; no deletion/bypass/admin access.
- `ops/README.md`: actual host provisioning/identity/readability requirements and unverified target-host limitations.
- S3 archive configuration verification exposed for the preflight; write/retention/integrity behavior unchanged.
- `.gitignore` excludes `.vercel/`; `.env.example` explicitly sets billing false.

Typecheck and lint passed. Focused environment/storage tests: 20 passed. The preceding full 169-test run and production build remain passed; no external readiness check is claimed successful. The macOS workstation cannot verify/activate a Linux systemd unit.

## Minimal owner actions at remaining boundaries

1. Database creation, explicit migrations, restricted runtime grants and sensitive Vercel DATABASE_URL configuration are complete for Production and Preview. The temporary admin input is cleared and removed. Do not re-run provisioning against existing roles or create a replacement credential file merely to repeat this completed stage.
2. Authorize the displayed Google account for Brevo, or sign in yourself on the opened Brevo tab. Complete account terms/MFA/CAPTCHA and actual business/legal details yourself where required. Do not paste credentials into chat; report only that sign-in is complete.
3. Do not upgrade or purchase anything merely to continue this task. If an already-paid commercial-eligible Vercel team, retained AWS archive or suitable worker VM exists, identify the account/resource names without credentials. Otherwise the no-paid-resources rule blocks live launch; a later explicit change of scope is needed from the owner.
4. Provide actual owner-reviewed COMPANY_NAME, SUPPORT_EMAIL, LEGAL_NOTICE and PRIVACY_NOTICE through the deployment configuration when ready; none is invented.

Do not edit Namecheap DNS yet. Vercel has not issued actual domain validation records because the first working deployment/domain attachment has not happened. SMTP sender verification likewise has not issued actual records. No guessed A/CNAME/TXT/MX values are provided. Preserve all unrelated existing MX/TXT records when provider-issued records are eventually available.

## Primary sources checked

- [Vercel Hobby restrictions](https://vercel.com/docs/plans/hobby), [commercial fair use](https://vercel.com/docs/limits/fair-use-guidelines), [Pro pricing](https://vercel.com/docs/plans/pro-plan).
- [Neon current Free allowance](https://neon.com/blog/neon-free-plan-1-gb-per-project), [connection pooling](https://neon.com/blog/postgres-support-case-recap).
- [Brevo transactional email](https://www.brevo.com/products/transactional-email/), [SMTP](https://help.brevo.com/hc/en-us/sections/13414090396306-SMTP), [data location](https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location).
- [AWS KMS pricing](https://aws.amazon.com/kms/pricing/), [S3 pricing](https://aws.amazon.com/s3/pricing/).
- [OCI Always Free capacity/reclamation](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [current Hetzner EU prices](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/).

## Database creation verification update

Authenticated Vercel resource metadata confirms:

| Environment | Database              | Neon project         | Plan | Region           | Neon Auth | Status    |
| ----------- | --------------------- | -------------------- | ---- | ---------------- | --------- | --------- |
| Production  | erechno-production-db | dark-sound-84348513  | Free | fra1 / Frankfurt | false     | Available |
| Preview     | erechno-preview-db    | winter-rice-99618149 | Free | fra1 / Frankfurt | false     | Available |

The automatic admin-credential injection step was skipped: migration-owner credentials must not become web runtime credentials. The new provisioning command uses the two actual provider-issued non-pooled URLs only for explicit migrations and role provisioning, generates each runtime credential cryptographically, and submits a distinct pooled verify-full URL as a sensitive variable for its matching Vercel environment. Administrator URL input was local and temporary and is now cleared/removed; no real credentials are in the repository. Typecheck/lint passed. An empty credential input is refused before any external API or database mutation. External schema/TLS/grants and migration-fingerprint checks have now passed for both named projects. The client TLS socket and certificate authorization are verified directly because Neon terminates TLS at a proxy and pg_stat_ssl describes the proxy-to-compute hop.

## Completed database-stage update

| Check                          | Result                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Production DB                  | READY                                                                                                                     |
| Preview DB                     | READY                                                                                                                     |
| Migrations                     | PASS: 12 on each database; all stored fingerprints match repository migrations                                            |
| Runtime roles                  | PASS: flux_runtime per project; no superuser, role creation, database creation, RLS bypass, ownership or role memberships |
| Immutable evidence grants      | PASS: no UPDATE/DELETE/TRUNCATE on audit/artifact/validation/check/receipt/activity evidence                              |
| Vercel DATABASE_URL Production | CONFIGURED: sensitive; Production only; pooled verify-full connection tested                                              |
| Vercel DATABASE_URL Preview    | CONFIGURED: sensitive; Preview only; different project and credential                                                     |
| Temporary admin credentials    | CLEARED: file truncated, fsynced, removed; absence verified                                                               |
| Billing                        | false in both environments; no Stripe setup                                                                               |

The input URLs were matched to compute IDs independently read from the two named Neon project pages before any mutations. Neither connection matched the unrelated widget database. No SQL or credential/privilege operation was performed against that project. No deployment, upgrade, purchase or DNS change occurred. The repository now selects one free-supported Function region (fra1) next to the databases; the deployment still requires external readiness.

Next free-service owner action: sign in to the opened Brevo account (Free only) and report that sign-in is complete. Credentials must not be pasted into chat. SMTP sender/domain verification remains outstanding. The Object Lock/KMS archive and suitable worker hosting remain unprovisioned; Hobby is not commercially eligible. These unresolved requirements prevent a safe first deployment under the existing no-paid-commitments constraint.
