"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put, del } from "@vercel/blob";
import { z } from "zod";
import { db, clients, companies, invoices, invoiceItems, payments, documents } from "./db";
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
    taxId: s(f, "taxId"), bankDetails: s(f, "bankDetails"), logoUrl: s(f, "logoUrl"),
    currency: s(f, "currency") || "EUR", defaultTaxRate: String(Number(s(f, "defaultTaxRate")) || 0),
    hourlyRateCents: toCents(s(f, "hourlyRate")), travelRateCents: toCents(s(f, "travelRate")),
    paymentTermsDays: Number(s(f, "paymentTermsDays")) || 0, invoicePrefix: s(f, "invoicePrefix"),
    nextInvoiceNumber: Math.max(1, Number(s(f, "nextInvoiceNumber")) || 1), footerNote: s(f, "footerNote"),
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
    address: s(f, "address"), taxId: s(f, "taxId"), notes: s(f, "notes") };
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
    // Atomically reserve the next invoice number.
    const [{ n }] = await db.update(companies)
      .set({ nextInvoiceNumber: sql`${companies.nextInvoiceNumber} + 1` })
      .where(eq(companies.tenantId, tenantId))
      .returning({ n: sql<number>`${companies.nextInvoiceNumber} - 1` });
    const number = `${company.invoicePrefix}${n}`;
    [{ id }] = await db.insert(invoices).values({ ...base, tenantId, number, createdBy: userId }).returning({ id: invoices.id });
  }
  await db.insert(invoiceItems).values(lines.map(({ tax: _t, ...l }) => ({ ...l, invoiceId: id })));
  const svrDocId = s(f, "svrDocId");
  if (svrDocId) await db.update(documents).set({ invoiceId: id, clientId })
    .where(and(eq(documents.id, svrDocId), eq(documents.tenantId, tenantId)));
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
