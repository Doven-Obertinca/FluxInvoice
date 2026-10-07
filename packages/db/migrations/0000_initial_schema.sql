CREATE TYPE "public"."organization_role" AS ENUM('OWNER', 'ADMIN', 'ACCOUNTANT', 'MEMBER', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'VALIDATED', 'FINALIZED', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED', 'CREDITED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_id_account_id_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"event_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"timestamp" timestamp (3) with time zone NOT NULL,
	"request_id" uuid NOT NULL,
	"metadata" jsonb NOT NULL,
	"previous_hash" text,
	"event_hash" text NOT NULL,
	"sequence" bigint NOT NULL,
	CONSTRAINT "audit_events_organization_id_sequence_unique" UNIQUE("organization_id","sequence"),
	CONSTRAINT "audit_hash" CHECK ("audit_events"."event_hash" ~ '^[a-f0-9]{64}$' AND ("audit_events"."previous_hash" IS NULL OR "audit_events"."previous_hash" ~ '^[a-f0-9]{64}$'))
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"line1" text NOT NULL,
	"city" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" text NOT NULL,
	CONSTRAINT "customer_addresses_organization_id_customer_id_unique" UNIQUE("organization_id","customer_id"),
	CONSTRAINT "address_country" CHECK ("customer_addresses"."country" = 'DE')
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"vat_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_organization_id_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"operation" text NOT NULL,
	"key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_organization_id_operation_key_unique" UNIQUE("organization_id","operation","key")
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"credential_reference" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"vat_rate" text NOT NULL,
	CONSTRAINT "adjustment_bounds" CHECK ("invoice_adjustments"."amount">=0 AND "invoice_adjustments"."kind" IN ('ALLOWANCE','CHARGE') AND "invoice_adjustments"."vat_rate" IN ('19','7'))
);
--> statement-breakpoint
CREATE TABLE "invoice_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"object_version" text NOT NULL,
	"sha256" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" bigint NOT NULL,
	"profile" text NOT NULL,
	"profile_version" text NOT NULL,
	"ruleset_version" text NOT NULL,
	"retention_policy_version" text NOT NULL,
	"retain_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_documents_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "document_integrity" CHECK ("invoice_documents"."sha256" ~ '^[a-f0-9]{64}$' AND "invoice_documents"."size">0)
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"unit_price" numeric(18, 6) NOT NULL,
	"unit" text NOT NULL,
	"vat_rate" text NOT NULL,
	"allowance" numeric(18, 2) NOT NULL,
	"charge" numeric(18, 2) NOT NULL,
	"net" numeric(18, 2) NOT NULL,
	CONSTRAINT "invoice_items_organization_id_invoice_id_position_unique" UNIQUE("organization_id","invoice_id","position"),
	CONSTRAINT "line_bounds" CHECK ("invoice_items"."quantity">0 AND "invoice_items"."unit_price">=0 AND "invoice_items"."net">=0 AND "invoice_items"."allowance">=0 AND "invoice_items"."charge">=0 AND "invoice_items"."position">=0),
	CONSTRAINT "line_vat" CHECK ("invoice_items"."vat_rate" IN ('19','7')),
	CONSTRAINT "line_unit" CHECK ("invoice_items"."unit" IN ('C62','HUR','DAY'))
);
--> statement-breakpoint
CREATE TABLE "invoice_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"line1" text NOT NULL,
	"city" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" text NOT NULL,
	"vat_id" text NOT NULL,
	"tax_number" text,
	"iban" text,
	"bic" text,
	CONSTRAINT "invoice_parties_organization_id_invoice_id_kind_unique" UNIQUE("organization_id","invoice_id","kind"),
	CONSTRAINT "party_kind" CHECK ("invoice_parties"."kind" IN ('SELLER','BUYER'))
);
--> statement-breakpoint
CREATE TABLE "invoice_tax_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"rate" text NOT NULL,
	"taxable" numeric(18, 2) NOT NULL,
	"tax" numeric(18, 2) NOT NULL,
	CONSTRAINT "invoice_tax_summaries_organization_id_invoice_id_rate_unique" UNIQUE("organization_id","invoice_id","rate"),
	CONSTRAINT "tax_summary_bounds" CHECK ("invoice_tax_summaries"."taxable">=0 AND "invoice_tax_summaries"."tax">=0 AND "invoice_tax_summaries"."rate" IN ('19','7'))
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "invoice_status" DEFAULT 'DRAFT' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"number" text,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"service_date" date NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"buyer_reference" text NOT NULL,
	"notes" text NOT NULL,
	"net" numeric(18, 2) NOT NULL,
	"tax" numeric(18, 2) NOT NULL,
	"payable" numeric(18, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "invoices_organization_id_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "invoice_currency" CHECK ("invoices"."currency" = 'EUR'),
	CONSTRAINT "invoice_dates" CHECK ("invoices"."due_date" >= "invoices"."issue_date"),
	CONSTRAINT "invoice_totals" CHECK ("invoices"."net" >= 0 AND "invoices"."tax" >= 0 AND "invoices"."payable" = "invoices"."net"+"invoices"."tax"),
	CONSTRAINT "invoice_revision" CHECK ("invoices"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "organization_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_organization_id_user_id_unique" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"line1" text NOT NULL,
	"city" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" text DEFAULT 'DE' NOT NULL,
	"vat_id" text NOT NULL,
	"tax_number" text NOT NULL,
	"iban" text NOT NULL,
	"bic" text NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"number_prefix" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_currency" CHECK ("organizations"."currency" = 'EUR'),
	CONSTRAINT "org_country" CHECK ("organizations"."country" = 'DE'),
	CONSTRAINT "org_prefix" CHECK ("organizations"."number_prefix" ~ '^[A-Z0-9-]{0,20}$')
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" uuid,
	"last_error_code" text,
	CONSTRAINT "outbox_status" CHECK ("outbox_events"."status" IN ('PENDING','PROCESSING','DONE','DEAD') AND "outbox_events"."attempts">=0)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "invoice_number_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_number_sequences_organization_id_year_unique" UNIQUE("organization_id","year"),
	CONSTRAINT "sequence_bounds" CHECK ("invoice_number_sequences"."value" >= 0 AND "invoice_number_sequences"."year" BETWEEN 2000 AND 9999)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "validation_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"code" text NOT NULL,
	"rule_id" text NOT NULL,
	"severity" text NOT NULL,
	"field_path" text NOT NULL,
	"message" text NOT NULL,
	"source" text NOT NULL,
	"profile" text NOT NULL,
	"ruleset_version" text NOT NULL,
	CONSTRAINT "issue_severity" CHECK ("validation_issues"."severity" IN ('ERROR','WARNING'))
);
--> statement-breakpoint
CREATE TABLE "validation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"profile" text NOT NULL,
	"ruleset_version" text NOT NULL,
	"valid" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validation_runs_organization_id_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"response_status" integer,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_organization_id_endpoint_id_event_id_attempt_unique" UNIQUE("organization_id","endpoint_id","event_id","attempt")
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret_reference" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_endpoints_organization_id_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_organization_id_customer_id_customers_organization_id_id_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_organization_id_invoice_id_invoices_organization_id_id_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_organization_id_invoice_id_invoices_organization_id_id_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_organization_id_invoice_id_invoices_organization_id_id_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_parties" ADD CONSTRAINT "invoice_parties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_parties" ADD CONSTRAINT "invoice_parties_organization_id_invoice_id_invoices_organization_id_id_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_tax_summaries" ADD CONSTRAINT "invoice_tax_summaries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_tax_summaries" ADD CONSTRAINT "invoice_tax_summaries_organization_id_invoice_id_invoices_organization_id_id_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_customer_id_customers_organization_id_id_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_number_sequences" ADD CONSTRAINT "invoice_number_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_issues" ADD CONSTRAINT "validation_issues_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_issues" ADD CONSTRAINT "validation_issues_organization_id_run_id_validation_runs_organization_id_id_fk" FOREIGN KEY ("organization_id","run_id") REFERENCES "public"."validation_runs"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_organization_id_invoice_id_invoices_organization_id_id_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_endpoint_id_webhook_endpoints_organization_id_id_fk" FOREIGN KEY ("organization_id","endpoint_id") REFERENCES "public"."webhook_endpoints"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customers_tenant_name" ON "customers" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "invoices_tenant_created" ON "invoices" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outbox_poll" ON "outbox_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verifications" USING btree ("identifier");