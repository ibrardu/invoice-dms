"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { z } from "zod";
import { db, expenses, clients, documents } from "./db";
import { requireTenant } from "./auth";
import { toCents, today } from "./money";
import { EXPENSE_CATEGORIES } from "./expense-categories";

const CAT_IDS = EXPENSE_CATEGORIES.map(([k]) => k) as [string, ...string[]];
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveExpense(f: FormData) {
  const { tenantId, userId } = await requireTenant();
  const amountCents = toCents(s(f, "amount"));
  if (amountCents <= 0) throw new Error("Enter the amount from the receipt");
  const description = s(f, "description");
  if (!description) throw new Error("Describe the expense, e.g. Coffee on site");
  const spentOn = /^\d{4}-\d{2}-\d{2}$/.test(s(f, "spentOn")) ? s(f, "spentOn") : today();
  const clientIdRaw = s(f, "clientId");
  let clientId: string | null = null;
  if (clientIdRaw) {
    const [c] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientIdRaw), eq(clients.tenantId, tenantId)));
    clientId = c?.id ?? null;
  }
  const data = {
    spentOn, description, amountCents, clientId,
    category: z.enum(CAT_IDS).catch("other").parse(s(f, "category")),
    vendor: s(f, "vendor"), currency: (s(f, "currency") || "EUR").toUpperCase().slice(0, 3),
    vatRate: String(Math.min(100, Math.max(0, Number(s(f, "vatRate")) || 0))),
    paymentMethod: s(f, "paymentMethod"), notes: s(f, "notes"),
    billable: f.get("billable") === "on" && !!clientId,
  };

  // Optional receipt: stored privately in Documents as category "receipt".
  const file = f.get("receipt");
  let receiptDocId: string | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) throw new Error("Receipt is larger than 10 MB");
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
    const blob = await put(`${tenantId}/${crypto.randomUUID()}-${safe}`, file, { access: "private", contentType: file.type || "application/octet-stream" });
    const [doc] = await db.insert(documents).values({ tenantId, uploadedBy: userId, title: `Receipt ${spentOn} ${description}`.slice(0, 200),
      fileName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size, blobPath: blob.pathname,
      category: "receipt", tags: [data.vendor, data.category].filter(Boolean).join(", "), clientId }).returning({ id: documents.id });
    receiptDocId = doc.id;
  }

  const id = s(f, "id");
  if (id) {
    await db.update(expenses).set({ ...data, ...(receiptDocId ? { receiptDocId } : {}) })
      .where(and(eq(expenses.id, id), eq(expenses.tenantId, tenantId)));
  } else {
    await db.insert(expenses).values({ ...data, tenantId, createdBy: userId, receiptDocId: receiptDocId ?? null });
  }
  revalidatePath("/expenses");
  revalidatePath("/");
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
