CREATE TABLE "incoming_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incoming_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validation" text NOT NULL,
	"profile_id" text,
	"manifest_hash" text,
	"report_hash" text,
	"issues" jsonb NOT NULL,
	"parser_version" text NOT NULL,
	"error_code" text
);
--> statement-breakpoint
ALTER TABLE "incoming_checks" ADD CONSTRAINT "incoming_checks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_checks" ADD CONSTRAINT "incoming_checks_organization_id_incoming_id_incoming_documents_organization_id_id_fk" FOREIGN KEY ("organization_id","incoming_id") REFERENCES "public"."incoming_documents"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incoming_checks_document" ON "incoming_checks" USING btree ("organization_id","incoming_id","created_at");--> statement-breakpoint
CREATE TRIGGER incoming_check_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON incoming_checks FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
