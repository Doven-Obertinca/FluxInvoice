# Product-intelligence implementation report

7 October 2026. Continues the completed Phase 1/2 implementation and the reviewed **Aus Dokument erstellen** extension. The new product-intelligence request authorized research, prioritization and execution of a coherent subset, not all twenty candidates. No work was discarded or restarted. Historical Phase 2 evidence remains in [PHASE-2-REPORT.md](PHASE-2-REPORT.md).

## Delivered scope

The [research](PRODUCT-RESEARCH-2026.md), [DATEV integration strategy](DATEV-INTEGRATION-STRATEGY.md) and [weighted roadmap](PRODUCT-ROADMAP-2026.md) were written before application implementation. They distinguish facts, user reports, vendor claims, inferences and product hypotheses; examine all twenty candidates; and explicitly record current competitor strengths and evidence gaps.

Three connected outgoing workflows are implemented:

1. **Find:** Cmd/Ctrl+K searches saved invoice snapshots and customer records. Name, invoice number, buyer reference and VAT ID use literal case-insensitive matching; plain decimal EUR amounts match exactly without binary floats or guessed thousands grouping. Search returns up to eight results per kind. Debounced authenticated requests, query clearing, superseded-response suppression, keyboard navigation and visible loading/empty/failure/retry states are included. It does not search nonexistent incoming suppliers or purchase-order fields.
2. **Prioritize:** `/invoices/attention` lists current failed validation, interrupted processing and overdue issued invoices, in that priority order. Stable 25-row pages, explicit action links, desktop/mobile layouts and an empty state are included. Old-revision failures and failures superseded by a valid check disappear; active validation retries do not retain the old failed-check alert. Draft due dates do not become overdue-payment warnings. No inferred payment or reminder action occurs.
3. **Resolve:** Existing official validation issues now explain why an entry matters and how to correct it. Customer links target the actual record. Company/customer guidance explains the need to save the draft again to refresh snapshots. Buyer references must come from the recipient. Unknown mappings retain support guidance and advanced evidence without a dead field-jump button. Finalization explains permissions, unsaved edits, active processing, frozen recovery and missing/failed validation. These explanations do not replace server authorization or compliance checks.

The primary creation action remains **Neue Rechnung**. **Aus Dokument erstellen** retains PDF/photo/OCR/QR/camera capture, required review and incomplete-value safeguards. No existing fiscal original is reinterpreted as a new outgoing invoice.

## Architecture and security review

No schema migration, new dependency, public API, payment capability or outbound integration was introduced. Reads authorize current persisted membership and scope every invoice/customer/join/subquery by organization. Returned search metadata excludes source files and banking data. Query text is not included in operation logs. Read-only access does not grant finalization rights. Existing strict input validation, Decimal calculations, idempotency, immutable artifacts, chained audit, outbox and archive recovery are unchanged.

Original search and queue records remain server-owned. The browser cannot set organization or trust status. Wildcards are escaped and SQL values parameterized. Oversized search terms and invalid page numbers fail validation. Queue state is observational, not an assertion of fraud, legal tax correctness, receipt or payment. Current official fixtures/validators continue to guard actual fiscal issuance.

A visual review found that the shared mobile invoice table hid the new reason/action columns. The queue now repeats this essential context in its mobile first cell, with an explicit visibility regression assertion. A desktop-specific assertion was corrected after the responsive copy made a text-only selector ambiguous; both desktop and mobile visibility remain explicitly tested.

## Verification

- Full unit/integration suite: **102 tests across seven files passed**, 92.56 seconds. Includes official KoSIT fixtures, fiscal/archive failures and prior document/QR boundaries.
- New coverage: literal/wildcard/amount normalization; malformed and oversized search; all finalization blocker categories; unknown-rule guidance; tenant-spoof rejection; read-role access; customer snapshot independence; current/stale validation results; active retry suppression; an actually finalized overdue invoice; archive-failure queue recovery.
- Lint and strict typecheck passed. Production build passed, including the new attention route.
- Initial expanded E2E run: **2 passed, 59.3 seconds**. Full correction → queue → field → save → official validation → search → finalization → download path passed. Customer/amount searches, stale visible-result clearing, empty search, injected failed search and recovery passed, followed by all PDF/photo/QR/camera/cancellation regression steps.
- Final post-mobile-fix gate: production build, lint, strict typecheck, formatting and whitespace checks passed. Complete E2E suite **2 passed in 58.4 seconds** (main workflow 57.4 seconds), including the explicit mobile reason/action regression check. No tests were skipped or disabled. Both-theme desktop axe checks and desktop/tablet/mobile overflow checks passed. Representative new queue, correction and search screenshots were visually inspected, including the corrected mobile queue. The final run produced 133 visual screenshots in ignored `test-results/visual`.
- Production dependency audit: **zero vulnerabilities**. Existing development-tooling advisory risk is unchanged from the Phase 2 report; no dependencies were added or upgraded.

## Representative scenario walkthroughs

These are engineering walkthroughs and automated representative tasks, **not tests with recruited human users**. No human completion-time or commercial conversion claim is made. Automated suite duration is not user task time.

| Segment                               | Job and observed path                                                                      | Likely hesitation / repeated entry                                                       | Safe automation / must remain reviewed                                                 | Fit and next evidence                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A Freelancer, 10/month                | Create → check → resolve buyer reference → finalize; browser-tested                        | Understanding recipient reference; ask once, enter explicitly                            | Arithmetic/search/validation automatic; no invented reference or VAT                   | Strong supported-case fit; measure real first-use correction time                      |
| B Handwerker, 50/month                | Photo/PDF suggestions → review → editor → check; existing full browser regression retained | OCR uncertainty and missing unit/net/tax; manual completion necessary                    | Local extraction suggests; service dates, tax and customer require review              | Supported simple invoices only; construction special-tax/partial invoices remain a gap |
| C Agency, 100/month                   | Search by reference/amount → open exact saved invoice; queue prioritizes failed checks     | Repeat services still typed; catalog/templates deferred                                  | Discovery and obsolete-warning removal automatic; finalization deliberate              | Test repeat-line entry before claiming speed advantage                                 |
| D Ecommerce, high volume              | Architecture walkthrough against connector/API boundary                                    | No usable public order API, credit workflow or shop adapter yet                          | Future idempotent ingestion possible; tax mapping and delivery setup cannot be guessed | Not current high-volume product fit; no simulated connector success                    |
| E Office manager, incoming + outgoing | Outgoing queue and mobile action tested; incoming boundary inspected                       | Incoming XML cannot yet be received/viewed here; existing accounting tool still required | Outgoing observations automatic; incoming original/approval must be separate           | Incoming pilot next, not disguised as document-to-draft import                         |
| F Adviser collaboration               | Exact archived XRechnung download tested; official DATEV manual upload path documented     | Tenant/adviser configuration and official accounting mapping remain external             | Hash-verified download automatic; recipient acceptance/booking require confirmation    | No live DATEV acceptance test, invitation flow or automated export claimed             |

## Limits and rollout

This iteration is implemented and locally verified, not deployed or certified. Existing Phase 2 production prerequisites remain: live Object Lock/IAM/KMS verification, isolated validator execution, backups/restore, least-privilege database roles and monitoring. Search uses bounded SQL result sets, not a benchmarked large-tenant search index; measure query plans before promising ecommerce-scale latency. Queue ordering is deterministic but is not a locked work allocation system.

Incoming inbox/viewer, trust observations, duplicate detection, IBAN comparison, adviser workspace and DATEV automation are explicitly **NEXT**, with dependency gates in the roadmap. Email ingestion, public webhook delivery, shop connectors, payment matching and Peppol are deferred. The application does not yet satisfy the long-term incoming-viewer or public-API success statements; it does satisfy the selected implementation scope without inventing those capabilities.

## Subsequent incoming delivery

The scenario and evidence above describe the earlier product-intelligence iteration. Incoming receipt, review and approval were subsequently authorized and implemented separately; see [the incoming report](INCOMING-INVOICES.md) for the current supported subset and combined regression results.
