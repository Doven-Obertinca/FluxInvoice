# Product roadmap — 7 October 2026

Decision recorded before major implementation. Evidence: [research](PRODUCT-RESEARCH-2026.md); [DATEV strategy](DATEV-INTEGRATION-STRATEGY.md). This is the newly authorized product-intelligence work, not a retrospective rewrite of completed Phase 2.

## Vision and target

The modern e-invoice operating layer for German businesses: automate certainty, surface uncertainty, hand clean documents to accounting. Initial fit remains German/EUR outgoing invoices with the supported 19%/7% tax cases. Freelancers, service agencies and small office teams are the immediate users. Craft businesses need special-tax/partial-invoice analysis before broader fit claims. High-volume ecommerce, incoming office work and adviser handoff are strategic segments, not capabilities we already possess.

DATEV brings adviser adoption, accounting depth and official interfaces. Lexware/sevdesk/Papierkram already provide useful review and automation; easybill has mature shop workflows; FastBill/Billomat have DATEV handoff; Accountable competes on accessible invoicing; collection specialists handle fragmented sources. Our proposed differentiation is continuity of actionable evidence and correction within the invoice task, with honest local extraction and immutable fiscal artifacts. It remains a hypothesis requiring comparative user trials.

## Weighted prioritization

All inputs 0–5. U user value, D differentiation, F frequency, R revenue, S strategic value; C implementation cost, L compliance risk, X security risk (higher is worse). Score = 5U + 2D + 3F + 2R + 4S − 3C − 3L − 2X. This is a decision aid, not market measurement; revenue and search frequency in particular have low confidence. Dependencies and a coherent workflow can override rank. No false precision beyond integer scores.

| Candidate             | U   | D   | F   | R   | S   | C   | L   | X   | Score | Timing                       |
| --------------------- | --- | --- | --- | --- | --- | --- | --- | --- | ----- | ---------------------------- |
| Incoming inbox        | 5   | 3   | 5   | 4   | 5   | 5   | 4   | 5   | 37    | NEXT                         |
| Universal viewer      | 5   | 2   | 5   | 3   | 5   | 5   | 4   | 4   | 35    | NEXT                         |
| Compliance fixer      | 5   | 3   | 4   | 4   | 5   | 2   | 2   | 1   | 57    | NOW                          |
| Preflight             | 5   | 2   | 5   | 4   | 5   | 2   | 2   | 1   | 58    | NOW                          |
| Trust center          | 4   | 4   | 3   | 4   | 5   | 5   | 4   | 4   | 30    | NEXT                         |
| Duplicate detection   | 4   | 3   | 3   | 4   | 4   | 3   | 3   | 3   | 35    | NEXT                         |
| IBAN change warning   | 4   | 3   | 2   | 4   | 4   | 4   | 4   | 4   | 24    | NEXT                         |
| DATEV handoff         | 5   | 2   | 4   | 5   | 5   | 5   | 4   | 4   | 36    | NEXT                         |
| Adviser collaboration | 4   | 2   | 4   | 4   | 5   | 4   | 4   | 4   | 32    | NEXT                         |
| Recurring invoices    | 4   | 1   | 3   | 4   | 3   | 4   | 4   | 3   | 21    | LATER                        |
| Templates             | 4   | 1   | 4   | 3   | 3   | 3   | 2   | 1   | 35    | NEXT                         |
| Service catalog       | 3   | 1   | 4   | 3   | 3   | 3   | 2   | 1   | 30    | NEXT                         |
| Workspace search      | 4   | 2   | 4   | 3   | 4   | 2   | 1   | 2   | 45    | NOW                          |
| Problem inbox         | 5   | 3   | 5   | 4   | 5   | 3   | 2   | 2   | 55    | NOW                          |
| Email ingestion       | 4   | 1   | 5   | 4   | 4   | 5   | 4   | 5   | 24    | LATER                        |
| API + webhooks        | 5   | 3   | 4   | 5   | 5   | 5   | 4   | 5   | 36    | NEXT design / LATER delivery |
| Shop connectors       | 4   | 2   | 5   | 5   | 4   | 5   | 5   | 5   | 25    | LATER                        |
| Batch review          | 4   | 2   | 4   | 4   | 4   | 4   | 4   | 4   | 28    | LATER                        |
| Payment matching      | 4   | 1   | 5   | 4   | 3   | 5   | 5   | 5   | 17    | LATER                        |
| Peppol                | 4   | 2   | 3   | 4   | 4   | 5   | 4   | 5   | 20    | LATER                        |

## NOW — three connected workflows

1. **Find the invoice:** real Cmd/Ctrl+K results for invoices/customers, using names, fiscal number, buyer reference, VAT ID and exact EUR amount where available. Authenticated, bounded server search; escaped literal terms; stale-result suppression, keyboard navigation, empty/error/loading states. No supplier/order/Leitweg-specific field claims beyond actual stored buyer-reference content.
2. **Know what needs attention:** a paginated outgoing problem queue, reachable from the dashboard and command palette, for latest current-revision failed checks, processing failures and overdue issued invoices. Distinguish payment follow-up from technical validation. No automatic reminder, payment or state transition. Exclude obsolete failures after correction/revalidation.
3. **Resolve the blocker:** strengthen the existing compliance fixer with explanations and specific correction destinations, plus explicit finalization-blocker reasons for unsaved edits, missing checks, failed checks, active jobs and insufficient permissions. Unknown rules get a safe fallback and advanced technical evidence, never a guessed tax fix. Master-data changes require saving the draft again to refresh its snapshots.

This set combines the top three scored areas (fixer/preflight count as one workflow) with search as an enabling path. It extends existing server queries and UI rather than creating a second fiscal engine. It is deliberately outgoing-only. Incoming visibility is not simulated with outgoing drafts.

Acceptance: unit rules/query-normalization tests; real database tenant and permission tests; current/stale validation and processing-failure cases; full E2E correction/finalization and import regression; keyboard/search/attention navigation; responsive light/dark screenshots and axe; lint/types/full tests/build. No disabled gates. Results and scenario walkthroughs go in PRODUCT-IMPLEMENTATION-REPORT.md.

## NEXT

Separate incoming originals + structured viewer + explainable duplicate/IBAN observations, coupled to an official DATEV handoff pilot and scoped adviser access. Dependencies: source retention/quarantine lifecycle; dedicated permissions and tables; safe UBL/CII and hybrid extraction; broad hostile-file and official compliance fixtures; independent business approval. Original hash matches indicate identical bytes; supplier/number matches are only probable duplicates. Changed account or unfamiliar supplier must not automatically block, delete or label fraud. Never overwrite an incoming original or reissue it as an outgoing invoice.

Templates/catalog discovery can follow with modest cost, but repeat content must not silently reuse old dates, references, numbering or tax assumptions. API/connector contracts are specified in the DATEV strategy; no externally usable key/webhook interface until the full security boundary exists.

## LATER

Configured recurring drafts, hardened email ingestion, public API/webhooks, one evidence-selected shop connector, batch processing, partner payment reconciliation and provider-based Peppol. Each depends on correction/credit lifecycle and applicable tax scope, provider setup, monitoring and recovery. Sending/reminders require explicit configuration. Hybrid semantics need official current format/legal review, not OCR replacement. No public claim of universal viewer/receiver until supported profiles have fixtures and explicit unsupported-case handling.

## DO NOT BUILD

Payroll, HR, inventory, CRM, general ledger, tax returns, banking or project management. No private DATEV APIs, speculative fraud score, inferred tax/account codes, automatically trusted OCR, or cosmetic “AI” features. No generic accounting export claiming DATEV compatibility without official-schema and recipient acceptance tests.

## Commercial and operational gates

Near-term rationale: reduce support-dependent correction and navigation in the existing product before broad acquisition claims. No revenue uplift, conversion rate or time savings has been measured. Research supports incoming friction strongly, but splitting original preservation from a viewer would ship an incomplete trust boundary. A coherent incoming/handoff pilot is the next investment, not three unsupported file inputs today.

Production deployment still needs the Phase 2 staging/Object Lock/IAM/KMS/worker confinement gate. Existing audit, tenant isolation, idempotency, decimal arithmetic, snapshot/version identity and fiscal immutability remain unchanged. Search must not log its text; queries and results stay within the authenticated tenant. Problem states are observations, not mutations or assertions of legal invalidity. Re-evaluate priorities after six moderated trials and an adviser-approved sample handoff; do not turn these estimates into a feature-count commitment.

## Delivery update: separately authorized incoming scope

The subsequent user request authorized the incoming inbox, shared UBL/CII viewer and correction guidance. The implemented subset and current limitations are recorded in [the incoming report](INCOMING-INVOICES.md). Email/API/Peppol ingestion, payment and accounting handoff remain future work.
