# ERechno Autopilot

The dashboard and `/autopilot` show persisted recommendations derived from the current organization's real invoices. There is no LLM or bank balance inference.

## Operation

Run migrations before deploying the web application and worker:

```sh
npm run db:migrate
npm run autopilot:reconcile -- --all
npm run dev
```

The reconciliation command processes one bounded batch by default. `--all` resumes the persisted cursor through the remainder of the current sweep, with a 10,000-batch ceiling. The regular worker maintains a persistent keyset cursor and processes 25 entities every ten seconds. Invoice events, incoming approvals/checks, and delivery changes trigger targeted reevaluation. Reconciliation recovers missed events and advancing calendar days. Large existing installations need a full sweep before every historical document appears; the UI timestamps projections.

Apply `scripts/runtime-grants.sql` with the migration administrator in deployments using `flux_runtime`, after migrations. Retain the existing separate billing adapter grants. Production runtime must never own the tables or hold administrator privileges.

## Supported observations

- Overdue outgoing and approved incoming invoices; deadlines within seven Berlin calendar days.
- Current-revision XRechnung validation and processing failures; latest delivery failure or bounce.
- Incoming review queues and original-file/hash/supplier-number duplicate comparisons.
- Explicitly reviewed Skonto terms within three calendar days; decimal arithmetic for savings.
- Unusual approved expenses against at least five earlier supplier invoices, using a bounded sample of up to 100 peer projections and a threshold of three times the median.
- Customer payment behavior from at most 250 explicitly confirmed payments: mean, median, days late, late share, and the most recent three versus previous observations. A deterioration signal requires at least six observations and a seven-day increase.
- Seven/thirty-day known receivables, payables, net cash movement and overdue receivables. A negative thirty-day movement creates a warning, never a claim that the business lacks funds.

Unknown payment dates and unsupported currencies are excluded from EUR movement calculations. Unapproved incoming documents and confirmed duplicates do not become expected expenses. Source bytes are never selected for a dashboard projection.

## Decisions and safety

Tenant membership is checked server-side; financial writes also acquire the organization transaction lock. Database ownership triggers reject foreign financial entities and duplicate peers. `financial-execution.ts` is a closed operation/safety allowlist.

Payment and duplicate decisions require server-issued, five-minute, actor/tenant/action/source-bound confirmation tickets. Replays of consumed tickets have no further effect. Changed facts and expired tickets are rejected. Payment records are full-amount user observations; they neither initiate a transfer nor change fiscal invoice status, XML, invoice totals, or original files. Existing invoice overview totals recognize these observations.

A recommendation may be acknowledged, postponed to tomorrow, dismissed or personally hidden where appropriate. Mandatory review/validation/processing items remain visible. Feedback tunes presentation only. Stable deduplication keys prevent repeated recommendations; changed source facts reopen obsolete decisions. Resolved and superseded states remain inspectable.

Manual detects and recommends. Assisted allows user-requested internal checklists. Autopilot only prepares the explicitly enabled review, delivery or payment-deadline checklists; it does not approve a document, send mail, change tax treatment, or pay a bill. Preparation is recorded as in progress, never as resolution of the underlying problem.

Every detection, disposition, confirmation and automatic preparation creates immutable activity plus a digest anchored in the existing audit chain. `/autopilot/activity` provides tenant-scoped keyset pagination over the complete history. Internal daily digest generation consumes projections separately from rule evaluation. No digest emails are sent.

## Boundaries

There is no banking connector, partial-payment matching, verified VIES result, recurring-expense contract ledger, autonomous invoice correction or tax decision. No speculative recommendations are created for those facts. Payment and duplicate corrections currently require a future dedicated reviewed reversal UI; production must not edit historical records directly. Delivery retries and original approvals remain in the existing explicitly confirmed workflows.
