import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, invoices, clients } from "@/lib/db";
import { requireTenant } from "@/lib/auth";
import { fmt } from "@/lib/money";
import { markOverdue } from "@/lib/overdue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoices" };

export default async function Invoices() {
  const { tenantId } = await requireTenant();
  await markOverdue(tenantId);
  const list = await db.select({ inv: invoices, client: clients.name }).from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId)).where(eq(invoices.tenantId, tenantId)).orderBy(desc(invoices.createdAt));
  if (!list.length) return (
    <div className="state"><h1>No invoices yet</h1><p className="muted">Create one by hand, or upload site visit reports and let the lines fill in.</p>
      <div className="row"><Link className="btn" href="/invoices/new">New invoice</Link></div></div>
  );
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}><h1>Invoices</h1><Link className="btn" href="/invoices/new">New invoice</Link></div>
      <div className="card"><table>
        <thead><tr><th>Number</th><th>Client</th><th>Issued</th><th>Due</th><th>Status</th><th className="r">Total</th></tr></thead>
        <tbody>{list.map(({ inv, client }) => <tr key={inv.id}><td><Link href={`/invoices/${inv.id}`}>{inv.number}</Link></td><td>{client}</td>
          <td>{inv.issueDate}</td><td>{inv.dueDate}</td><td>{inv.kind === "credit_note" ? <span className="badge">credit note</span> : <span className={`badge ${inv.status}`}>{inv.status}</span>}</td>
          <td className="r">{fmt(inv.totalCents, inv.currency)}</td></tr>)}</tbody>
      </table></div>
    </>
  );
}
