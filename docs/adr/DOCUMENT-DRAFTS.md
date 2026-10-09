# Decision: prepare outgoing drafts from reviewed document suggestions

Status: accepted within the explicitly authorized document/photo/QR extension. This decision preserves the completed Phase 2 fiscal engine; it does not introduce Phase 3 or inbound invoice management.

## Product boundary

“Neue Rechnung” remains the primary action and first creation command. “Aus Dokument erstellen” is an alternative input route for the same outgoing-invoice editor. Supporting copy identifies PDF, photo and QR as source formats, not a different type of fiscal invoice.

The existing `/invoices/import` URL remains stable, but its meaning is exclusively preparation of an outgoing draft. The route requires `invoice:write`; neither recognition nor a QR scan persists data or makes a fiscal document. The user reviews the source, selects their customer and explicitly acknowledges the outgoing purpose before opening the editor. Editing/re-evaluating source text or selecting another QR invalidates that acknowledgement.

## Untrusted suggestions, unchanged fiscal commands

`packages/document-import` produces bounded suggestions and a distinct payment-information result. It has no database, issuer, auth, numbering, archive or finalization dependency. A payment beneficiary is not interpreted as an invoice customer. Payment gross is not interpreted as a net price; a remittance reference is not a buyer reference. Extracted bank details and source fiscal number never overwrite application data.

The editor's incomplete form type permits empty fields without weakening `InvoiceInput`. Missing imported quantity, unit, net price, VAT, due date or service date remain blank. The current date is deliberately the issue date of a newly prepared invoice, not a claim about the source. Complete recognized lines stay proposals that require review. No currency conversion, tax inference or incoming-document ownership inference is performed. Domain-schema validation still produces the only valid invoice input, and saving goes through the existing server-authoritative application service. Official validation, revisions, snapshot locks, authorization and finalization are unchanged.

## Separate future incoming workflow

An existing incoming XRechnung XML is an already-issued fiscal source. It must not enter this outgoing-draft adapter or be assigned one of the user's outgoing numbers. XML is outside the accepted source formats here.

If separately authorized later, inbound E-Rechnungen need a distinct route/command namespace (for example `/incoming-invoices/import`), incoming-document domain model and permissions. Such a workflow would preserve the original bytes, external issuer/number and validation evidence; define tenant ownership, duplicate detection, document direction and archival requirements; and have its own lifecycle. It must not reuse outgoing `saveInvoice`/`FINALIZE` as an inbound import operation. These are architectural constraints for future work, not newly implemented endpoints, tables or features.

## Subsequent incoming implementation

The user subsequently authorized a separate incoming inbox, viewer and compliance guidance. It is now implemented at `/incoming` with its own service, tables, permissions, original preservation and approval lifecycle. The outgoing boundaries in this decision remain unchanged. The preceding future-work description records the original decision context; see [the incoming report](../INCOMING-INVOICES.md) for delivered scope and limitations.
