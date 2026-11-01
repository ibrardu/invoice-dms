"use server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put, del } from "@vercel/blob";
import { z } from "zod";
import { db, clients, companies, invoices, invoiceItems, payments, documents, invoiceSeries, expenses } from "./db";
import { requireTenant } from "./auth";
import { toCents, today, addDays } from "./money";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function getCompany(tenantId: string) {
  const [c] = await db.select().from(companies).where(eq(companies.tenantId, tenantId));
  if (c) return c;
  const [n] = await db.insert(companies).values({ tenantId }).onConflictDoNothing().returning();
  return n ?? (await db.select().from(companies).where(eq(companies.tenantId, tenantId)))[0];
}

/* ---------- settings ---------- */
export async function saveSettings(f: FormData) {
  const { tenantId } = await requireTenant();
  await getCompany(tenantId);
  await db.update(companies).set({
    name: s(f, "name"), address: s(f, "address"), email: s(f, "email"), phone: s(f, "phone"),
    taxId: s(f, "taxId"), bankDetails: s(f, "bankDetails"),
    accountHolder: s(f, "accountHolder"), iban: s(f, "iban").replace(/\s+/g, "").toUpperCase(),
    bic: s(f, "bic").replace(/\s+/g, "").toUpperCase(), paymentLink: /^https:\/\//.test(s(f, "paymentLink")) ? s(f, "paymentLink") : "",
    showPaymentQr: f.get("showPaymentQr") === "on", logoUrl: s(f, "logoUrl"),
    currency: s(f, "currency") || "EUR", defaultTaxRate: String(Number(s(f, "defaultTaxRate")) || 0),
    hourlyRateCents: toCents(s(f, "hourlyRate")), travelRateCents: toCents(s(f, "travelRate")),
    paymentTermsDays: Number(s(f, "paymentTermsDays")) || 0, footerNote: s(f, "footerNote"),
    updatedAt: new Date(),
  }).where(eq(companies.tenantId, tenantId));
  revalidatePath("/settings");
}

/* ---------- clients ---------- */
export async function saveClient(f: FormData) {
  const { tenantId } = await requireTenant();
  const name = s(f, "name");
  if (!name) throw new Error("Client name is required");
  const data = { name, contactName: s(f, "contactName"), email: s(f, "email"), phone: s(f, "phone"),
    address: s(f, "address"), taxId: s(f, "taxId"), notes: s(f, "notes"),
    defaultSeriesId: /^[0-9a-f-]{36}$/.test(s(f, "defaultSeriesId")) ? s(f, "defaultSeriesId") : null,
    pricingMode: z.enum(["hourly", "half_full", "full_day", "task"]).catch("half_full").parse(s(f, "pricingMode")),
    taskRateCents: toCents(s(f, "taskRate")),
    halfDayRateCents: toCents(s(f, "halfDayRate")), fullDayRateCents: toCents(s(f, "fullDayRate")),
    halfDayMaxHours: String(Number(s(f, "halfDayMaxHours")) || 4), hourlyRateCents: toCents(s(f, "hourlyRate")),
    travelFlatCents: toCents(s(f, "travelFlat")) };
  const id = s(f, "id");
  if (id) await db.update(clients).set(data).where(and(eq(clients.id, id), eq(clients.tenantId, tenantId)));
  else await db.insert(clients).values({ ...data, tenantId });
  revalidatePath("/clients");
  redirect("/clients");
}

export async function deleteClient(f: FormData) {
  const { tenantId } = await requireTenant();
  await db.delete(clients).where(and(eq(clients.id, s(f, "id")), eq(clients.tenantId, tenantId)));
  revalidatePath("/clients");
}

/* ---------- invoices ---------- */
const itemSchema = z.object({ description: z.string().min(1), quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number(), taxRate: z.coerce.number().min(0).max(100) });

export async function saveInvoice(f: FormData) {
  const { tenantId, userId } = await requireTenant();
  const items = z.array(itemSchema).min(1).parse(JSON.parse(s(f, "items") || "[]"));
  const clientId = s(f, "clientId");
  const [client] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)));
  if (!client) throw new Error("Choose a client");

  const company = await getCompany(tenantId);
  const lines = items.map((it, i) => {
    const unit = toCents(it.unitPrice);
    const net = Math.round(unit * it.quantity);
    return { position: i, description: it.description, quantity: String(it.quantity), unitPriceCents: unit,
      taxRate: String(it.taxRate), lineTotalCents: net, tax: Math.round(net * it.taxRate / 100) };
  });
  const subtotal = lines.reduce((a, l) => a + l.lineTotalCents, 0);
  const tax = lines.reduce((a, l) => a + l.tax, 0);
  const issueDate = s(f, "issueDate") || today();
  const dueDate = s(f, "dueDate") || addDays(issueDate, company.paymentTermsDays);
  const base = { clientId, issueDate, dueDate, currency: company.currency, notes: s(f, "notes"), supplyDates: s(f, "supplyDates"),
    subtotalCents: subtotal, taxCents: tax, totalCents: subtotal + tax, updatedAt: new Date() };

  let id = s(f, "id");
  if (id) {
    const [own] = await db.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)));
    if (!own) throw new Error("Not found");
    await db.update(invoices).set(base).where(eq(invoices.id, id));
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
  } else {
    const number = await allocateNumber(tenantId, s(f, "seriesId"), s(f, "numberDate") || issueDate, s(f, "manualNumber"));
    [{ id }] = await db.insert(invoices).values({ ...base, tenantId, number, createdBy: userId }).returning({ id: invoices.id });
  }
  if (s(f, "id") && s(f, "manualNumber")) {
    const want = s(f, "manualNumber");
    const [clash] = await db.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.tenantId, tenantId), eq(invoices.number, want)));
    if (clash && clash.id !== id) throw new Error(`Invoice number ${want} is already used`);
    await db.update(invoices).set({ number: want }).where(eq(invoices.id, id));
  }
  await db.insert(invoiceItems).values(lines.map(({ tax: _t, ...l }) => ({ ...l, invoiceId: id })));
  const expenseIds = s(f, "expenseIds").split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x));
  for (const eid of expenseIds)
    await db.update(expenses).set({ invoiceId: id })
      .where(and(eq(expenses.id, eid), eq(expenses.tenantId, tenantId), eq(expenses.clientId, clientId), isNull(expenses.invoiceId)));
  const svrVisits = z.array(z.object({ docId: z.string().uuid(), date: z.string().nullable(), hours: z.number() }))
    .catch([]).parse(JSON.parse(s(f, "svrVisits") || "[]"));
  for (const v of svrVisits)
    await db.update(documents).set({ invoiceId: id, clientId,
      visitDate: v.date && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : null, visitHours: v.hours ? String(v.hours) : null })
      .where(and(eq(documents.id, v.docId), eq(documents.tenantId, tenantId)));
  revalidatePath("/invoices");
  redirect(`/invoices/${id}`);
}

export async function setInvoiceStatus(f: FormData) {
  const { tenantId } = await requireTenant();
  const status = z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).parse(s(f, "status"));
  const id = s(f, "id");
  await db.update(invoices).set({ status, updatedAt: new Date() }).where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)));
  revalidatePath(`/invoices/${id}`);
}

export async function deleteInvoice(f: FormData) {
  const { tenantId } = await requireTenant();
  await db.delete(invoices).where(and(eq(invoices.id, s(f, "id")), eq(invoices.tenantId, tenantId)));
  revalidatePath("/invoices");
  redirect("/invoices");
}

export async function addPayment(f: FormData) {
  const { tenantId } = await requireTenant();
  const invoiceId = s(f, "invoiceId");
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));
  if (!inv) throw new Error("Not found");
  const amount = toCents(s(f, "amount"));
  if (amount <= 0) throw new Error("Amount must be positive");
  await db.insert(payments).values({ tenantId, invoiceId, amountCents: amount, paidOn: s(f, "paidOn") || today(),
    method: s(f, "method"), reference: s(f, "reference") });
  const [{ paid }] = await db.select({ paid: sql<number>`coalesce(sum(${payments.amountCents}),0)::int` })
    .from(payments).where(eq(payments.invoiceId, invoiceId));
  if (paid >= inv.totalCents) await db.update(invoices).set({ status: "paid" }).where(eq(invoices.id, invoiceId));
  revalidatePath(`/invoices/${invoiceId}`);
}

/* ---------- documents ---------- */
const MAX_BYTES = 20 * 1024 * 1024;
export async function uploadDocument(f: FormData) {
  const { tenantId, userId } = await requireTenant();
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file");
  if (file.size > MAX_BYTES) throw new Error("File is larger than 20 MB");
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  const blob = await put(`${tenantId}/${crypto.randomUUID()}-${safe}`, file, { access: "private", contentType: file.type || "application/octet-stream" });
  const ref = async (table: typeof clients | typeof invoices, id: string) => {
    if (!id) return null;
    const [r] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.tenantId, tenantId)));
    return r?.id ?? null;
  };
  await db.insert(documents).values({ tenantId, uploadedBy: userId, title: s(f, "title") || file.name, fileName: file.name,
    contentType: file.type || "application/octet-stream", sizeBytes: file.size, blobPath: blob.pathname,
    category: s(f, "category") || "general", tags: s(f, "tags"),
    clientId: await ref(clients, s(f, "clientId")), invoiceId: await ref(invoices, s(f, "invoiceId")) });
  revalidatePath("/documents");
}

export async function deleteDocument(f: FormData) {
  const { tenantId } = await requireTenant();
  const [d] = await db.delete(documents).where(and(eq(documents.id, s(f, "id")), eq(documents.tenantId, tenantId))).returning();
  if (d) await del(d.blobPath).catch(() => {});
  revalidatePath("/documents");
}

/* ---------- invoice number series ---------- */
export async function listSeries(tenantId: string) {
  let list = await db.select().from(invoiceSeries).where(eq(invoiceSeries.tenantId, tenantId)).orderBy(invoiceSeries.prefix);
  if (!list.length) {
    const c = await getCompany(tenantId);
    await db.insert(invoiceSeries).values({ tenantId, prefix: c.invoicePrefix || "#", mode: "sequence", nextNumber: c.nextInvoiceNumber, isDefault: true }).onConflictDoNothing();
    list = await db.select().from(invoiceSeries).where(eq(invoiceSeries.tenantId, tenantId));
  }
  return list;
}

const ddmmyyyy = (d: string) => { const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) throw new Error("Pick a valid date for the invoice number"); return `${m[3]}${m[2]}${m[1]}`; };

async function numberTaken(tenantId: string, number: string) {
  const [r] = await db.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.tenantId, tenantId), eq(invoices.number, number)));
  return !!r;
}

/** Manual number wins; otherwise the chosen (or default) series decides. */
async function allocateNumber(tenantId: string, seriesId: string, date: string, manual: string) {
  if (manual) {
    if (await numberTaken(tenantId, manual)) throw new Error(`Invoice number ${manual} is already used`);
    return manual;
  }
  const list = await listSeries(tenantId);
  const series = list.find((x) => x.id === seriesId) ?? list.find((x) => x.isDefault) ?? list[0];
  if (series.mode === "date") {
    const base = `${series.prefix}${ddmmyyyy(date)}`;
    for (let n = 1; n < 100; n++) {
      const candidate = n === 1 ? base : `${base}-${n}`;
      if (!(await numberTaken(tenantId, candidate))) return candidate;
    }
    throw new Error("Too many invoices for this date");
  }
  for (;;) {
    const [{ n }] = await db.update(invoiceSeries).set({ nextNumber: sql`${invoiceSeries.nextNumber} + 1` })
      .where(eq(invoiceSeries.id, series.id)).returning({ n: sql<number>`${invoiceSeries.nextNumber} - 1` });
    const candidate = `${series.prefix}${n}`;
    if (!(await numberTaken(tenantId, candidate))) return candidate; // skip numbers already used by hand
  }
}

/** Preview shown in the form; does not reserve anything. */
export async function previewNumber(seriesId: string, date: string) {
  const { tenantId } = await requireTenant();
  const list = await listSeries(tenantId);
  const sr = list.find((x) => x.id === seriesId) ?? list.find((x) => x.isDefault) ?? list[0];
  if (sr.mode === "date") { try { return `${sr.prefix}${ddmmyyyy(date)}`; } catch { return `${sr.prefix}DDMMYYYY`; } }
  return `${sr.prefix}${sr.nextNumber}`;
}

export async function saveSeries(f: FormData) {
  const { tenantId } = await requireTenant();
  const prefix = s(f, "prefix");
  if (!/^[\w#\-\/.]{0,20}$/.test(prefix)) throw new Error("Prefix: up to 20 letters, digits or # - / _ .");
  const mode = z.enum(["sequence", "date"]).parse(s(f, "mode"));
  const nextNumber = Math.max(1, Number(s(f, "nextNumber")) || 1);
  const isDefault = f.get("isDefault") === "on";
  if (isDefault) await db.update(invoiceSeries).set({ isDefault: false }).where(eq(invoiceSeries.tenantId, tenantId));
  const id = s(f, "id");
  if (id) await db.update(invoiceSeries).set({ prefix, mode, nextNumber, ...(isDefault ? { isDefault } : {}) })
    .where(and(eq(invoiceSeries.id, id), eq(invoiceSeries.tenantId, tenantId)));
  else await db.insert(invoiceSeries).values({ tenantId, prefix, mode, nextNumber, isDefault });
  revalidatePath("/settings");
}

export async function deleteSeries(f: FormData) {
  const { tenantId } = await requireTenant();
  const list = await listSeries(tenantId);
  if (list.length <= 1) throw new Error("Keep at least one numbering series");
  const id = s(f, "id");
  await db.delete(invoiceSeries).where(and(eq(invoiceSeries.id, id), eq(invoiceSeries.tenantId, tenantId)));
  await db.update(clients).set({ defaultSeriesId: null }).where(and(eq(clients.tenantId, tenantId), eq(clients.defaultSeriesId, id)));
  if (list.find((x) => x.id === id)?.isDefault) {
    const next = list.find((x) => x.id !== id)!;
    await db.update(invoiceSeries).set({ isDefault: true }).where(eq(invoiceSeries.id, next.id));
  }
  revalidatePath("/settings");
}
