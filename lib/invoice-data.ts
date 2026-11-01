import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, invoices, invoiceItems, clients, payments, documents } from "./db";
import { getCompany } from "./actions";

export async function loadInvoice(tenantId: string, id: string) {
  const [row] = await db.select({ inv: invoices, client: clients }).from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId)).where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)));
  if (!row) notFound();
  const [items, pays, docs, company] = await Promise.all([
    db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.position)),
    db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(asc(payments.paidOn)),
    db.select().from(documents).where(and(eq(documents.invoiceId, id), eq(documents.tenantId, tenantId))),
    getCompany(tenantId),
  ]);
  return { ...row, items, payments: pays, documents: docs, company };
}
