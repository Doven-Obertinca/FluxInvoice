# Incoming E-Rechnung delivery report

This separately authorized extension implements the incoming inbox, human-readable viewer and correction guidance requested after the completed Phase 2 work. It preserves the outgoing fiscal engine and reviewed **Aus Dokument erstellen** workflow. It does not start the broader Phase 3 roadmap.

## Delivered workflow

**E-Rechnungen** separates Eingang, Ausgang and their problem queues. The incoming table shows supplier/invoice, receipt date, due date, payable amount/currency, XML validation, identity trust and processing/approval state. Upload supports an accessible file input and drag-and-drop followed by explicit import. Lists use deterministic pagination of 25 records. An organization can receive 100 originals per rolling 24 hours, each at most 2 MiB; identical-request retries remain idempotent at the quota.

The viewer has Rechnung, Strukturierte Daten, Prüfung and Original tabs. It presents issuer/recipient, number, dates, currency, lines, quantity/unit, price, VAT category/rate, net/tax/gross/payable, payment details, buyer/order references, separate contact details and notes. Missing source information stays missing. Issuer decimal values are preserved rather than recomputed through the restricted outgoing tax model. Raw XML is an advanced disclosure; original downloads are attachments, not active previews. Price base quantities and every optional EN 16931 business term are not yet modeled: the UI explicitly points to the original where necessary. This is a shared UBL/CII viewer, not exhaustive support for every invoice profile.

Validation guidance explains the affected information, significance and next action, with technical rule evidence available separately. Known field mappings focus the corresponding displayed field and open contact disclosures when necessary. Supplier contact email and electronic invoice address are distinct targets. An incoming original is never silently repaired: the issuer supplies a corrected document, imported as a new original. Rechecking preserves earlier evidence. The existing outgoing editor continues to support corrections and official revalidation before finalization.

The incoming approval gate requires a successful current supported XML check, verified archival bytes, approval permission and explicit business review. Approval is bound to the latest check ID; stale screens cannot approve newer evidence. Technical validity does not establish supplier identity, delivery, bank ownership or authorization to pay. The UI states **Identität nicht bestätigt**. Approval does not create a payment, export, outgoing number or outgoing invoice. Paid/exported states are not fabricated without those workflows.

## Format and validation boundary

- Namespace-qualified UBL Invoice/CreditNote and UN/CEFACT CII are parsed into a read projection. XML is bounded, UTF-8 decoded, and rejects DTD/entity expansion, external inclusion, stylesheets and ambiguous singleton values.
- Hybrid PDFs may provide one embedded `factur-x.xml`, `zugferd-invoice.xml` or `xrechnung.xml`. Missing, encrypted or ambiguous attachments fail closed. The original PDF remains intact. PDF/A compliance and equivalence of visible PDF and embedded XML are **not** certified.
- Only the exact XRechnung 3 profile identifier is submitted to the installed official KoSIT/XRechnung validator. The existing pinned manifest and report hash identify validation evidence. Other readable profiles are **Profil nicht geprüft** and cannot be approved. Recognizing a ZUGFeRD attachment does not imply ZUGFeRD profile validation.
- Runtime/archive failures are retryable processing errors, distinct from invalid source documents. Malformed originals remain downloadable and cannot be approved.

The configured validator manifest is recorded on each check as runtime provenance; for unsupported profiles it does not mean that validator was applied. The UI does not claim official validity for those checks.

## Architecture and invariants

`packages/incoming` handles safe projection and bounded PDF extraction; `IncomingService` handles authorization, intake, archival processing, checking and approval. Migrations `0006_incoming_documents` and `0007_incoming_checks` create a distinct tenant-owned domain. No incoming action calls outgoing save/finalize or numbering.

Intake commits original bytes, digest, actor, receipt metadata and an outbox job together. The request key is tenant scoped and bound to actor, filename and content. XML/PDF original bytes are authoritative; parsed JSON is a replaceable read projection before approval. Database triggers prevent original/provenance mutation or deletion, preserve archive identity and prohibit mutation of approved records. Check history is append-only. Operations append tenant audit evidence.

The worker uses a per-document advisory lock, conditional archive writes and exact-version readback/hash verification. Approval reverifies the archived original and reauthorizes inside the tenant transaction. Download also verifies size/hash and records access. Cross-tenant access and role restrictions apply independently of client controls. Owners, administrators and accountants may approve; members may import/read; viewers may read.

Source values reserve `UPLOAD`, `EMAIL`, `API` and `PEPPOL`. Only authenticated upload is active. Future adapters must establish tenant/actor authority and transport provenance, enforce quotas, and submit immutable bytes through the same intake/outbox boundary. Reserving source types is not an email, public API or Peppol integration. Transport deduplication and sender trust must be designed for each adapter; the current idempotency key is not semantic duplicate detection.

## Operations and limitations

Run migrations, deploy the repository's PDF child script and installed PDF.js runtime, then run the separate worker from the repository root. Extraction uses a temporary private file, fixed child command, 128 MiB JavaScript heap cap, 10-second timeout and bounded output; it cleans the temporary directory. It does not render pages, follow invoice URLs or execute PDF actions. These application limits do not replace OS/container RSS, filesystem or network confinement. Existing Java confinement and production archive requirements still apply.

Originals are retained in PostgreSQL as well as the archive; include them in backup, capacity and restore planning. The retention date is January 1 of receipt year plus nine, a minimum policy rather than an individualized legal determination. There is no deletion workflow. Operators must handle retention extensions and legal holds. LOCAL storage is explicitly not WORM; production requires independently verified Object Lock/IAM/KMS behavior. No live cloud storage or production deployment was performed.

Outbox retries handle temporary failures; after retry exhaustion an authorized manual recheck creates a fresh processing request. Monitor stalled/dead jobs and storage integrity. No supplier verification, payment initiation, DATEV transmission, mailbox ingestion, Peppol transport or certified general-purpose ZUGFeRD validator is included.

## Verification

The final `npm run check` passed: lint with zero warnings, strict typecheck, **110 unit/integration tests across eight files** (96.83 seconds) and the production Next.js build. Formatting and `git diff --check` passed. `npm audit --omit=dev --audit-level=moderate` reported zero production vulnerabilities. Migrations were applied to the local development database and exercised in isolated test databases.

Incoming tests cover namespace/security/size/ambiguity rejection, official UBL and upstream CII validation, exact hybrid XML extraction, encrypted/non-hybrid rejection, tenant/role boundaries, actor-bound idempotency, quota/pagination, immutable originals/check history, explicit/stale approval guards, malformed/unsupported profiles, archive failure/recovery and retryable validator failure. Existing fiscal, storage, calculation, discovery and document/QR tests remain in the suite. Fixtures include a committed official KoSIT CII example and a fictional hybrid attachment PDF; the latter is not represented as certified PDF/A or ZUGFeRD.

Browser review found and corrected an unnamed mobile search button, non-keyboard-focusable table scrolling, a misrouted contact-email focus target, an incorrect incoming breadcrumb and the review-checkbox layout. Revalidation correctly resets user acknowledgement; the browser test now waits for the new pending/completed check rather than the previous result.

The missing-reference browser case also exposed a report-adapter defect: this installed KoSIT version emits normalized VARL `message` nodes rather than embedding raw SVRL assertions. The adapter now reads normalized rule code, XPath and severity, retains SVRL compatibility and deduplicates evidence. A real official-validator regression asserts BR-DE-15 maps to BT-10 and the buyer-reference field. No acceptance rule is weakened.

Final complete browser suite: **2 passed in 1.4 minutes**, with no skipped tests or weakened assertions. The extended workflow verifies upload/drag-and-drop, review-gated approval, revalidation, unchanged original download, invalid-reference guidance and focus, problem filtering, hybrid PDF extraction, oversized-file rejection and malformed-original blocking. Existing onboarding, outgoing finalization, PDF/photo/OCR/QR, camera/cancellation and hostile-origin checks also passed.

Incoming viewer, inbox and invalid states were captured at 1440×1000 and 390×844 in light/dark themes. Automated axe checks against selected WCAG 2/2.1/2.2 AA rules and page-overflow assertions passed on both sizes/themes. Representative final desktop/dark viewer, desktop/dark inbox and mobile/light invalid screenshots were visually inspected. Horizontal line/table scrolling is keyboard accessible; no full manual WCAG certification is claimed. Screenshots are local test artifacts under ignored `test-results/visual`.

The quality gate is complete as of 8 October 2026. The earlier failed browser runs exposed the defects described above; the final run passed after correction. A leftover server from an interrupted test run was identified and stopped before the final clean run. No production deployment or Phase 3 execution was performed.

## References

Format boundaries were checked against the [BMF E-Rechnung FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html), [XRechnung versions and bundles](https://xeinkauf.de/xrechnung/versionen-und-bundles/), [XRechnung FAQ](https://xeinkauf.de/xrechnung/faq), [FeRD publications](https://www.ferd-net.de/downloads/veroeffentlichungen) and the [official KoSIT test suite](https://github.com/itplr-kosit/xrechnung-testsuite/). FeRD listed ZUGFeRD 2.5.2 when reviewed; no claim of validating that release is made. Sources guide format support, not a guarantee of tax/legal correctness.
