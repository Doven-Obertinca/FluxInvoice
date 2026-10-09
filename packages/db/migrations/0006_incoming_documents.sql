CREATE TABLE "incoming_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"source" text NOT NULL,
	"filename" text NOT NULL,
	"kind" text NOT NULL,
	"original" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"size" integer NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" text DEFAULT 'RECEIVED' NOT NULL,
	"object_key" text,
	"object_version" text,
	"archive_mode" text,
	"retain_until" timestamp with time zone NOT NULL,
	"parser_version" text,
	"parsed" jsonb,
	"validation" text DEFAULT 'PENDING' NOT NULL,
	"profile_id" text,
	"manifest_hash" text,
	"report_hash" text,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_code" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	CONSTRAINT "incoming_documents_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "incoming_documents_organization_id_request_key_unique" UNIQUE("organization_id","request_key"),
	CONSTRAINT "incoming_bounds" CHECK ("incoming_documents"."size" > 0 AND "incoming_documents"."size" <= 2097152 AND octet_length("incoming_documents"."original") = "incoming_documents"."size"),
	CONSTRAINT "incoming_state" CHECK ("incoming_documents"."state" IN ('RECEIVED','REVIEW','ERROR','APPROVED')),
	CONSTRAINT "incoming_validation" CHECK ("incoming_documents"."validation" IN ('PENDING','VALID','INVALID','UNSUPPORTED','ERROR')),
	CONSTRAINT "incoming_kind" CHECK ("incoming_documents"."kind" IN ('xml','pdf')),
	CONSTRAINT "incoming_source" CHECK ("incoming_documents"."source" IN ('UPLOAD','EMAIL','API','PEPPOL'))
);
--> statement-breakpoint
ALTER TABLE "incoming_documents" ADD CONSTRAINT "incoming_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incoming_tenant_received" ON "incoming_documents" USING btree ("organization_id","received_at","id");--> statement-breakpoint
CREATE FUNCTION protect_incoming_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'incoming originals are retained'; END IF;
 IF OLD.state='APPROVED' THEN RAISE EXCEPTION 'approved incoming document immutable'; END IF;
 IF (to_jsonb(NEW)-'state'-'object_key'-'object_version'-'archive_mode'-'parser_version'-'parsed'-'validation'-'profile_id'-'manifest_hash'-'report_hash'-'issues'-'error_code'-'approved_by'-'approved_at') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'object_key'-'object_version'-'archive_mode'-'parser_version'-'parsed'-'validation'-'profile_id'-'manifest_hash'-'report_hash'-'issues'-'error_code'-'approved_by'-'approved_at') THEN RAISE EXCEPTION 'incoming source immutable'; END IF;
 IF OLD.object_version IS NOT NULL AND (NEW.object_version IS DISTINCT FROM OLD.object_version OR NEW.object_key IS DISTINCT FROM OLD.object_key OR NEW.archive_mode IS DISTINCT FROM OLD.archive_mode) THEN RAISE EXCEPTION 'incoming archive identity immutable'; END IF;
 IF NEW.state='APPROVED' AND (NEW.validation<>'VALID' OR NEW.object_version IS NULL OR NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.parsed IS NULL) THEN RAISE EXCEPTION 'incoming approval prerequisites'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER incoming_original_guard BEFORE UPDATE OR DELETE ON incoming_documents FOR EACH ROW EXECUTE FUNCTION protect_incoming_document();
--> statement-breakpoint
CREATE TRIGGER incoming_truncate_guard BEFORE TRUNCATE ON incoming_documents FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
