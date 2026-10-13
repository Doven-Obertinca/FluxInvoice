CREATE TABLE "billing_checkouts" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"session_id" text,
	"subscription_id" text,
	"plan" "subscription_plan" NOT NULL,
	"request_key" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_checkouts_customer_id_unique" UNIQUE("customer_id"),
	CONSTRAINT "billing_checkouts_session_id_unique" UNIQUE("session_id"),
	CONSTRAINT "billing_checkouts_subscription_id_unique" UNIQUE("subscription_id")
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION immutable_billing_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Billing event receipts are immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER billing_events_immutable BEFORE UPDATE OR DELETE ON billing_events FOR EACH ROW EXECUTE FUNCTION immutable_billing_event();
--> statement-breakpoint
CREATE TRIGGER billing_events_no_truncate BEFORE TRUNCATE ON billing_events FOR EACH STATEMENT EXECUTE FUNCTION immutable_billing_event();
