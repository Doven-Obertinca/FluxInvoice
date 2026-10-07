# Security

## Implemented boundaries

- Better Auth provides password hashing, persistent sessions, password reset, email verification, CSRF/origin checks and database-backed login throttling. Application code does not implement password cryptography.
- HttpOnly + SameSite=Lax cookies; Secure cookies for HTTPS. Staging/production require HTTPS and configured SMTP at startup. No session-cookie-only authorization. Next request-URL logging is disabled to avoid logging verification/reset token query strings.
- All server-rendered protected pages and all business actions require a verified session. The tenant comes from database membership. Central role grants and tenant predicates are rechecked in application services. API inputs are strict allowlists; clients cannot submit authoritative totals, status or organization IDs.
- Parameterized Drizzle queries, composite tenant foreign keys, transactions, revision conflict detection, actor-bound idempotency, append-only audit and invoice guards.
- XML generation and KoSIT validation run behind bounded, checksum-pinned interfaces. No public XML upload endpoint exists. DTDs, entities, XInclude, remote stylesheets, excessive size/depth and malformed UTF-8 are rejected. Java receives a minimal credential-free environment and fixed argument array.
- Authenticated downloads enforce tenant membership and document ownership, read a pinned object version, verify SHA-256 and length before returning bytes, and use attachment/no-store/nosniff headers. Missing or corrupted storage yields no document bytes and creates an integrity observation.
- Finalization has a dedicated role permission, actor-bound idempotency, a persisted frozen snapshot identity, fiscal reservation, worker fencing and database issuance guards. Failed archival cannot produce successful finalization.
- Production security headers disable framing and MIME sniffing, set referrer/permissions policies and HTTPS HSTS. React escapes text; no untrusted HTML rendering.
- Operational logging accepts only named safe fields. Auth provider messages/arguments are intentionally discarded, logging only level and a generated correlation reference. Invoice text, XML, email contents, passwords, bank data and tokens are not passed to application logs. Framework/platform logs must also be configured not to capture request bodies or SQL parameters.
- The application never physically deletes invoices, fiscal jobs, validation history or documents. Production/staging refuse local archival; S3 Object Lock COMPLIANCE retention, versioning and KMS must be verified before issuance. No automatic retention expiry/deletion workflow is enabled.

## Deployment requirements

Use separate database migration/owner and runtime roles. The runtime role must not own tables, be superuser, alter schema/triggers or truncate fiscal tables. See `scripts/runtime-grants.sql`. Restrict database/network access; use managed encryption, backups and tested restores. Enforce TLS to PostgreSQL according to provider certificates. Separate all development, test, staging and production accounts and secrets.

Never deploy APP_ENV=test: browser tests bypass verification in an isolated loopback environment. Do not log cookies, authorization headers, SMTP credentials or database connection strings. Restrict reverse-proxy body sizes and request/IP rates. Trusted client-IP forwarding must be configured for your hosting topology before relying on IP throttling.

A nonce-based strict CSP and OpenTelemetry exporter are not yet installed. OpenTelemetry API instruments are available, but require a deployment SDK/exporter. Add them with deployment-specific verification; the current headers do not claim a complete CSP. External delivery, API-key issuance, API authorization, invitation/role management and tenant switching remain disabled until their own security tests exist. API-key schema anticipates hashed secrets; no plaintext secret endpoint exists.

## Residual dependency risk

Versions were checked against npm on 2026-10-06. Runtime dependency audit has no reported advisories at implementation time. The legacy esbuild advisory was resolved using a pinned 0.28.2 override, verified against migration generation and the full quality gate. Development tooling still inherits five high-severity dependency entries from one underlying advisory in Next ESLint's braces/glob chain. No patched braces release is published in the queried registry. ESLint 10 fails current Next React/import plugin compatibility; the latest compatible 9.39.5 is pinned rather than suppressing lint rules. These tools must run only against trusted code in isolated CI, never as exposed development servers. Review and update the lockfile as compatible fixes become available; full dependency audit findings are not represented as resolved.

## Operational assurance

Configure the worker under an unprivileged OS identity with read-only rules/runtime, private writable temporary storage, memory/CPU limits and restricted network/filesystem access. Code-level URI restrictions are tested; no OS-level network sandbox has been installed by this task. Preserve immutable rule installations for historical evidence. Java 21 updates must be verified independently from profile upgrades.

Before live operation, verify the actual S3 bucket/version-lock/KMS/IAM behavior, denial of retention bypass and deletion, SMTP delivery, encrypted database/object backup restores, alert routing and independent audit-head anchoring. Local integrity tests and S3 contract mocks do not substitute for those deployment checks. Hash chains alone do not demonstrate GoBD compliance. Introduce correction/credit workflows only alongside specification-verified rules.

Report suspected issues privately to repository maintainers with a synthetic reproduction. Do not include customer invoices, secrets or production personal data.

## Local document reader

Photo/PDF/OCR/QR processing is client-side, with same-origin pinned worker/model assets and no recognition service upload. Source files and decoded content are not persisted or logged. Input bytes, raster dimensions, page/text counts and elapsed time are bounded; file signatures and image header dimensions are checked before decoding. PDF content is rendered to inert canvas previews, without viewer scripting or annotation actions. Unknown QR formats and URLs are displayed as unsupported and never followed. Recognition output has no authority over invoice state, bank accounts or permissions. The review page requires `invoice:write`; all saves still pass the original authenticated service and decimal calculation.

Camera permission is restricted to the same origin and requested on explicit button activation. Microphone capture is disabled. Tracks are released on success, stop, timeout, hidden page or unmount. Files/camera frames are not recorded. See [reader security and limits](docs/DOCUMENT-IMPORT.md); browser decoder allocations are not an OS sandbox, and physical camera/browser coverage remains an operational compatibility check.
