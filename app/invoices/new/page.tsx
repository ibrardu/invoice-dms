import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db, clients, invoices, invoiceItems } from "@/lib/db";
import { requireTenant } from "@/lib/auth";
import { getCompany } from "@/lib/actions";
import InvoiceForm from "../InvoiceForm";

export const dynamic = "force-dynamic";

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { tenantId } = await requireTenant();
  const { id } = await searchParams;
  const [company, list] = await Promise.all([getCompany(tenantId),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.tenantId, tenantId)).orderBy(asc(clients.name))]);
  let initial;
  if (id) {
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)));
    if (inv) {
      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.position));
      initial = { id, clientId: inv.clientId, issueDate: inv.issueDate, dueDate: inv.dueDate, notes: inv.notes, supplyDates: inv.supplyDates,
        items: items.map((it) => ({ description: it.description, quantity: Number(it.quantity), unitPrice: it.unitPriceCents / 100, taxRate: Number(it.taxRate) })) };
    }
  }
  if (!list.length) return <div className="card">Add a client first. <Link href="/clients">Go to clients</Link></div>;
  return <><h1>{initial ? "Edit invoice" : "New invoice"}</h1>
    <InvoiceForm clients={list} currency={company.currency} defaultTax={Number(company.defaultTaxRate)} initial={initial} /></>;
}
