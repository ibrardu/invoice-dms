import { asc, eq } from "drizzle-orm";
import { db, clients } from "@/lib/db";
import { requireTenant } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Export" };
const TYPES = [
  ["invoices", "Invoices", "One row per invoice: number, dates, client, VAT ID, net, tax, gross, paid, balance"],
  ["items", "Invoice lines", "Every line item with quantity, price, tax rate"],
  ["payments", "Payments", "Payments received, by payment date"],
  ["expenses", "Expenses", "Everything you spent: date, category, gross, VAT, net, billable and which invoice charged it"],
  ["visits", "Site visits", "SVRs with visit date, hours, and which invoice billed them"],
  ["clients", "Clients", "Client list with pricing"],
] as const;

export default async function Export({ searchParams }: { searchParams: Promise<{ year?: string; client?: string }> }) {
  const { tenantId } = await requireTenant();
  const sp = await searchParams;
  const list = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.tenantId, tenantId)).orderBy(asc(clients.name));
  const y = new Date().getUTCFullYear();
  return (
    <>
      <h1>Export CSV</h1>
      {TYPES.map(([t, label, desc]) =>
        <form key={t} action="/api/export" className="card row" style={{ alignItems: "end" }}>
          <input type="hidden" name="type" value={t} />
          <div style={{ flex: 1, minWidth: 220 }}><b>{label}</b><div className="muted">{desc}</div></div>
          {t !== "clients" && <div><label>Year</label><select name="year" defaultValue={sp.year ?? String(y)} style={{ width: 110 }}>
            <option value="">All</option>{Array.from({ length: 6 }, (_, i) => y - i).map((v) => <option key={v}>{v}</option>)}</select></div>}
          <div><label>Client</label><select name="client" defaultValue={sp.client ?? ""} style={{ width: 200 }}><option value="">All</option>
            {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label>Format</label><select name="format" style={{ width: 210 }}>
            <option value="de">Excel Germany (; and 1,50)</option><option value="intl">Standard (, and 1.50)</option></select></div>
          <button>Download</button>
        </form>)}
    </>
  );
}
