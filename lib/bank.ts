"use server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { db, bankConnections, bankTransactions, invoices, clients, payments } from "./db";
import { requireTenant } from "./auth";
import { startAuth, fetchTransactions, deleteSession } from "./enablebanking";
import { matchPayment } from "./bank-match";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Step 1: send the user to their bank's own login (PSD2 consent). */
export async function connectBank(f: FormData) {
  await requireTenant();
  const bank = s(f, "bank"), country = s(f, "country").toUpperCase();
  if (!bank || !/^[A-Z]{2}$/.test(country)) throw new Error("Choose a bank");
  const state = crypto.randomUUID();
  (await cookies()).set("bank_state", JSON.stringify({ state, bank, country }), { httpOnly: true, secure: true, sameSite: "lax", maxAge: 900, path: "/" });
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  redirect(await startAuth(bank, country, state, `${origin}/api/bank/callback`));
}

export async function disconnectBank(f: FormData) {
  const { tenantId } = await requireTenant();
  const [c] = await db.delete(bankConnections).where(and(eq(bankConnections.id, s(f, "id")), eq(bankConnections.tenantId, tenantId))).returning();
  if (c) await deleteSession(c.sessionId);
  revalidatePath("/bank");
}

/** Pulls new transactions (last 90 days, or since the last sync) and suggests invoice matches for money in. */
export async function syncBank() {
  const { tenantId } = await requireTenant();
  const conns = await db.select().from(bankConnections).where(eq(bankConnections.tenantId, tenantId));
  let added = 0;
  for (const c of conns) {
    const since = new Date(Math.max(Date.now() - 90 * 86400000, (c.lastSyncAt?.getTime() ?? 0) - 7 * 86400000)).toISOString().slice(0, 10);
    const accounts = JSON.parse(c.accounts) as { uid: string }[];
    for (const a of accounts) {
      const txs = await fetchTransactions(a.uid, since);
      if (!txs.length) continue;
      const res = await db.insert(bankTransactions).values(txs.map((t) => ({ ...t, tenantId, connectionId: c.id, accountUid: a.uid,
        status: t.amountCents > 0 ? "new" : "ignored" }))).onConflictDoNothing().returning({ id: bankTransactions.id });
      added += res.length;
    }
    await db.update(bankConnections).set({ lastSyncAt: new Date() }).where(eq(bankConnections.id, c.id));
  }
  await suggestMatches(tenantId);
  revalidatePath("/bank");
  return added;
}

async function openInvoices(tenantId: string) {
  const paid = sql<number>`coalesce((select sum(p.amount_cents) from payments p where p.invoice_id = ${invoices.id}),0)::int`;
  const rows = await db.select({ id: invoices.id, number: invoices.number, total: invoices.totalCents, paid, currency: invoices.currency, client: clients.name })
    .from(invoices).innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(invoices.tenantId, tenantId), inArray(invoices.status, ["sent", "overdue", "draft"])));
  return rows.map((r) => ({ id: r.id, number: r.number, balanceCents: r.total - r.paid, currency: r.currency, client: r.client }));
}

async function suggestMatches(tenantId: string) {
  const open = await openInvoices(tenantId);
  const fresh = await db.select().from(bankTransactions).where(and(eq(bankTransactions.tenantId, tenantId), eq(bankTransactions.status, "new")));
  for (const t of fresh) {
    const m = matchPayment(t, open);
    if (m) await db.update(bankTransactions).set({ status: "suggested", invoiceId: m.invoiceId, matchReason: m.reason, matchExact: m.exact }).where(eq(bankTransactions.id, t.id));
  }
}

/** Records the bank payment on the invoice. Safe to repeat: a matched transaction is never recorded twice. */
async function record(tenantId: string, txId: string, invoiceId: string) {
  const [t] = await db.select().from(bankTransactions).where(and(eq(bankTransactions.id, txId), eq(bankTransactions.tenantId, tenantId)));
  if (!t || t.status === "matched" || t.amountCents <= 0) return false;
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));
  if (!inv) return false;
  const [p] = await db.insert(payments).values({ tenantId, invoiceId, amountCents: t.amountCents, paidOn: t.bookingDate,
    method: "Bank transfer", reference: [t.counterparty, t.reference].filter(Boolean).join(" · ").slice(0, 200) }).returning({ id: payments.id });
  await db.update(bankTransactions).set({ status: "matched", invoiceId, paymentId: p.id }).where(eq(bankTransactions.id, txId));
  const [{ paid }] = await db.select({ paid: sql<number>`coalesce(sum(${payments.amountCents}),0)::int` }).from(payments).where(eq(payments.invoiceId, invoiceId));
  if (paid >= inv.totalCents) await db.update(invoices).set({ status: "paid", updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
  return true;
}

export async function confirmMatch(f: FormData) {
  const { tenantId } = await requireTenant();
  await record(tenantId, s(f, "txId"), s(f, "invoiceId"));
  revalidatePath("/bank"); revalidatePath("/");
}

export async function confirmAllExact() {
  const { tenantId } = await requireTenant();
  const exact = await db.select({ id: bankTransactions.id, invoiceId: bankTransactions.invoiceId }).from(bankTransactions)
    .where(and(eq(bankTransactions.tenantId, tenantId), eq(bankTransactions.status, "suggested"), eq(bankTransactions.matchExact, true)));
  for (const t of exact) if (t.invoiceId) await record(tenantId, t.id, t.invoiceId);
  revalidatePath("/bank"); revalidatePath("/");
}

export async function ignoreTx(f: FormData) {
  const { tenantId } = await requireTenant();
  await db.update(bankTransactions).set({ status: "ignored" }).where(and(eq(bankTransactions.id, s(f, "txId")), eq(bankTransactions.tenantId, tenantId)));
  revalidatePath("/bank");
}

export async function latestTx(tenantId: string) {
  return db.select().from(bankTransactions).where(eq(bankTransactions.tenantId, tenantId)).orderBy(desc(bankTransactions.bookingDate)).limit(200);
}
