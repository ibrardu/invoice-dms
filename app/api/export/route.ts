import { and, asc, eq, gte, lt, ne } from "drizzle-orm";
import { db, invoices, invoiceItems, clients, payments, documents } from "@/lib/db";
import { requireTenant } from "@/lib/auth";

type Row = Record<string, string | number | null>;

function toCsv(rows: Row[], de: boolean) {
  if (!rows.length) return "";
  const sep = de ? ";" : ",";
  const cell = (v: Row[string]) => {
    let s = v == null ? "" : typeof v === "number" ? (de ? String(v).replace(".", ",") : String(v)) : String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = `'${s}`; // block spreadsheet formula injection
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const keys = Object.keys(rows[0]);
  return [keys.join(sep), ...rows.map((r) => keys.map((k) => cell(r[k])).join(sep))].join("\r\n");
}

const eur = (c: number) => Math.round(c) / 100;

export async function GET(req: Request) {
  const { tenantId } = await requireTenant();
  const u = new URL(req.url);
  const type = u.searchParams.get("type") ?? "invoices";
  const year = Number(u.searchParams.get("year")) || null;
  const clientId = /^[0-9a-f-]{36}$/.test(u.searchParams.get("client") ?? "") ? u.searchParams.get("client")! : null;
  const de = u.searchParams.get("format") === "de";
  const range = (col: typeof invoices.issueDate | typeof payments.paidOn) =>
    year ? and(gte(col, `${year}-01-01`), lt(col, `${year + 1}-01-01`)) : undefined;
  const invWhere = and(eq(invoices.tenantId, tenantId), range(invoices.issueDate), clientId ? eq(invoices.clientId, clientId) : undefined);

  let rows: Row[] = [];
  if (type === "invoices") {
    const list = await db.select({ i: invoices, c: clients }).from(invoices).innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(invWhere).orderBy(asc(invoices.issueDate));
    const paid = await db.select({ id: payments.invoiceId, a: payments.amountCents }).from(payments).where(eq(payments.tenantId, tenantId));
    rows = list.map(({ i, c }) => {
      const p = paid.filter((x) => x.id === i.id).reduce((s, x) => s + x.a, 0);
      return { invoice_number: i.number, issue_date: i.issueDate, supply_dates: i.supplyDates, due_date: i.dueDate, status: i.status,
        client: c.name, client_vat_id: c.taxId, client_country_address: c.address.replace(/\n/g, ", "), currency: i.currency,
        net: eur(i.subtotalCents), tax: eur(i.taxCents), gross: eur(i.totalCents), paid: eur(p), balance: eur(i.totalCents - p) };
    });
  } else if (type === "items") {
    const list = await db.select({ i: invoices, it: invoiceItems, c: clients.name }).from(invoiceItems)
      .innerJoin(invoices, eq(invoices.id, invoiceItems.invoiceId)).innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(and(invWhere, ne(invoices.status, "cancelled"))).orderBy(asc(invoices.issueDate), asc(invoiceItems.position));
    rows = list.map(({ i, it, c }) => ({ invoice_number: i.number, issue_date: i.issueDate, client: c, description: it.description,
      quantity: Number(it.quantity), unit_price: eur(it.unitPriceCents), tax_rate: Number(it.taxRate), net: eur(it.lineTotalCents),
      tax: eur(Math.round(it.lineTotalCents * Number(it.taxRate) / 100)), currency: i.currency }));
  } else if (type === "payments") {
    const list = await db.select({ p: payments, n: invoices.number, c: clients.name, cur: invoices.currency }).from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId)).innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(and(eq(payments.tenantId, tenantId), range(payments.paidOn), clientId ? eq(invoices.clientId, clientId) : undefined)).orderBy(asc(payments.paidOn));
    rows = list.map(({ p, n, c, cur }) => ({ paid_on: p.paidOn, invoice_number: n, client: c, amount: eur(p.amountCents), currency: cur, method: p.method, reference: p.reference }));
  } else if (type === "clients") {
    const list = await db.select().from(clients).where(and(eq(clients.tenantId, tenantId), clientId ? eq(clients.id, clientId) : undefined)).orderBy(asc(clients.name));
    rows = list.map((c) => ({ name: c.name, contact: c.contactName, email: c.email, phone: c.phone, vat_id: c.taxId, address: c.address.replace(/\n/g, ", "),
      pricing_mode: c.pricingMode, half_day: eur(c.halfDayRateCents), full_day: eur(c.fullDayRateCents), hourly: eur(c.hourlyRateCents), task: eur(c.taskRateCents) }));
  } else if (type === "visits") {
    const list = await db.select({ d: documents, c: clients.name, n: invoices.number }).from(documents)
      .leftJoin(clients, eq(clients.id, documents.clientId)).leftJoin(invoices, eq(invoices.id, documents.invoiceId))
      .where(and(eq(documents.tenantId, tenantId), eq(documents.category, "svr"),
        year ? and(gte(documents.visitDate, `${year}-01-01`), lt(documents.visitDate, `${year + 1}-01-01`)) : undefined,
        clientId ? eq(documents.clientId, clientId) : undefined)).orderBy(asc(documents.visitDate));
    rows = list.map(({ d, c, n }) => ({ visit_date: d.visitDate, hours: d.visitHours ? Number(d.visitHours) : null, client: c, tags: d.tags, file: d.fileName, invoice_number: n ?? "not invoiced" }));
  } else return new Response("Unknown export type", { status: 400 });

  const name = `${type}${year ? `-${year}` : ""}.csv`;
  return new Response("﻿" + toCsv(rows, de), { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" } });
}
