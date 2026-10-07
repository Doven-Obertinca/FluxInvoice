ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_organization_id_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
CREATE TABLE "document_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"valid" boolean NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "einvoice_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'QUEUED' NOT NULL,
	"actor_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"snapshot_hash" text NOT NULL,
	"number" text,
	"candidate_hash" text,
	"object_key" text,
	"object_version" text,
	"retention_until" timestamp with time zone,
	"last_error_code" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "einvoice_jobs_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "einvoice_jobs_organization_id_invoice_id_revision_kind_unique" UNIQUE("organization_id","invoice_id","revision","kind"),
	CONSTRAINT "job_kind" CHECK ("einvoice_jobs"."kind" IN ('VALIDATE','FINALIZE')),
	CONSTRAINT "job_state" CHECK ("einvoice_jobs"."state" IN ('QUEUED','VALIDATING','ARCHIVING','COMPLETED','FAILED'))
);
--> statement-breakpoint
ALTER TABLE "invoice_documents" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_documents" ADD COLUMN "validation_run_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_documents" ADD COLUMN "manifest_hash" text;--> statement-breakpoint
ALTER TABLE "invoice_documents" ADD COLUMN "archive_mode" text DEFAULT 'LOCAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_parties" ADD COLUMN "contact_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_parties" ADD COLUMN "contact_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "finalization_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "finalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "contact_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "contact_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "validation_issues" ADD COLUMN "business_term" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "validation_issues" ADD COLUMN "technical_location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "validation_issues" ADD COLUMN "profile_version" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "candidate_hash" text;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "profile_version" text;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "validator_version" text;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "cen_version" text;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "manifest_hash" text;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "report_hash" text;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "purpose" text DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "document_checks" ADD CONSTRAINT "document_checks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_checks" ADD CONSTRAINT "document_checks_organization_id_document_id_invoice_documents_organization_id_id_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."invoice_documents"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einvoice_jobs" ADD CONSTRAINT "einvoice_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einvoice_jobs" ADD CONSTRAINT "einvoice_jobs_organization_id_invoice_id_invoices_organization_id_id_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_checks_latest" ON "document_checks" USING btree ("organization_id","document_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_reconcile" ON "einvoice_jobs" USING btree ("state","updated_at");--> statement-breakpoint
ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_organization_id_validation_run_id_validation_runs_organization_id_id_fk" FOREIGN KEY ("organization_id","validation_run_id") REFERENCES "public"."validation_runs"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_organization_id_invoice_id_unique" UNIQUE("organization_id","invoice_id");