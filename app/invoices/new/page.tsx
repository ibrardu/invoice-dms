import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, clients, invoices, invoiceItems, expenses } from "@/lib/db";
import { requireTenant } from "@/lib/auth";
import { getCompany, listSeries } from "@/lib/actions";
import InvoiceForm from "../InvoiceForm";
import { visitsFromDocs } from "@/lib/svr";
import { llamaCloudEnabled } from "@/lib/llamacloud";

export const dynamic = "force-dynamic";

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ id?: string; svrs?: string; client?: string }> }) {
  const { tenantId } = await requireTenant();
  const { id, svrs, client } = await searchParams;
  const [company, list] = await Promise.all([getCompany(tenantId),
    db.select({ id: clients.id, name: clients.name, seriesId: clients.defaultSeriesId, vatTreatment: clients.vatTreatment }).from(clients).where(eq(clients.tenantId, tenantId)).orderBy(asc(clients.name))]);
  const series = (await listSeries(tenantId)).map((x) => ({ id: x.id, prefix: x.prefix, mode: x.mode, isDefault: x.isDefault }));
  let initial;
  if (id) {
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)));
    if (inv) {
      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.position));
      initial = { id, number: inv.number, clientId: inv.clientId, issueDate: inv.issueDate, dueDate: inv.dueDate, notes: inv.notes, supplyDates: inv.supplyDates,
        items: items.map((it) => ({ description: it.description, quantity: Number(it.quantity), unitPrice: it.unitPriceCents / 100, taxRate: Number(it.taxRate) })) };
    }
  }
  const preload = !id && svrs ? await visitsFromDocs(svrs.split(","), client ?? "") : null;
  const openExpenses = id ? [] : (await db.select({ id: expenses.id, clientId: expenses.clientId, spentOn: expenses.spentOn, description: expenses.description,
    amountCents: expenses.amountCents, currency: expenses.currency }).from(expenses)
    .where(and(eq(expenses.tenantId, tenantId), eq(expenses.billable, true), isNull(expenses.invoiceId))).orderBy(asc(expenses.spentOn)))
    .filter((e) => e.currency === company.currency);
  if (!list.length) return <div className="card">Add a client first. <Link href="/clients">Go to clients</Link></div>;
  return <><h1>{initial ? "Edit invoice" : "New invoice"}</h1>
    <InvoiceForm clients={list} currency={company.currency} defaultTax={Number(company.defaultTaxRate)} initial={initial} series={series} preload={preload} presetClient={client} openExpenses={openExpenses} stepwise={llamaCloudEnabled()} noVat={company.vatStatus === "kleinunternehmer"} /></>;
}
