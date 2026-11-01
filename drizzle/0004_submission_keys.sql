ALTER TABLE "expenses" ADD COLUMN "submission_key" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "submission_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_submission_uq" ON "expenses" USING btree ("tenant_id","submission_key");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_submission_uq" ON "invoices" USING btree ("tenant_id","submission_key");