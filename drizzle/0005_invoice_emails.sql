CREATE TABLE "invoice_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text DEFAULT 'invoice' NOT NULL,
	"to_email" text NOT NULL,
	"cc" text DEFAULT '' NOT NULL,
	"subject" text NOT NULL,
	"provider_message_id" text DEFAULT '' NOT NULL,
	"submission_key" text,
	"sent_by" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "email_subject" text DEFAULT 'Invoice {number} from {company}' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "email_body" text DEFAULT 'Hello {contact},

please find attached invoice {number} for {total}, due on {due}.

Kind regards
{company}' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "reminder_subject" text DEFAULT 'Reminder: invoice {number} is overdue' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "reminder_body" text DEFAULT 'Hello {contact},

a friendly reminder that invoice {number} for {balance} was due on {due} ({days} days ago). The invoice is attached again.

If you have already paid, please ignore this email.

Kind regards
{company}' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_emails" ADD CONSTRAINT "invoice_emails_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_emails_invoice_idx" ON "invoice_emails" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_emails_submission_uq" ON "invoice_emails" USING btree ("tenant_id","submission_key");