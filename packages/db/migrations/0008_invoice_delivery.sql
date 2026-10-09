CREATE TABLE "delivery_receipts" (
	"event_id" text PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"channel" text DEFAULT 'EMAIL' NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"sender_name" text NOT NULL,
	"reply_to" text NOT NULL,
	"attachment_hash" text NOT NULL,
	"filename" text NOT NULL,
	"provider_id" text,
	"provider" text,
	"error_code" text,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resend_of" uuid,
	CONSTRAINT "invoice_deliveries_organization_id_request_key_unique" UNIQUE("organization_id","request_key"),
	CONSTRAINT "delivery_channel" CHECK ("invoice_deliveries"."channel" IN ('EMAIL','PEPPOL','API','CUSTOMER_PORTAL')),
	CONSTRAINT "delivery_status" CHECK ("invoice_deliveries"."status" IN ('QUEUED','SUBMITTED','DELIVERED','BOUNCED','FAILED'))
);
--> statement-breakpoint
ALTER TABLE "delivery_receipts" ADD CONSTRAINT "delivery_receipts_attempt_id_invoice_deliveries_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."invoice_deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_organization_id_invoice_id_invoices_organization_id_id_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_organization_id_document_id_invoice_documents_organization_id_id_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."invoice_documents"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_resend_of_invoice_deliveries_id_fk" FOREIGN KEY ("resend_of") REFERENCES "public"."invoice_deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_invoice" ON "invoice_deliveries" USING btree ("organization_id","invoice_id","created_at");