CREATE UNIQUE INDEX one_reserved_number_per_invoice ON einvoice_jobs(organization_id,invoice_id) WHERE number IS NOT NULL;
--> statement-breakpoint
ALTER TABLE invoice_documents ADD CONSTRAINT document_job_fk FOREIGN KEY(organization_id,job_id) REFERENCES einvoice_jobs(organization_id,id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' OR NEW.number IS NOT NULL OR NEW.finalization_pending OR NEW.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'invoices must start as drafts'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'invoice deletion requires an explicit retention workflow'; END IF;
 IF OLD.status NOT IN ('DRAFT','VALIDATED') THEN RAISE EXCEPTION 'invoice is immutable'; END IF;
 IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'ownership immutable'; END IF;
 IF OLD.finalization_pending AND (to_jsonb(NEW)-'status'-'updated_at'-'finalization_pending'-'finalized_at'-'number') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'updated_at'-'finalization_pending'-'finalized_at'-'number') THEN RAISE EXCEPTION 'finalization snapshot is frozen'; END IF;
 IF NEW.status='FINALIZED' THEN
  IF NOT OLD.finalization_pending OR NEW.finalization_pending OR NEW.finalized_at IS NULL OR NEW.number IS NULL THEN RAISE EXCEPTION 'finalization protocol required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM invoice_documents d JOIN validation_runs v ON v.id=d.validation_run_id AND v.organization_id=d.organization_id JOIN einvoice_jobs j ON j.id=d.job_id AND j.organization_id=d.organization_id WHERE d.invoice_id=NEW.id AND d.organization_id=NEW.organization_id AND v.invoice_id=NEW.id AND v.revision=NEW.revision AND v.valid AND v.purpose='ISSUANCE' AND v.profile='XRECHNUNG' AND v.candidate_hash=d.sha256 AND v.manifest_hash=d.manifest_hash AND j.invoice_id=NEW.id AND j.revision=NEW.revision AND j.number=NEW.number AND j.state='ARCHIVING' AND j.candidate_hash=d.sha256 AND j.object_key=d.object_key AND j.object_version=d.object_version) THEN RAISE EXCEPTION 'verified archive and exact issuance validation required'; END IF;
 ELSIF NEW.number IS NOT NULL OR NEW.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'fiscal identity only at finalization';
 ELSIF NEW.status NOT IN ('DRAFT','VALIDATED','CANCELLED') THEN RAISE EXCEPTION 'unsupported lifecycle transition';
 END IF;
 IF OLD.finalization_pending AND NOT NEW.finalization_pending AND NEW.status<>'FINALIZED' AND EXISTS(SELECT 1 FROM einvoice_jobs WHERE organization_id=NEW.organization_id AND invoice_id=NEW.id AND number IS NOT NULL) THEN RAISE EXCEPTION 'reserved invoice must remain frozen'; END IF;
 IF NEW.status='VALIDATED' THEN
  IF NOT EXISTS(SELECT 1 FROM validation_runs WHERE organization_id=NEW.organization_id AND invoice_id=NEW.id AND revision=NEW.revision AND valid) THEN RAISE EXCEPTION 'current validation required'; END IF;
  IF (to_jsonb(NEW)-'status'-'updated_at'-'finalization_pending') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'updated_at'-'finalization_pending') THEN RAISE EXCEPTION 'editing requires draft state'; END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_invoice_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status invoice_status; pending boolean; parent_id uuid; tenant_id uuid;
BEGIN
 IF TG_OP='DELETE' THEN parent_id:=OLD.invoice_id;tenant_id:=OLD.organization_id; ELSE parent_id:=NEW.invoice_id;tenant_id:=NEW.organization_id; END IF;
 IF TG_OP='UPDATE' AND (NEW.organization_id<>OLD.organization_id OR NEW.invoice_id<>OLD.invoice_id) THEN RAISE EXCEPTION 'parent ownership immutable'; END IF;
 SELECT status,finalization_pending INTO parent_status,pending FROM invoices WHERE id=parent_id AND organization_id=tenant_id FOR UPDATE;
 IF parent_status IS DISTINCT FROM 'DRAFT'::invoice_status OR pending THEN RAISE EXCEPTION 'invoice content can only change in unfrozen draft state'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE FUNCTION protect_einvoice_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'jobs are retained'; END IF;
 IF OLD.state='COMPLETED' THEN RAISE EXCEPTION 'completed job immutable'; END IF;
 IF (to_jsonb(NEW)-'state'-'number'-'candidate_hash'-'object_key'-'object_version'-'retention_until'-'last_error_code'-'attempts'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'number'-'candidate_hash'-'object_key'-'object_version'-'retention_until'-'last_error_code'-'attempts'-'updated_at') THEN RAISE EXCEPTION 'job identity immutable'; END IF;
 IF OLD.number IS NOT NULL AND (NEW.number IS DISTINCT FROM OLD.number OR NEW.retention_until IS DISTINCT FROM OLD.retention_until) THEN RAISE EXCEPTION 'fiscal reservation immutable'; END IF;
 IF OLD.candidate_hash IS NOT NULL AND NEW.candidate_hash IS DISTINCT FROM OLD.candidate_hash THEN RAISE EXCEPTION 'candidate immutable'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER fiscal_job_guard BEFORE UPDATE OR DELETE ON einvoice_jobs FOR EACH ROW EXECUTE FUNCTION protect_einvoice_job();
--> statement-breakpoint
CREATE TRIGGER validation_run_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON validation_runs FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER validation_issue_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON validation_issues FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER document_check_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON document_checks FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
