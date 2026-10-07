ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_id_unique" UNIQUE("organization_id","id");
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_event_id_outbox_events_organization_id_id_fk" FOREIGN KEY ("organization_id","event_id") REFERENCES "public"."outbox_events"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adjustments_invoice" ON "invoice_adjustments" USING btree ("organization_id","invoice_id");--> statement-breakpoint
CREATE INDEX "documents_invoice" ON "invoice_documents" USING btree ("organization_id","invoice_id");--> statement-breakpoint
CREATE INDEX "outbox_lease" ON "outbox_events" USING btree ("status","lease_until");--> statement-breakpoint
CREATE INDEX "issues_run" ON "validation_issues" USING btree ("organization_id","run_id");--> statement-breakpoint
CREATE INDEX "validation_invoice" ON "validation_runs" USING btree ("organization_id","invoice_id","revision","created_at");
