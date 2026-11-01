import { boolean, pgTable, uuid, text, integer, numeric, date, timestamp, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";

// tenantId = Clerk organization id, or user id for single users. Every query is scoped by it.

export const invoiceStatus = pgEnum("invoice_status", ["draft", "sent", "paid", "overdue", "cancelled"]);

export const companies = pgTable("companies", {
  tenantId: text("tenant_id").primaryKey(),
  name: text("name").notNull().default(""),
  address: text("address").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  taxId: text("tax_id").notNull().default(""),
  bankDetails: text("bank_details").notNull().default(""),
  // Payment QR (EPC / GiroCode) and optional online payment link
  accountHolder: text("account_holder").notNull().default(""),
  iban: text("iban").notNull().default(""),
  bic: text("bic").notNull().default(""),
  paymentLink: text("payment_link").notNull().default(""),
  showPaymentQr: boolean("show_payment_qr").notNull().default(true),
  logoUrl: text("logo_url").notNull().default(""),
  currency: text("currency").notNull().default("EUR"),
  defaultTaxRate: numeric("default_tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  hourlyRateCents: integer("hourly_rate_cents").notNull().default(0),
  travelRateCents: integer("travel_rate_cents").notNull().default(0),
  paymentTermsDays: integer("payment_terms_days").notNull().default(14),
  invoicePrefix: text("invoice_prefix").notNull().default("#"),
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(1),
  // Tax (ELSTER figures). vatStatus: regular | kleinunternehmer. taxBasis: ist (on payment) | soll (on invoice).
  elsterEnabled: boolean("elster_enabled").notNull().default(false),
  vatStatus: text("vat_status").notNull().default("regular"),
  taxBasis: text("tax_basis").notNull().default("ist"),
  vatPeriod: text("vat_period").notNull().default("quarterly"),
  taxNumber: text("tax_number").notNull().default(""),
  emailSubject: text("email_subject").notNull().default("Invoice {number} from {company}"),
  emailBody: text("email_body").notNull().default("Hello {contact},\n\nplease find attached invoice {number} for {total}, due on {due}.\n\nKind regards\n{company}"),
  reminderSubject: text("reminder_subject").notNull().default("Reminder: invoice {number} is overdue"),
  reminderBody: text("reminder_body").notNull().default("Hello {contact},\n\na friendly reminder that invoice {number} for {balance} was due on {due} ({days} days ago). The invoice is attached again.\n\nIf you have already paid, please ignore this email.\n\nKind regards\n{company}"),
  footerNote: text("footer_note").notNull().default("Please reference your invoice number in the payment details for proper allocation."),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Invoice number series. mode "sequence": PREFIX + running number (e.g. #61927).
// mode "date": PREFIX + DDMMYYYY of the chosen date (e.g. TSM18092026); duplicates get -2, -3...
export const invoiceSeries = pgTable("invoice_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull(),
  prefix: text("prefix").notNull(),
  mode: text("mode").notNull().default("sequence"),
  nextNumber: integer("next_number").notNull().default(1),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("series_tenant_prefix_uq").on(t.tenantId, t.prefix)]);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  contactName: text("contact_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  taxId: text("tax_id").notNull().default(""),
  notes: text("notes").notNull().default(""),
  // Pricing for SVR-generated lines. 0 = fall back to company hourly rate.
  // hourly | half_full (half-day / full-day by hours) | full_day (fixed per day) | task (fixed per task/visit)
  defaultSeriesId: uuid("default_series_id"),
  // VAT treatment of this client's invoices: domestic (German VAT) | eu_reverse (EU business, reverse charge) | non_eu (outside the EU)
  country: text("country").notNull().default(""),
  vatTreatment: text("vat_treatment").notNull().default("domestic"),
  pricingMode: text("pricing_mode").notNull().default("half_full"),
  taskRateCents: integer("task_rate_cents").notNull().default(0),
  halfDayRateCents: integer("half_day_rate_cents").notNull().default(0),
  fullDayRateCents: integer("full_day_rate_cents").notNull().default(0),
  halfDayMaxHours: numeric("half_day_max_hours", { precision: 4, scale: 2 }).notNull().default("4"),
  hourlyRateCents: integer("hourly_rate_cents").notNull().default(0),
  travelFlatCents: integer("travel_flat_cents").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("clients_tenant_idx").on(t.tenantId)]);

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
  number: text("number").notNull(),
  status: invoiceStatus("status").notNull().default("draft"),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  supplyDates: text("supply_dates").notNull().default(""),
  currency: text("currency").notNull().default("EUR"),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  submissionKey: text("submission_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("invoices_tenant_idx").on(t.tenantId),
  uniqueIndex("invoices_submission_uq").on(t.tenantId, t.submissionKey),
  uniqueIndex("invoices_tenant_number_uq").on(t.tenantId, t.number),
]);

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  lineTotalCents: integer("line_total_cents").notNull(),
}, (t) => [index("items_invoice_idx").on(t.invoiceId)]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  paidOn: date("paid_on").notNull(),
  method: text("method").notNull().default(""),
  reference: text("reference").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("payments_invoice_idx").on(t.invoiceId)]);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull(),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  blobPath: text("blob_path").notNull(),
  category: text("category").notNull().default("general"),
  tags: text("tags").notNull().default(""),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  visitDate: date("visit_date"),
  visitHours: numeric("visit_hours", { precision: 6, scale: 2 }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("documents_tenant_idx").on(t.tenantId)]);

// Money spent for the work: coffee on site, taxi, parking, cables, tools.
// billable = to be charged back to the client; invoiceId set once it is on an invoice.
export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull(),
  spentOn: date("spent_on").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("other"),
  vendor: text("vendor").notNull().default(""),
  amountCents: integer("amount_cents").notNull(),          // gross, as on the receipt
  vatRate: numeric("vat_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("EUR"),
  paymentMethod: text("payment_method").notNull().default(""),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  billable: boolean("billable").notNull().default(false),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  receiptDocId: uuid("receipt_doc_id").references(() => documents.id, { onDelete: "set null" }),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  submissionKey: text("submission_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("expenses_tenant_date_idx").on(t.tenantId, t.spentOn),
  uniqueIndex("expenses_submission_uq").on(t.tenantId, t.submissionKey)]);

// Every email sent for an invoice (audit trail; also prevents double sends).
export const invoiceEmails = pgTable("invoice_emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("invoice"),          // invoice | reminder
  toEmail: text("to_email").notNull(),
  cc: text("cc").notNull().default(""),
  subject: text("subject").notNull(),
  providerMessageId: text("provider_message_id").notNull().default(""),
  submissionKey: text("submission_key"),
  sentBy: text("sent_by").notNull(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
}, (t) => [index("invoice_emails_invoice_idx").on(t.invoiceId), uniqueIndex("invoice_emails_submission_uq").on(t.tenantId, t.submissionKey)]);
