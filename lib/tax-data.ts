import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, invoices, invoiceItems, clients, payments, expenses } from "./db";
import { computeTax, type Period, type Treatment } from "./tax";

/** Loads what computeTax needs for one tenant. Invoices are loaded wide (payments in the period can belong to older invoices). */
export async function loadTax(tenantId: string, p: Period, basis: "ist" | "soll", currency: string) {
  const invRows = await db.select({ id: invoices.id, number: invoices.number, issueDate: invoices.issueDate, status: invoices.status,
    totalCents: invoices.totalCents, currency: invoices.currency, client: clients.name, treatment: clients.vatTreatment })
    .from(invoices).innerJoin(clients, eq(clients.id, invoices.clientId)).where(eq(invoices.tenantId, tenantId));
  const own = invRows.filter((i) => i.currency === currency);
  const ids = own.map((i) => i.id);
  const [lines, pays, exps] = await Promise.all([
    ids.length ? db.select({ invoiceId: invoiceItems.invoiceId, net: invoiceItems.lineTotalCents, rate: invoiceItems.taxRate }).from(invoiceItems).where(inArray(invoiceItems.invoiceId, ids)) : [],
    db.select({ invoiceId: payments.invoiceId, paidOn: payments.paidOn, amountCents: payments.amountCents }).from(payments).where(eq(payments.tenantId, tenantId)),
    db.select({ spentOn: expenses.spentOn, grossCents: expenses.amountCents, vatRate: expenses.vatRate, currency: expenses.currency, category: expenses.category })
      .from(expenses).where(and(eq(expenses.tenantId, tenantId), eq(expenses.billable, false))),
  ]);
  const result = computeTax(p, basis,
    own.map((i) => ({ ...i, treatment: (i.treatment as Treatment) ?? "domestic",
      lines: lines.filter((l) => l.invoiceId === i.id).map((l) => ({ netCents: l.net, rate: Number(l.rate) })) })),
    pays, exps.map((e) => ({ ...e, vatRate: Number(e.vatRate) })), currency);
  const foreignInvoices = invRows.length - own.length;
  if (foreignInvoices) result.warnings.push(`${foreignInvoices} invoice(s) in another currency are not included`);
  return result;
}
