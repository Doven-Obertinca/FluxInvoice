# Phase 2 architecture decisions — accepted

## 1. Versioned semantic model and profile

The domain stays in `invoice-core`; `einvoice` owns a typed normalized model, manifest, mapping, UBL adapter and validator boundary. It imports no React, Next.js, database or authentication modules. One production profile is installed now; persisted profile IDs prevent silently processing an old job with another profile. Future coexistence means adding a registry entry and immutable artifact installation, never changing an already-issued XML object. UBL first avoids maintaining two unproven syntax adapters; CII is an extension seam, not a placeholder implementation.

## 2. XMLBuilder2 and the official KoSIT engine

XMLBuilder2 provides element/text construction and deterministic element ordering. No user value is concatenated into XML markup. A separate safe parser rejects DTD/entity/XInclude/stylesheet input, non-UTF-8, malformed, oversized and excessively nested documents. KoSIT 1.6.3, official bundled UBL XSD, CEN and XRechnung XSLT rules are checksum pinned. The shipped scenarios file is used unchanged for its UBL production scenario; unused CVD template placeholders are not resolved or activated. Supported fixtures prove that the UBL scenario runs and accepts/rejects as expected.

A Node worker launches a fresh Java process using a fixed argument array, never a shell, and passes a minimal environment without database/auth/AWS/SMTP credentials. The request process does not run Java. A validator instance admits one document at a time, with 256 MiB JVM heap, one active processor, 30-second timeout, 2 MiB XML input, 8 MiB report parsing and 1 MiB process-output cap. JAXP forbids external DTD access and permits only file-based schema/stylesheet resolution; pinned rules and the validator's strict relative resolver supply those local files. Temp directories are private and removed in `finally`; raw Java output and invoice XML are not logged. The worker still needs deployment OS/container confinement; Java heap limits are not an RSS limit and this code does not pretend to install a host firewall.

## 3. PostgreSQL and object storage consistency

The outbox submits immutable job identity: tenant, invoice, revision, initiating actor/request, profile and canonical snapshot hash. An organization transaction lock serializes enqueue/idempotency/number allocation. Finalization freezes the invoice and child records at enqueue; validation-only jobs do not freeze drafts. A dedicated PostgreSQL session advisory lock fences concurrent deliveries of one job without holding a SQL transaction throughout Java/storage I/O.

States: `QUEUED → VALIDATING → ARCHIVING → COMPLETED`, or `FAILED`. A candidate is validated before allocating a number. Once allocated in a short committed transaction, the job's number and retention timestamp cannot change. The exact numbered bytes pass a second official issuance check. Their object key is `tenant/job/sha256.xml`. Conditional storage makes retries reuse the same object; stored bytes are read back and compared before the final SQL transaction.

That transaction records the pinned version and immutable document, checks revision/snapshot again, transitions the invoice to FINALIZED, completes the job, appends the audit event and creates the outbox event. Database guards require the matching valid issuance run, hash, job, revision, number and object metadata. One document per tenant/invoice and one number-bearing job per invoice are enforced. A fiscal number reserved before failure is never recycled; the frozen invoice can be retried but not rewritten to conceal the reservation.

| Failure                                  | Result / recovery                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Semantic or official blocking validation | Append result, FAILED, no number/artifact; release an unnumbered finalization freeze  |
| Validator crash/timeout                  | Controlled failure; outbox retry with backoff; no false success                       |
| Number committed, upload fails           | Frozen unfinalized invoice; retry same number/key                                     |
| Upload succeeds, SQL commit fails        | Object remains associated with job; retry verifies/reuses it, then commits            |
| Worker dies                              | OS closes advisory-lock session; expired outbox lease is reclaimable                  |
| Duplicate delivery                       | Session lock + idempotent completed job; one fiscal document                          |
| Missing/corrupt object after issuance    | Download returns no bytes; append failed integrity check; UI exposes detected failure |
| Unreferenced stored object               | Retain it; reconciliation never deletes potential fiscal evidence                     |

Outbox lease is 180 seconds to cover two bounded validator calls and storage I/O. Lease tokens fence acknowledgment; session locks additionally fence fiscal processing. Handlers remain at-least-once, not a distributed exactly-once transport claim. After eight automatic failures the event dead-letters. `npm run archive:reconcile` audits pinned documents and lists stale jobs; `-- --retry-failed` explicitly requeues recoverable jobs without active deliveries. It skips invalid, stale-snapshot and unknown-profile failures. No orphan deletion exists. Investigate consistently failing jobs rather than repeatedly requeueing them blindly.

## 4. Archive trust boundary

`Archive` separates exact-byte put/get from workflow decisions. Local files use private directories, exclusive creation, fsync, no-follow reads, read-only final files and SHA verification; local administrators can still change them. S3 uses conditional writes, KMS, versioning, COMPLIANCE lock and retention verification, then application readback. Only exact versioned bytes are downloadable. No public or unbounded presigned URLs are returned. IAM must restrict bucket/prefix/actions and prohibit retention bypass/deletion; runtime and provisioning principals must differ.

## 5. Product system

Inter is bundled locally. Shared CSS tokens define surfaces, typography, compact controls, financial tabular numbers, focus, error and success states for intentional light/dark themes. RSC remains the data layer; server actions remain authenticated mutation adapters. Radix manages confirmation/command dialogs and keyboard focus. The command palette contains working navigation commands only. The editor keeps totals visible and groups line controls compactly; issued invoices use a separate read-only view. Onboarding groups compliance data into three short steps. No decorative revenue, growth, activity or charts are fabricated.

Browser tests execute the actual production build with an isolated DB, worker and archive. They capture desktop/tablet/mobile in both themes and run axe on critical states. This is useful automated coverage, not a full manual WCAG certification.
