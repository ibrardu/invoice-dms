ALTER TABLE "invoices" ADD COLUMN "kind" text DEFAULT 'invoice' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "credit_for" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "locked_at" timestamp;--> statement-breakpoint
UPDATE "invoices" SET "locked_at" = "updated_at" WHERE "status" <> 'draft' AND "locked_at" IS NULL;
