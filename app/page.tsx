import Link from "next/link";
import { and, asc, desc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { db, invoices, clients, documents, payments } from "@/lib/db";
import { requireTenant } from "@/lib/auth";
import { getCompany } from "@/lib/actions";
import { markOverdue } from "@/lib/overdue";
import { fmt, today, addDays } from "@/lib/money";
import BarChart from "./BarChart";

export const dynamic = "force-dynamic";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BLUE = "#2a78d6", ORANGE = "#eb6834";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ year?: string; client?: string }> }) {
  const { tenantId } = await requireTenant();
  await markOverdue(tenantId);
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getUTCFullYear();
  const clientId = /^[0-9a-f-]{36}$/.test(sp.client ?? "") ? sp.client! : "";
  const from = `${year}-01-01`, to = `${year + 1}-01-01`, now = today();
  const month = now.slice(0, 7);
  const company = await getCompany(tenantId);
  const cur = company.currency;
  const m = (c: number) => fmt(c, cur);
  const short = (c: number) => c >= 100000 ? `${Math.round(c / 100000)}k` : String(Math.round(c / 100));

  const invT = and(eq(invoices.tenantId, tenantId), ne(invoices.status, "cancelled"), clientId ? eq(invoices.clientId, clientId) : undefined);
  const payT = and(eq(payments.tenantId, tenantId), clientId ? eq(invoices.clientId, clientId) : undefined);
  const total = sql<number>`coalesce(sum(${invoices.totalCents}),0)::int`;
  const paidSum = sql<number>`coalesce(sum(${payments.amountCents}),0)::int`;
  const outstandingExpr = sql<number>`coalesce(sum(${invoices.totalCents} - coalesce((select sum(p.amount_cents) from payments p where p.invoice_id = ${invoices.id}),0)),0)::int`;

  const [years, clientList, [outstanding], [overdue], [paidMonth], [paidYear], invByMonth, paidByMonth, byClient,
    visitsByMonth, overdueList, dueSoon, unbilled] = await Promise.all([
    db.selectDistinct({ y: sql<number>`extract(year from ${invoices.issueDate})::int` }).from(invoices).where(eq(invoices.tenantId, tenantId)),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.tenantId, tenantId)).orderBy(asc(clients.name)),
    db.select({ v: outstandingExpr, n: sql<number>`count(*)::int` }).from(invoices).where(and(invT, sql`${invoices.status} in ('sent','overdue')`)),
    db.select({ v: outstandingExpr, n: sql<number>`count(*)::int` }).from(invoices).where(and(invT, eq(invoices.status, "overdue"))),
    db.select({ v: paidSum }).from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId)).where(and(payT, sql`to_char(${payments.paidOn}, 'YYYY-MM') = ${month}`)),
    db.select({ v: paidSum }).from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId)).where(and(payT, gte(payments.paidOn, from), lt(payments.paidOn, to))),
    db.select({ m: sql<number>`extract(month from ${invoices.issueDate})::int`, v: total }).from(invoices)
      .where(and(invT, gte(invoices.issueDate, from), lt(invoices.issueDate, to))).groupBy(sql`1`),
    db.select({ m: sql<number>`extract(month from ${payments.paidOn})::int`, v: paidSum }).from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(payT, gte(payments.paidOn, from), lt(payments.paidOn, to))).groupBy(sql`1`),
    db.select({ name: clients.name, v: total, n: sql<number>`count(*)::int` }).from(invoices).innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(and(invT, gte(invoices.issueDate, from), lt(invoices.issueDate, to))).groupBy(clients.name).orderBy(desc(total)),
    db.select({ m: sql<number>`extract(month from ${documents.visitDate})::int`, n: sql<number>`count(*)::int`,
      h: sql<number>`coalesce(sum(${documents.visitHours}),0)::float` }).from(documents)
      .where(and(eq(documents.tenantId, tenantId), eq(documents.category, "svr"), gte(documents.visitDate, from), lt(documents.visitDate, to),
        clientId ? eq(documents.clientId, clientId) : undefined)).groupBy(sql`1`),
    db.select({ id: invoices.id, number: invoices.number, due: invoices.dueDate, total: invoices.totalCents, client: clients.name })
      .from(invoices).innerJoin(clients, eq(clients.id, invoices.clientId)).where(and(invT, eq(invoices.status, "overdue"))).orderBy(asc(invoices.dueDate)),
    db.select({ id: invoices.id, number: invoices.number, due: invoices.dueDate, total: invoices.totalCents, client: clients.name })
      .from(invoices).innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(and(invT, eq(invoices.status, "sent"), gte(invoices.dueDate, now), lt(invoices.dueDate, addDays(now, 8)))).orderBy(asc(invoices.dueDate)),
    db.select({ id: documents.id, title: documents.title, date: documents.visitDate, client: clients.name }).from(documents)
      .leftJoin(clients, eq(clients.id, documents.clientId))
      .where(and(eq(documents.tenantId, tenantId), eq(documents.category, "svr"), isNull(documents.invoiceId), clientId ? eq(documents.clientId, clientId) : undefined))
      .orderBy(asc(documents.visitDate)),
  ]);

  const byM = (rows: { m: number; v: number }[]) => MONTHS.map((_, i) => rows.find((r) => r.m === i + 1)?.v ?? 0);
  const yearOpts = [...new Set([year, new Date().getUTCFullYear(), ...years.map((y) => y.y)])].sort((a, b) => b - a);
  const maxClient = Math.max(1, ...byClient.map((c) => c.v));
  const daysLate = (d: string) => Math.round((Date.parse(now) - Date.parse(d)) / 86400000);
  const qs = `year=${year}${clientId ? `&client=${clientId}` : ""}`;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Dashboard</h1>
        <form className="row">
          <select name="year" defaultValue={year} style={{ width: 100 }}>{yearOpts.map((y) => <option key={y}>{y}</option>)}</select>
          <select name="client" defaultValue={clientId} style={{ width: 220 }}><option value="">All clients</option>
            {clientList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <button className="ghost">Apply</button>
          <Link className="btn ghost" href={`/export?${qs}`}>Export CSV</Link>
          <Link className="btn" href="/invoices/new">New invoice</Link>
        </form>
      </div>

      <div className="stats">
        <div className="card stat"><span className="muted">Outstanding ({outstanding.n})</span><b>{m(outstanding.v)}</b></div>
        <div className="card stat"><span className="muted">Overdue ({overdue.n})</span><b className={overdue.n ? "late" : ""}>{m(overdue.v)}</b></div>
        <div className="card stat"><span className="muted">Paid this month</span><b>{m(paidMonth.v)}</b></div>
        <div className="card stat"><span className="muted">Paid in {year}</span><b>{m(paidYear.v)}</b></div>
      </div>

      <div className="card"><h2>Revenue by month, {year}</h2>
        <BarChart labels={MONTHS} format={short} series={[
          { name: "Invoiced", color: BLUE, values: byM(invByMonth) },
          { name: "Paid", color: ORANGE, values: byM(paidByMonth) }]} />
      </div>

      <div className="cols2">
        <div className="card"><h2>Revenue by client, {year}</h2>
          {byClient.length ? byClient.map((c) => <div className="hbar" key={c.name}>
            <span>{c.name} <span className="muted">({c.n})</span></span>
            <div className="track"><div className="fill" style={{ width: `${(c.v / maxClient) * 100}%` }} title={m(c.v)} /></div>
            <span>{m(c.v)}</span></div>) : <p className="muted">No invoices in {year}.</p>}
        </div>
        <div className="card"><h2>Site visits by month, {year}</h2>
          <BarChart labels={MONTHS} format={(n) => String(Math.round(n))} height={150}
            series={[{ name: "Visits", color: BLUE, values: MONTHS.map((_, i) => visitsByMonth.find((r) => r.m === i + 1)?.n ?? 0) }]} />
          <h2 style={{ marginTop: 12 }}>Hours on site by month</h2>
          <BarChart labels={MONTHS} format={(n) => `${Math.round(n)}h`} height={150}
            series={[{ name: "Hours", color: BLUE, values: MONTHS.map((_, i) => visitsByMonth.find((r) => r.m === i + 1)?.h ?? 0) }]} />
        </div>
      </div>

      <div className="cols2" style={{ marginTop: 18 }}>
        <div className="card"><h2>Overdue</h2>
          {overdueList.length ? <table><tbody>{overdueList.map((i) => <tr key={i.id}>
            <td><Link href={`/invoices/${i.id}`}>{i.number}</Link></td><td>{i.client}</td>
            <td className="late">{daysLate(i.due)} days late</td><td className="r">{m(i.total)}</td></tr>)}</tbody></table> : <p className="muted">Nothing overdue.</p>}
        </div>
        <div className="card"><h2>Due in the next 7 days</h2>
          {dueSoon.length ? <table><tbody>{dueSoon.map((i) => <tr key={i.id}>
            <td><Link href={`/invoices/${i.id}`}>{i.number}</Link></td><td>{i.client}</td><td>{i.due}</td><td className="r">{m(i.total)}</td></tr>)}</tbody></table>
            : <p className="muted">Nothing due this week.</p>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}><h2>SVRs not yet invoiced ({unbilled.length})</h2>
        {unbilled.length ? <table><tbody>{unbilled.map((d) => <tr key={d.id}>
          <td>{d.date ?? "?"}</td><td><a href={`/api/documents/${d.id}`}>{d.title}</a></td><td>{d.client}</td></tr>)}</tbody></table>
          : <p className="muted">All site visits are invoiced.</p>}
        {unbilled.length > 0 && <p><Link className="btn" href="/invoices/new">Create invoice</Link></p>}
      </div>
    </>
  );
}
