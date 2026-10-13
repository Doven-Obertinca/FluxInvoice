CREATE TABLE "autopilot_cursors" (
	"key" text PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"entity_id" uuid,
	"entity_type" text DEFAULT 'invoice' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autopilot_policies" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'MANUAL' NOT NULL,
	"timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"prepare_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "autopilot_mode" CHECK ("autopilot_policies"."mode" IN ('MANUAL','ASSISTED','AUTOPILOT')),
	CONSTRAINT "autopilot_timezone" CHECK ("autopilot_policies"."timezone" = 'Europe/Berlin')
);
--> statement-breakpoint
CREATE TABLE "customer_payment_metrics" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"rule" text NOT NULL,
	"rule_version" text NOT NULL,
	"deduplication_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"recommendation" text NOT NULL,
	"facts" jsonb NOT NULL,
	"amount" numeric(18, 2),
	"due_day" date,
	"related_id" uuid,
	"mandatory" boolean DEFAULT false NOT NULL,
	"snoozed_until" date,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_actions_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "financial_actions_organization_id_deduplication_key_unique" UNIQUE("organization_id","deduplication_key"),
	CONSTRAINT "financial_action_status" CHECK ("financial_actions"."status" IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','DISMISSED','SUPERSEDED')),
	CONSTRAINT "financial_action_severity" CHECK ("financial_actions"."severity" IN ('INFO','ATTENTION','WARNING','CRITICAL'))
);
--> statement-breakpoint
CREATE TABLE "financial_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"action_id" uuid,
	"actor_id" text NOT NULL,
	"operation" text NOT NULL,
	"rule" text,
	"rule_version" text,
	"facts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"operation" text NOT NULL,
	"fingerprint" text NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_deadlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"due_day" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_deadlines_organization_id_entity_type_entity_id_kind_unique" UNIQUE("organization_id","entity_type","entity_id","kind")
);
--> statement-breakpoint
CREATE TABLE "financial_digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"day" date NOT NULL,
	"fingerprint" text NOT NULL,
	"content" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_digests_organization_id_day_unique" UNIQUE("organization_id","day")
);
--> statement-breakpoint
CREATE TABLE "financial_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"action_id" uuid NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_feedback_organization_id_actor_id_action_id_unique" UNIQUE("organization_id","actor_id","action_id"),
	CONSTRAINT "financial_feedback_value" CHECK ("financial_feedback"."value" IN ('HELPFUL','IRRELEVANT','HIDE'))
);
--> statement-breakpoint
CREATE TABLE "financial_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"customer_id" uuid,
	"supplier_key" text,
	"fingerprint" text,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_sources_organization_id_entity_type_entity_id_unique" UNIQUE("organization_id","entity_type","entity_id"),
	CONSTRAINT "financial_source_kind" CHECK ("financial_sources"."entity_type" IN ('invoice','incoming'))
);
--> statement-breakpoint
CREATE TABLE "financial_summaries" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incoming_duplicate_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incoming_id" uuid NOT NULL,
	"other_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"actor_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incoming_duplicate_decisions_organization_id_incoming_id_other_id_fingerprint_unique" UNIQUE("organization_id","incoming_id","other_id","fingerprint"),
	CONSTRAINT "duplicate_decision" CHECK ("incoming_duplicate_decisions"."decision" IN ('DUPLICATE','NOT_DUPLICATE') AND "incoming_duplicate_decisions"."incoming_id" <> "incoming_duplicate_decisions"."other_id")
);
--> statement-breakpoint
CREATE TABLE "incoming_financial_terms" (
	"incoming_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"due_day" date,
	"discount_day" date,
	"discount_rate" numeric(5, 2),
	"discount_base" numeric(18, 2),
	"actor_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_terms_discount" CHECK (("incoming_financial_terms"."discount_day" IS NULL AND "incoming_financial_terms"."discount_rate" IS NULL AND "incoming_financial_terms"."discount_base" IS NULL) OR ("incoming_financial_terms"."discount_day" IS NOT NULL AND "incoming_financial_terms"."discount_rate" > 0 AND "incoming_financial_terms"."discount_rate" <= 100 AND "incoming_financial_terms"."discount_base" > 0))
);
--> statement-breakpoint
CREATE TABLE "payment_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"paid_day" date NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"actor_id" text NOT NULL,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_observation_amount" CHECK ("payment_observations"."amount" > 0),
	CONSTRAINT "payment_observation_kind" CHECK ("payment_observations"."entity_type" IN ('invoice','incoming'))
);
--> statement-breakpoint
ALTER TABLE "autopilot_policies" ADD CONSTRAINT "autopilot_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payment_metrics" ADD CONSTRAINT "customer_payment_metrics_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payment_metrics" ADD CONSTRAINT "customer_payment_metrics_organization_id_customer_id_customers_organization_id_id_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_actions" ADD CONSTRAINT "financial_actions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_activity" ADD CONSTRAINT "financial_activity_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_activity" ADD CONSTRAINT "financial_activity_organization_id_action_id_financial_actions_organization_id_id_fk" FOREIGN KEY ("organization_id","action_id") REFERENCES "public"."financial_actions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_confirmations" ADD CONSTRAINT "financial_confirmations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_confirmations" ADD CONSTRAINT "financial_confirmations_organization_id_action_id_financial_actions_organization_id_id_fk" FOREIGN KEY ("organization_id","action_id") REFERENCES "public"."financial_actions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_deadlines" ADD CONSTRAINT "financial_deadlines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_digests" ADD CONSTRAINT "financial_digests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_feedback" ADD CONSTRAINT "financial_feedback_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_feedback" ADD CONSTRAINT "financial_feedback_organization_id_action_id_financial_actions_organization_id_id_fk" FOREIGN KEY ("organization_id","action_id") REFERENCES "public"."financial_actions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_sources" ADD CONSTRAINT "financial_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_summaries" ADD CONSTRAINT "financial_summaries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_duplicate_decisions" ADD CONSTRAINT "incoming_duplicate_decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_duplicate_decisions" ADD CONSTRAINT "incoming_duplicate_decisions_organization_id_incoming_id_incoming_documents_organization_id_id_fk" FOREIGN KEY ("organization_id","incoming_id") REFERENCES "public"."incoming_documents"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_duplicate_decisions" ADD CONSTRAINT "incoming_duplicate_decisions_organization_id_other_id_incoming_documents_organization_id_id_fk" FOREIGN KEY ("organization_id","other_id") REFERENCES "public"."incoming_documents"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_financial_terms" ADD CONSTRAINT "incoming_financial_terms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_financial_terms" ADD CONSTRAINT "incoming_financial_terms_organization_id_incoming_id_incoming_documents_organization_id_id_fk" FOREIGN KEY ("organization_id","incoming_id") REFERENCES "public"."incoming_documents"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_observations" ADD CONSTRAINT "payment_observations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_actions_queue" ON "financial_actions" USING btree ("organization_id","status","severity","due_day");--> statement-breakpoint
CREATE INDEX "financial_actions_entity" ON "financial_actions" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "financial_activity_timeline" ON "financial_activity" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "financial_confirmations_actor" ON "financial_confirmations" USING btree ("organization_id","actor_id","created_at");--> statement-breakpoint
CREATE INDEX "financial_deadlines_due" ON "financial_deadlines" USING btree ("organization_id","due_day");--> statement-breakpoint
CREATE INDEX "financial_sources_customer" ON "financial_sources" USING btree ("organization_id","customer_id");--> statement-breakpoint
CREATE INDEX "financial_sources_supplier" ON "financial_sources" USING btree ("organization_id","supplier_key");--> statement-breakpoint
CREATE INDEX "financial_sources_hash" ON "financial_sources" USING btree ("organization_id","fingerprint");--> statement-breakpoint
CREATE INDEX "payment_observation_entity" ON "payment_observations" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX payment_observation_active ON payment_observations(organization_id,entity_type,entity_id) WHERE reversed_at IS NULL;
--> statement-breakpoint
CREATE INDEX financial_invoice_sweep ON invoices(organization_id,id);
--> statement-breakpoint
CREATE INDEX financial_incoming_sweep ON incoming_documents(organization_id,id);
--> statement-breakpoint
CREATE FUNCTION financial_entity_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.entity_type='invoice' THEN
    IF NOT EXISTS(SELECT 1 FROM invoices WHERE organization_id=NEW.organization_id AND id=NEW.entity_id) THEN RAISE EXCEPTION 'Financial entity ownership violation'; END IF;
  ELSIF NEW.entity_type='incoming' THEN
    IF NOT EXISTS(SELECT 1 FROM incoming_documents WHERE organization_id=NEW.organization_id AND id=NEW.entity_id) THEN RAISE EXCEPTION 'Financial entity ownership violation'; END IF;
  ELSIF NEW.entity_type='organization' THEN
    IF NEW.entity_id<>NEW.organization_id THEN RAISE EXCEPTION 'Financial entity ownership violation'; END IF;
  ELSE RAISE EXCEPTION 'Unknown financial entity type'; END IF;
  IF TG_TABLE_NAME='financial_actions' THEN
   IF NEW.related_id IS NOT NULL THEN
    IF NEW.entity_type<>'incoming' OR NOT EXISTS(SELECT 1 FROM incoming_documents WHERE organization_id=NEW.organization_id AND id=NEW.related_id) THEN RAISE EXCEPTION 'Financial related entity ownership violation'; END IF;
  END IF;
   END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER financial_sources_owner BEFORE INSERT OR UPDATE ON financial_sources FOR EACH ROW EXECUTE FUNCTION financial_entity_owner();
--> statement-breakpoint
CREATE TRIGGER financial_actions_owner BEFORE INSERT OR UPDATE ON financial_actions FOR EACH ROW EXECUTE FUNCTION financial_entity_owner();
--> statement-breakpoint
CREATE TRIGGER financial_deadlines_owner BEFORE INSERT OR UPDATE ON financial_deadlines FOR EACH ROW EXECUTE FUNCTION financial_entity_owner();
--> statement-breakpoint
CREATE TRIGGER payment_observations_owner BEFORE INSERT OR UPDATE ON payment_observations FOR EACH ROW EXECUTE FUNCTION financial_entity_owner();
--> statement-breakpoint
CREATE FUNCTION financial_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Financial history is append only'; END $$;
--> statement-breakpoint
CREATE TRIGGER financial_activity_immutable BEFORE UPDATE OR DELETE ON financial_activity FOR EACH ROW EXECUTE FUNCTION financial_append_only();
--> statement-breakpoint
CREATE TRIGGER duplicate_decisions_immutable BEFORE UPDATE OR DELETE ON incoming_duplicate_decisions FOR EACH ROW EXECUTE FUNCTION financial_append_only();
--> statement-breakpoint
CREATE FUNCTION payment_observation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'reversed_at') IS DISTINCT FROM (to_jsonb(OLD)-'reversed_at') OR OLD.reversed_at IS NOT NULL OR NEW.reversed_at IS NULL THEN RAISE EXCEPTION 'Payment facts are immutable; only one reversal is permitted'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payment_observations_immutable BEFORE UPDATE OR DELETE ON payment_observations FOR EACH ROW EXECUTE FUNCTION payment_observation_immutable();
