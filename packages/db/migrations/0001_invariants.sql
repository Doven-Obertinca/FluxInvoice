CREATE FUNCTION forbid_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit events are append only'; END; $$;
--> statement-breakpoint
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION protect_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.status <> 'DRAFT' THEN RAISE EXCEPTION 'invoices must start as drafts'; END IF;
   RETURN NEW;
 END IF;
 IF OLD.status NOT IN ('DRAFT','VALIDATED') THEN RAISE EXCEPTION 'invoice is immutable'; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'invoice deletion requires an explicit retention workflow'; END IF;
 IF NEW.organization_id <> OLD.organization_id THEN RAISE EXCEPTION 'tenant ownership is immutable'; END IF;
 IF NEW.status NOT IN ('DRAFT','VALIDATED','CANCELLED') THEN RAISE EXCEPTION 'electronic finalization is not enabled in phase 1'; END IF;
 IF NEW.status='VALIDATED' THEN
   IF NOT EXISTS (SELECT 1 FROM validation_runs WHERE organization_id=NEW.organization_id AND invoice_id=NEW.id AND revision=NEW.revision AND valid AND profile='FLUX_DRAFT' AND ruleset_version='1') THEN RAISE EXCEPTION 'current validation required'; END IF;
   IF (to_jsonb(NEW)-'status'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'updated_at') THEN RAISE EXCEPTION 'editing requires draft state'; END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER invoice_guard BEFORE INSERT OR UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION protect_invoice();
--> statement-breakpoint
CREATE FUNCTION protect_invoice_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status invoice_status; parent_id uuid; tenant_id uuid;
BEGIN
 IF TG_OP='DELETE' THEN parent_id:=OLD.invoice_id;tenant_id:=OLD.organization_id; ELSE parent_id:=NEW.invoice_id;tenant_id:=NEW.organization_id; END IF;
 IF TG_OP='UPDATE' AND (NEW.organization_id<>OLD.organization_id OR NEW.invoice_id<>OLD.invoice_id) THEN RAISE EXCEPTION 'parent ownership immutable'; END IF;
 SELECT status INTO parent_status FROM invoices WHERE id=parent_id AND organization_id=tenant_id FOR UPDATE;
 IF parent_status IS DISTINCT FROM 'DRAFT'::invoice_status THEN RAISE EXCEPTION 'invoice content can only change in draft state'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER item_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_items FOR EACH ROW EXECUTE FUNCTION protect_invoice_child();
--> statement-breakpoint
CREATE TRIGGER party_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_parties FOR EACH ROW EXECUTE FUNCTION protect_invoice_child();
--> statement-breakpoint
CREATE TRIGGER adjustment_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_adjustments FOR EACH ROW EXECUTE FUNCTION protect_invoice_child();
--> statement-breakpoint
CREATE TRIGGER tax_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_tax_summaries FOR EACH ROW EXECUTE FUNCTION protect_invoice_child();
--> statement-breakpoint
CREATE TRIGGER document_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON invoice_documents FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC;
