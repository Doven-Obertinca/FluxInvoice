CREATE TYPE "public"."subscription_plan" AS ENUM('FREE', 'STARTER', 'BUSINESS', 'PRO');--> statement-breakpoint
CREATE TABLE "invoice_usage" (
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid PRIMARY KEY NOT NULL,
	"period" date NOT NULL,
	"state" text DEFAULT 'RESERVED' NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_usage_state_check" CHECK ("invoice_usage"."state" IN ('RESERVED','CONSUMED','RELEASED')),
	CONSTRAINT "invoice_usage_consumed_check" CHECK (("invoice_usage"."state" = 'CONSUMED') = ("invoice_usage"."consumed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "organization_subscriptions" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"plan" "subscription_plan" DEFAULT 'FREE' NOT NULL,
	"status" text DEFAULT 'INACTIVE' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_subscriptions_provider_customer_id_unique" UNIQUE("provider_customer_id"),
	CONSTRAINT "organization_subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id"),
	CONSTRAINT "subscription_status_check" CHECK ("organization_subscriptions"."status" IN ('INACTIVE','ACTIVE','CANCELLED','PAST_DUE')),
	CONSTRAINT "subscription_period_check" CHECK ("organization_subscriptions"."plan" = 'FREE' OR ("organization_subscriptions"."period_start" IS NOT NULL AND "organization_subscriptions"."period_end" IS NOT NULL AND "organization_subscriptions"."period_end" > "organization_subscriptions"."period_start"))
);
--> statement-breakpoint
ALTER TABLE "invoice_usage" ADD CONSTRAINT "invoice_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_usage" ADD CONSTRAINT "invoice_usage_organization_id_invoice_id_invoices_organization_id_id_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_usage_period_idx" ON "invoice_usage" USING btree ("organization_id","period");
--> statement-breakpoint
INSERT INTO invoice_usage(organization_id,invoice_id,period,state,consumed_at)
SELECT organization_id,id,date_trunc('month', finalized_at AT TIME ZONE 'Europe/Berlin')::date,'CONSUMED',finalized_at
FROM invoices WHERE finalized_at IS NOT NULL;
--> statement-breakpoint
CREATE FUNCTION protect_consumed_invoice_usage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.state = 'CONSUMED' THEN
    RAISE EXCEPTION 'Invoice usage history is immutable';
  END IF;
  IF NEW.organization_id <> OLD.organization_id OR NEW.invoice_id <> OLD.invoice_id THEN
    RAISE EXCEPTION 'Invoice usage identity is immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoice_usage_immutable BEFORE UPDATE OR DELETE ON invoice_usage FOR EACH ROW EXECUTE FUNCTION protect_consumed_invoice_usage();
--> statement-breakpoint
CREATE FUNCTION require_invoice_usage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.finalized_at IS NULL AND NEW.finalized_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM invoice_usage WHERE invoice_id=NEW.id AND organization_id=NEW.organization_id AND state='CONSUMED'
  ) THEN RAISE EXCEPTION 'Finalization requires consumed invoice usage'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoice_usage_required BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION require_invoice_usage();
