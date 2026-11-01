CREATE TABLE "bank_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"bank_name" text NOT NULL,
	"country" text NOT NULL,
	"session_id" text NOT NULL,
	"accounts" text DEFAULT '[]' NOT NULL,
	"valid_until" timestamp,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"connection_id" uuid,
	"external_id" text NOT NULL,
	"account_uid" text NOT NULL,
	"booking_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"counterparty" text DEFAULT '' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"invoice_id" uuid,
	"match_reason" text DEFAULT '' NOT NULL,
	"match_exact" boolean DEFAULT false NOT NULL,
	"payment_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_connection_id_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_connections_tenant_idx" ON "bank_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_tx_external_uq" ON "bank_transactions" USING btree ("tenant_id","external_id");--> statement-breakpoint
CREATE INDEX "bank_tx_tenant_date_idx" ON "bank_transactions" USING btree ("tenant_id","booking_date");