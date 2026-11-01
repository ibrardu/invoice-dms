import Link from "next/link";
import { and, asc, desc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { db, invoices, clients, documents, payments, expenses } from "@/lib/db";
import { requireTenant } from "@/lib/auth";
import { getCompany } from "@/lib/actions";
import { markOverdue } from "@/lib/overdue";
import { fmt, today } from "@/lib/money";
import LineChart from "./LineChart";
import Animate from "./Animate";

export const dynamic = "force-dynamic";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const METRICS = [["invoiced", "Invoiced"], ["paid", "Paid"], ["expenses", "Expenses"], ["hours", "Hours on site"]] as const;
type Metric = (typeof METRICS)[number][0];

const dmy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

export default async function Overview({ searchParams }: { searchParams: Promise<{ year?: string; client?: string; metric?: string }> }) {
  const { tenantId } = await requireTenant();
  await markOverdue(tenantId);
  const sp = await searchParams;
  const now = today();
  const thisYear = Number(now.slice(0, 4)), thisMonth = Number(now.slice(5, 7));
  const year = Number(sp.year) || thisYear;
  const metric: Metric = (METRICS.find(([k]) => k === sp.metric)?.[0]) ?? "invoiced";
  const clientId = /^[0-9a-f-]{36}$/.test(sp.client ?? "") ? sp.client! : "";
  const company = await getCompany(tenantId);
  const cur = company.currency;
  const m = (c: number) => fmt(c, cur);
  const range = (y: number) => [`${y}-01-01`, `${y + 1}-01-01`] as const;

  const invT = and(eq(invoices.tenantId, tenantId), ne(invoices.status, "cancelled"), clientId ? eq(invoices.clientId, clientId) : undefined);
  const payT = and(eq(payments.tenantId, tenantId), clientId ? eq(invoices.clientId, clientId) : undefined);
  const svrT = and(eq(documents.tenantId, tenantId), eq(documents.category, "svr"), clientId ? eq(documents.clientId, clientId) : undefined);
  const expT = and(eq(expenses.tenantId, tenantId), eq(expenses.currency, cur), clientId ? eq(expenses.clientId, clientId) : undefined);
  const paidOn = sql<number>`coalesce((select sum(p.amount_cents) from payments p where p.invoice_id = ${invoices.id}),0)::int`;

  const monthly = async (y: number) => {
    const [a, b] = range(y);
    if (metric === "invoiced") return db.select({ m: sql<number>`extract(month from ${invoices.issueDate})::int`, v: sql<number>`sum(${invoices.totalCents})::int` })
      .from(invoices).where(and(invT, gte(invoices.issueDate, a), lt(invoices.issueDate, b))).groupBy(sql`1`);
    if (metric === "paid") return db.select({ m: sql<number>`extract(month from ${payments.paidOn})::int`, v: sql<number>`sum(${payments.amountCents})::int` })
      .from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId)).where(and(payT, gte(payments.paidOn, a), lt(payments.paidOn, b))).groupBy(sql`1`);
    if (metric === "expenses") return db.select({ m: sql<number>`extract(month from ${expenses.spentOn})::int`, v: sql<number>`sum(${expenses.amountCents})::int` })
      .from(expenses).where(and(expT, gte(expenses.spentOn, a), lt(expenses.spentOn, b))).groupBy(sql`1`);
    return db.select({ m: sql<number>`extract(month from ${documents.visitDate})::int`, v: sql<number>`coalesce(sum(${documents.visitHours}),0)::float` })
      .from(documents).where(and(svrT, gte(documents.visitDate, a), lt(documents.visitDate, b))).groupBy(sql`1`);
  };

  const [clientList, years, open, [paidMonth], [paidYear], [paidPrevYtd], curRows, prevRows, [totInv], [totPaid], [totExp], [totHours], unbilled, byClient] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.tenantId, tenantId)).orderBy(asc(clients.name)),
    db.selectDistinct({ y: sql<number>`extract(year from ${invoices.issueDate})::int` }).from(invoices).where(eq(invoices.tenantId, tenantId)),
    db.select({ id: invoices.id, number: invoices.number, status: invoices.status, due: invoices.dueDate, total: invoices.totalCents, paid: paidOn, client: clients.name })
      .from(invoices).innerJoin(clients, eq(clients.id, invoices.clientId)).where(and(invT, sql`${invoices.status} in ('sent','overdue')`)).orderBy(asc(invoices.dueDate)),
    db.select({ v: sql<number>`coalesce(sum(${payments.amountCents}),0)::int` }).from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(payT, sql`to_char(${payments.paidOn}, 'YYYY-MM') = ${now.slice(0, 7)}`)),
    db.select({ v: sql<number>`coalesce(sum(${payments.amountCents}),0)::int` }).from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(payT, gte(payments.paidOn, range(year)[0]), lt(payments.paidOn, year === thisYear ? now.slice(0, 10) + "T23:59" : range(year)[1]))),
    db.select({ v: sql<number>`coalesce(sum(${payments.amountCents}),0)::int` }).from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(payT, gte(payments.paidOn, range(year - 1)[0]), lt(payments.paidOn, year === thisYear ? `${year - 1}${now.slice(4, 10)}T23:59` : range(year - 1)[1]))),
    monthly(year), monthly(year - 1),
    db.select({ v: sql<number>`coalesce(sum(${invoices.totalCents}),0)::int` }).from(invoices)
      .where(and(invT, gte(invoices.issueDate, range(year)[0]), lt(invoices.issueDate, range(year)[1]))),
    db.select({ v: sql<number>`coalesce(sum(${payments.amountCents}),0)::int` }).from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(payT, gte(payments.paidOn, range(year)[0]), lt(payments.paidOn, range(year)[1]))),
    db.select({ v: sql<number>`coalesce(sum(${expenses.amountCents}),0)::int` }).from(expenses)
      .where(and(expT, gte(expenses.spentOn, range(year)[0]), lt(expenses.spentOn, range(year)[1]))),
    db.select({ v: sql<number>`coalesce(sum(${documents.visitHours}),0)::float` }).from(documents)
      .where(and(svrT, gte(documents.visitDate, range(year)[0]), lt(documents.visitDate, range(year)[1]))),
    db.select({ id: documents.id, date: documents.visitDate, hours: documents.visitHours, clientId: documents.clientId, client: clients.name, title: documents.title })
      .from(documents).leftJoin(clients, eq(clients.id, documents.clientId)).where(and(svrT, isNull(documents.invoiceId))).orderBy(asc(documents.visitDate)),
    db.select({ name: clients.name, inv: sql<number>`coalesce(sum(${invoices.totalCents}),0)::int`, open: sql<number>`coalesce(sum(case when ${invoices.status} in ('sent','overdue') then ${invoices.totalCents} - ${paidOn} else 0 end),0)::int` })
      .from(invoices).innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(and(invT, gte(invoices.issueDate, range(year)[0]), lt(invoices.issueDate, range(year)[1]))).groupBy(clients.name).orderBy(desc(sql`2`)).limit(6),
  ]);

  // Balances computed from the rows shown below, so the strip and the list always agree.
  const balance = (r: (typeof open)[number]) => r.total - r.paid;
  const outstanding = open.reduce((a, r) => a + balance(r), 0);
  const overdueRows = open.filter((r) => r.status === "overdue");
  const overdue = overdueRows.reduce((a, r) => a + balance(r), 0);
  const unbilledHours = unbilled.reduce((a, d) => a + Number(d.hours ?? 0), 0);

  // The one finding, read first under the title.
  const oldest = overdueRows[0];
  const finding = oldest
    ? `${m(balance(oldest))} from ${oldest.client} is ${days(now, oldest.due)} days late${overdueRows.length > 1 ? `, ${overdueRows.length - 1} more overdue` : ""}`
    : unbilled.length ? `${unbilled.length} site visit${unbilled.length > 1 ? "s" : ""} not invoiced yet`
    : open.length ? `Nothing overdue. Next payment due ${dmy(open[0].due)}` : "Nothing outstanding";

  const series = (rows: { m: number; v: number }[], cut?: number) => MONTHS.map((_, i) => cut != null && i + 1 > cut ? null : Number(rows.find((r) => r.m === i + 1)?.v ?? 0));
  const current = series(curRows, year === thisYear ? thisMonth : undefined);
  const previous = series(prevRows) as number[];
  const hi = year === thisYear ? thisMonth - 1 : 11;
  const isMoney = metric !== "hours";
  const f = (v: number) => isMoney ? fmt(Math.round(v), cur) : `${Math.round(v * 10) / 10} h`;
  const axis = (v: number) => isMoney ? (v >= 100000 ? `${Math.round(v / 10000) / 10}k` : String(Math.round(v / 100))) : `${Math.round(v * 10) / 10}h`;
  const sum = (a: (number | null)[], to: number) => a.slice(0, to + 1).reduce<number>((s, v) => s + (v ?? 0), 0);
  const delta = (a: number, b: number) => {
    const d = a - b;
    const good = metric === "expenses" ? d < 0 : d > 0;   // spending more is not good news
    return <span className={d === 0 ? "muted" : good ? "up" : "down"}>{d === 0 ? "no change" : `${d > 0 ? "+" : "−"}${f(Math.abs(d))}`}</span>;
  };

  const groups = Object.values(unbilled.reduce<Record<string, { clientId: string | null; client: string; rows: typeof unbilled }>>((g, d) => {
    const k = d.clientId ?? "none";
    (g[k] ??= { clientId: d.clientId, client: d.client ?? "No client yet", rows: [] }).rows.push(d);
    return g;
  }, {}));

  const qs = (p: Record<string, string>) => new URLSearchParams({ year: String(year), ...(clientId ? { client: clientId } : {}), metric, ...p }).toString();
  const yearOpts = [...new Set([thisYear, year, ...years.map((y) => y.y)])].sort((a, b) => b - a);
  const period = year === thisYear ? `${new Date(now).toLocaleDateString("en-GB", { month: "long" })} ${year}` : String(year);

  return (
    <div className="stagger">
      <div className="ov-title">
        <div>
          <h1>{period}</h1>
          <p className="sub">{finding}</p>
        </div>
        <form className="row">
          <select name="year" defaultValue={year} aria-label="Year" style={{ width: 96 }}>{yearOpts.map((y) => <option key={y}>{y}</option>)}</select>
          <select name="client" defaultValue={clientId} aria-label="Client" style={{ width: 200 }}><option value="">All clients</option>
            {clientList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input type="hidden" name="metric" value={metric} />
          <button className="ghost">Apply</button>
          <Link className="btn" href="/invoices/new">New invoice</Link>
        </form>
      </div>

      <section className="card strip" aria-label="Balances">
        <div><span>Outstanding</span><b className={outstanding ? "money" : "money zero"}>{m(outstanding)}</b><small>{open.length} invoice{open.length === 1 ? "" : "s"} open</small></div>
        <div><span>Overdue</span><b className={overdue ? "money late" : "money zero"}>{m(overdue)}</b><small>{overdueRows.length ? `${overdueRows.length} past due date` : "Nothing past due"}</small></div>
        <div><span>Paid this month</span><b className={paidMonth.v ? "money" : "money zero"}>{m(paidMonth.v)}</b><small>{new Date(now).toLocaleDateString("en-GB", { month: "long" })}</small></div>
        <div><span>Paid in {year}</span><b className={paidYear.v ? "money" : "money zero"}>{m(paidYear.v)}</b>
          <small>{paidPrevYtd.v || paidYear.v ? <>{(() => { const d = paidYear.v - paidPrevYtd.v; return <span className={d > 0 ? "up" : d < 0 ? "down" : ""}>{d >= 0 ? "+" : "−"}{m(Math.abs(d))}</span>; })()} vs same period {year - 1}</> : "No payments yet"}</small></div>
      </section>

      <section className="card">
        <div className="tabs" role="tablist">
          {METRICS.map(([k, label]) => {
            const total = k === "invoiced" ? fmt(totInv.v, cur) : k === "paid" ? fmt(totPaid.v, cur) : k === "expenses" ? fmt(totExp.v, cur) : `${Math.round(Number(totHours.v) * 10) / 10} h`;
            return <Link key={k} role="tab" aria-selected={k === metric} href={`/?${qs({ metric: k })}`} className={k === metric ? "on" : ""}>
              <span>{label}</span><b>{total}</b></Link>;
          })}
        </div>
        <LineChart labels={MONTHS} current={current} previous={previous} highlight={hi} format={axis}
          currentLabel={String(year)} previousLabel={String(year - 1)} />
        <table className="cmp">
          <thead><tr><th></th><th className="r">{year}</th><th className="r">{year - 1}</th><th className="r">Change</th></tr></thead>
          <tbody>
            <tr><td>{MONTHS[hi]}</td><td className="r">{f(current[hi] ?? 0)}</td><td className="r">{f(previous[hi])}</td><td className="r">{delta(current[hi] ?? 0, previous[hi])}</td></tr>
            <tr><td>{year === thisYear ? "Year to date" : "Full year"}</td><td className="r">{f(sum(current, hi))}</td><td className="r">{f(sum(previous, hi))}</td><td className="r">{delta(sum(current, hi), sum(previous, hi))}</td></tr>
          </tbody>
        </table>
      </section>

      <div className="cols2">
        <section className="card">
          <div className="head"><h2>Waiting for payment</h2><Link href="/invoices" className="muted">All invoices</Link></div>
          {open.length ? <table><Animate as="tbody">{open.slice(0, 6).map((r) => {
            const d = days(now, r.due);
            return <tr key={r.id}>
              <td><Link href={`/invoices/${r.id}`}>{r.number}</Link><div className="muted">{r.client}</div></td>
              <td className={d > 0 ? "late" : "muted"}>{d > 0 ? `${d} days late` : d === 0 ? "Due today" : `Due ${dmy(r.due)}`}</td>
              <td className="r money">{m(balance(r))}</td></tr>;
          })}</Animate></table> : <p className="muted">Every invoice is paid</p>}
          {open.length > 6 && <p className="muted">{open.length - 6} more in Invoices</p>}
        </section>

        <section className="card">
          <div className="head"><h2>Not yet invoiced</h2><span className="muted num">{unbilled.length ? `${unbilled.length} visits · ${Math.round(unbilledHours * 10) / 10} h` : ""}</span></div>
          {groups.length ? groups.map((g) => <div key={g.client} className="ub">
            <div className="ub-head"><b>{g.client}</b>
              <Link className="btn small" href={`/invoices/new?${new URLSearchParams({ svrs: g.rows.map((r) => r.id).join(","), ...(g.clientId ? { client: g.clientId } : {}) })}`}>
                Invoice {g.rows.length === 1 ? "visit" : `${g.rows.length} visits`}</Link></div>
            <ul>{g.rows.map((r) => <li key={r.id}><span className="num">{r.date ? dmy(r.date) : "date missing"}</span>
              <span className="muted num">{r.hours ? `${Number(r.hours)} h` : "–"}</span>
              <a href={`/api/documents/${r.id}`} className="muted">SVR</a></li>)}</ul>
          </div>) : <p className="muted">Every site visit is invoiced</p>}
        </section>
      </div>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="head"><h2>By client, {year}</h2><Link href={`/export?year=${year}`} className="muted">Export CSV</Link></div>
        {byClient.length ? <table>
          <thead><tr><th>Client</th><th className="r">Invoiced</th><th className="r">Outstanding</th></tr></thead>
          <tbody>{byClient.map((c) => <tr key={c.name}><td>{c.name}</td><td className="r money">{m(c.inv)}</td>
            <td className={`r ${c.open ? "" : "muted"}`}>{m(c.open)}</td></tr>)}</tbody></table>
          : <p className="muted">No invoices in {year}</p>}
      </section>
    </div>
  );
}
