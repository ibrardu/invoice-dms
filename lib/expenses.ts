"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { z } from "zod";
import { db, expenses, clients, documents } from "./db";
import { requireTenant } from "./auth";
import { today } from "./money";
import { transforms, validateExpense } from "./field-maps";
import { EXPENSE_CATEGORIES } from "./expense-categories";

const CAT_IDS = EXPENSE_CATEGORIES.map(([k]) => k) as [string, ...string[]];
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export type ExpenseFormState = { ok: boolean; errors: Record<string, string>; message?: string; duplicateOf?: string } | null;

/** Validates, de-duplicates and saves. Returns field-level errors instead of throwing. */
export async function saveExpense(_: ExpenseFormState, f: FormData): Promise<ExpenseFormState> {
  const { tenantId, userId } = await requireTenant();
  const raw: Record<string, string> = {};
  for (const k of ["spentOn", "amount", "description", "vatRate", "currency", "billable", "clientId", "category", "vendor", "paymentMethod", "notes"]) raw[k] = s(f, k);
  const errors = validateExpense(raw, today());
  if (Object.keys(errors).length) return { ok: false, errors, message: "Please fix the marked fields" };

  const id = s(f, "id");
  const submissionKey = /^[\w-]{8,64}$/.test(s(f, "submissionKey")) ? s(f, "submissionKey") : null;
  // Idempotency: the same rendered form submitted twice (double click, retry) saves once.
  if (!id && submissionKey) {
    const [done] = await db.select({ id: expenses.id }).from(expenses).where(and(eq(expenses.tenantId, tenantId), eq(expenses.submissionKey, submissionKey)));
    if (done) return { ok: true, errors: {}, message: "Already saved" };
  }

  const spentOn = transforms.date(raw.spentOn)!;
  const amountCents = Math.round(Number(transforms.amount(raw.amount)) * 100);
  let clientId: string | null = null;
  if (raw.clientId) {
    const [c] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, raw.clientId), eq(clients.tenantId, tenantId)));
    if (!c) return { ok: false, errors: { clientId: "Client not found" } };
    clientId = c.id;
  }

  // Likely duplicate: same day and amount already recorded. Ask once; a second submit confirms.
  if (!id && f.get("confirmDuplicate") !== "on") {
    const [dup] = await db.select({ id: expenses.id, description: expenses.description }).from(expenses)
      .where(and(eq(expenses.tenantId, tenantId), eq(expenses.spentOn, spentOn), eq(expenses.amountCents, amountCents)));
    if (dup) return { ok: false, errors: {}, duplicateOf: dup.description,
      message: `You already recorded ${(amountCents / 100).toFixed(2)} on this date ("${dup.description}"). Tick "Save anyway" if this is a different expense.` };
  }

  const data = {
    spentOn, description: transforms.text(raw.description)!, amountCents, clientId,
    category: z.enum(CAT_IDS).catch("other").parse(raw.category),
    vendor: transforms.text(raw.vendor) ?? "", currency: transforms.currency(raw.currency) ?? "EUR",
    vatRate: transforms.vat(raw.vatRate) ?? "0",
    paymentMethod: transforms.text(raw.paymentMethod) ?? "", notes: raw.notes,
    billable: raw.billable === "on" && !!clientId,
  };

  const file = f.get("receipt");
  let receiptDocId: string | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) return { ok: false, errors: { receipt: "Receipt is larger than 10 MB" } };
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
    const blob = await put(`${tenantId}/${crypto.randomUUID()}-${safe}`, file, { access: "private", contentType: file.type || "application/octet-stream" });
    const [doc] = await db.insert(documents).values({ tenantId, uploadedBy: userId, title: `Receipt ${spentOn} ${data.description}`.slice(0, 200),
      fileName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size, blobPath: blob.pathname,
      category: "receipt", tags: [data.vendor, data.category].filter(Boolean).join(", "), clientId }).returning({ id: documents.id });
    receiptDocId = doc.id;
  }

  if (id) {
    await db.update(expenses).set({ ...data, ...(receiptDocId ? { receiptDocId } : {}) })
      .where(and(eq(expenses.id, id), eq(expenses.tenantId, tenantId)));
  } else {
    await db.insert(expenses).values({ ...data, tenantId, createdBy: userId, receiptDocId: receiptDocId ?? null, submissionKey })
      .onConflictDoNothing();
  }
  revalidatePath("/expenses");
  revalidatePath("/");
  return { ok: true, errors: {}, message: id ? "Expense updated" : "Expense added" };
}

export async function deleteExpense(f: FormData) {
  const { tenantId } = await requireTenant();
  const [e] = await db.delete(expenses).where(and(eq(expenses.id, s(f, "id")), eq(expenses.tenantId, tenantId))).returning();
  if (e?.receiptDocId) {
    const [d] = await db.delete(documents).where(and(eq(documents.id, e.receiptDocId), eq(documents.tenantId, tenantId))).returning();
    if (d) await del(d.blobPath).catch(() => {});
  }
  revalidatePath("/expenses");
  revalidatePath("/");
}
