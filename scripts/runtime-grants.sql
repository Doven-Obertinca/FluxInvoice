-- Run as migration administrator after creating a LOGIN role named flux_runtime
-- through your secret-management/provisioning system. Never put its password here.
GRANT USAGE ON SCHEMA public TO flux_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO flux_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events, invoice_documents, validation_runs, validation_issues, document_checks FROM flux_runtime;
REVOKE DELETE, TRUNCATE ON invoices FROM flux_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
-- Migration owner and runtime must be different roles; no ownership/superuser grant.
-- Apply/review grants after each migration. Do not grant access to drizzle migration metadata.

REVOKE DELETE, TRUNCATE ON einvoice_jobs FROM flux_runtime;
REVOKE DELETE, TRUNCATE ON invoice_deliveries FROM flux_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON delivery_receipts FROM flux_runtime;
