import Link from "next/link";
import { desc, eq, sql, and } from "drizzle-orm";
import { db, invoices, clients, documents } from "@/lib/db";
import { requireTenant } from "@/lib/auth";
import { fmt } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { tenantId } = await requireTenant();
  const sum = (status: string) => db.select({ v: sql<number>`coalesce(sum(${invoices.totalCents}),0)::int`, n: sql<number>`count(*)::int` })
    .from(invoices).where(and(eq(invoices.tenantId, tenantId), sql`${invoices.status} = ${status}`));
  const [[open], [overdue], [paid], [{ c }], [{ d }], recent] = await Promise.all([
    sum("sent"), sum("overdue"), sum("paid"),
    db.select({ c: sql<number>`count(*)::int` }).from(clients).where(eq(clients.tenantId, tenantId)),
    db.select({ d: sql<number>`count(*)::int` }).from(documents).where(eq(documents.tenantId, tenantId)),
    db.select({ id: invoices.id, number: invoices.number, status: invoices.status, total: invoices.totalCents, currency: invoices.currency, client: clients.name, due: invoices.dueDate })
      .from(invoices).innerJoin(clients, eq(clients.id, invoices.clientId)).where(eq(invoices.tenantId, tenantId)).orderBy(desc(invoices.createdAt)).limit(8),
  ]);
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}><h1>Dashboard</h1><Link className="btn" href="/invoices/new">New invoice</Link></div>
      <div className="stats">
        <div className="card stat"><span className="muted">Outstanding ({open.n})</span><b>{fmt(open.v)}</b></div>
        <div className="card stat"><span className="muted">Overdue ({overdue.n})</span><b>{fmt(overdue.v)}</b></div>
        <div className="card stat"><span className="muted">Paid ({paid.n})</span><b>{fmt(paid.v)}</b></div>
        <div className="card stat"><span className="muted">Clients / Documents</span><b>{c} / {d}</b></div>
      </div>
      <div className="card"><h2>Recent invoices</h2>
        <table><thead><tr><th>Number</th><th>Client</th><th>Due</th><th>Status</th><th className="r">Total</th></tr></thead>
          <tbody>{recent.map((i) => <tr key={i.id}><td><Link href={`/invoices/${i.id}`}>{i.number}</Link></td><td>{i.client}</td><td>{i.due}</td>
            <td><span className={`badge ${i.status}`}>{i.status}</span></td><td className="r">{fmt(i.total, i.currency)}</td></tr>)}</tbody></table>
      </div>
    </>
  );
}
