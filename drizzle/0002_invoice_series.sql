CREATE TABLE "invoice_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"prefix" text NOT NULL,
	"mode" text DEFAULT 'sequence' NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "default_series_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "series_tenant_prefix_uq" ON "invoice_series" USING btree ("tenant_id","prefix");--> statement-breakpoint
INSERT INTO "invoice_series" ("tenant_id", "prefix", "mode", "next_number", "is_default")
SELECT "tenant_id", "invoice_prefix", 'sequence', "next_invoice_number", true FROM "companies"
ON CONFLICT DO NOTHING;
