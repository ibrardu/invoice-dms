ALTER TABLE "clients" ADD COLUMN "country" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "vat_treatment" text DEFAULT 'domestic' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "elster_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "vat_status" text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "tax_basis" text DEFAULT 'ist' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "vat_period" text DEFAULT 'quarterly' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "tax_number" text DEFAULT '' NOT NULL;