import Link from "next/link";
import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db, expenses, clients, invoices } from "@/lib/db";
import { requireTenant } from "@/lib/auth";
import { saveExpense, deleteExpense } from "@/lib/expenses";
import { EXPENSE_CATEGORIES, categoryLabel } from "@/lib/expense-categories";
import { getCompany } from "@/lib/actions";
import { fmt, today } from "@/lib/money";

export const dynamic = "force-dynamic";
const dmy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

export default async function Expenses({ searchParams }: { searchParams: Promise<{ year?: string; month?: string; client?: string; cat?: string; edit?: string }> }) {
  const { tenantId } = await requireTenant();
  const sp = await searchParams;
  const now = today();
  const year = Number(sp.year) || Number(now.slice(0, 4));
  const month = Number(sp.month) || 0;                       // 0 = whole year
  const clientId = /^[0-9a-f-]{36}$/.test(sp.client ?? "") ? sp.client! : "";
  const cat = EXPENSE_CATEGORIES.some(([k]) => k === sp.cat) ? sp.cat! : "";
  const from = month ? `${year}-${String(month).padStart(2, "0")}-01` : `${year}-01-01`;
  const to = month ? (month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`) : `${year + 1}-01-01`;
  const where = and(eq(expenses.tenantId, tenantId), gte(expenses.spentOn, from), lt(expenses.spentOn, to),
    clientId ? eq(expenses.clientId, clientId) : undefined, cat ? eq(expenses.category, cat) : undefined);

  const [company, clientList, rows, byCat, [unbilled]] = await Promise.all([
    getCompany(tenantId),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.tenantId, tenantId)).orderBy(asc(clients.name)),
    db.select({ e: expenses, client: clients.name, invoice: invoices.number }).from(expenses)
      .leftJoin(clients, eq(clients.id, expenses.clientId)).leftJoin(invoices, eq(invoices.id, expenses.invoiceId))
      .where(where).orderBy(desc(expenses.spentOn), desc(expenses.createdAt)),
    db.select({ cat: expenses.category, v: sql<number>`sum(${expenses.amountCents})::int`, n: sql<number>`count(*)::int` })
      .from(expenses).where(where).groupBy(expenses.category).orderBy(desc(sql`2`)),
    db.select({ v: sql<number>`coalesce(sum(${expenses.amountCents}),0)::int`, n: sql<number>`count(*)::int` }).from(expenses)
      .where(and(eq(expenses.tenantId, tenantId), eq(expenses.billable, true), isNull(expenses.invoiceId))),
  ]);
  const cur = company.currency;
  const m = (c: number, currency = cur) => fmt(c, currency);
  const total = rows.reduce((a, r) => a + (r.e.currency === cur ? r.e.amountCents : 0), 0);
  const vat = rows.reduce((a, r) => a + (r.e.currency === cur ? Math.round(r.e.amountCents - r.e.amountCents / (1 + Number(r.e.vatRate) / 100)) : 0), 0);
  const billable = rows.filter((r) => r.e.billable).reduce((a, r) => a + r.e.amountCents, 0);
  const other = rows.filter((r) => r.e.currency !== cur).length;
  const maxCat = Math.max(1, ...byCat.map((c) => c.v));
  const edit = rows.find((r) => r.e.id === sp.edit)?.e;
  const period = month ? new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : String(year);

  return (
    <>
      <div className="ov-title">
        <div><h1>Expenses, {period}</h1>
          <p className="sub">{unbilled.n ? `${m(unbilled.v)} in ${unbilled.n} billable expense${unbilled.n > 1 ? "s" : ""} not invoiced yet` : "Every billable expense is invoiced"}</p></div>
        <form className="row">
          <select name="year" defaultValue={year} aria-label="Year" style={{ width: 96 }}>{Array.from({ length: 5 }, (_, i) => Number(now.slice(0, 4)) - i).map((y) => <option key={y}>{y}</option>)}</select>
          <select name="month" defaultValue={month} aria-label="Month" style={{ width: 130 }}><option value="0">Whole year</option>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Date(Date.UTC(2000, i, 1)).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })}</option>)}</select>
          <select name="client" defaultValue={clientId} aria-label="Client" style={{ width: 180 }}><option value="">All clients</option>{clientList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select name="cat" defaultValue={cat} aria-label="Category" style={{ width: 170 }}><option value="">All categories</option>{EXPENSE_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <button className="ghost">Apply</button>
          <a className="btn ghost" href={`/api/export?type=expenses&year=${year}${clientId ? `&client=${clientId}` : ""}&format=de`}>CSV</a>
        </form>
      </div>

      <section className="card strip" aria-label="Totals">
        <div><span>Spent</span><b className={total ? "money" : "money zero"}>{m(total)}</b><small>{rows.length} expense{rows.length === 1 ? "" : "s"}{other ? `, ${other} in other currencies not included` : ""}</small></div>
        <div><span>VAT included</span><b className={vat ? "money" : "money zero"}>{m(vat)}</b><small>Reclaimable input tax, if you are VAT registered</small></div>
        <div><span>Billable to clients</span><b className={billable ? "money" : "money zero"}>{m(billable)}</b><small>Charged back on invoices</small></div>
        <div><span>Your own cost</span><b className={total - billable ? "money" : "money zero"}>{m(total - billable)}</b><small>Not charged to a client</small></div>
      </section>

      <div className="cols2">
        <form action={saveExpense} className="card" key={edit?.id ?? "new"} encType="multipart/form-data">
          <div className="head"><h2>{edit ? "Edit expense" : "Add expense"}</h2>{edit && <Link href="/expenses" className="muted">Cancel</Link>}</div>
          <input type="hidden" name="id" defaultValue={edit?.id} />
          <div className="grid">
            <div><label>Date</label><input type="date" name="spentOn" defaultValue={edit?.spentOn ?? now} required /></div>
            <div><label>Amount (incl. VAT)</label><input name="amount" type="number" step="0.01" min="0.01" defaultValue={edit ? (edit.amountCents / 100).toFixed(2) : ""} required /></div>
          </div>
          <div style={{ marginTop: 12 }}><label>What was it for</label><input name="description" defaultValue={edit?.description} placeholder="Coffee on site, taxi to warehouse, LC/LC fibre cables" required /></div>
          <div className="grid" style={{ marginTop: 12 }}>
            <div><label>Category</label><select name="category" defaultValue={edit?.category ?? "food"}>{EXPENSE_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label>Shop or vendor</label><input name="vendor" defaultValue={edit?.vendor} /></div>
            <div><label>VAT %</label><input name="vatRate" type="number" step="0.01" min="0" max="100" defaultValue={edit?.vatRate ?? "19"} /></div>
            <div><label>Currency</label><input name="currency" defaultValue={edit?.currency ?? cur} maxLength={3} /></div>
            <div><label>Paid with</label><input name="paymentMethod" defaultValue={edit?.paymentMethod} placeholder="Card, cash, Wise" /></div>
            <div><label>Client / job</label><select name="clientId" defaultValue={edit?.clientId ?? ""}><option value="">None</option>{clientList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          </div>
          <label style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", color: "var(--text)" }}>
            <input type="checkbox" name="billable" defaultChecked={edit?.billable} style={{ width: "auto" }} /> Charge to the client on the next invoice</label>
          <div style={{ marginTop: 12 }}><label>Receipt (photo or PDF, optional)</label><input type="file" name="receipt" accept="image/*,application/pdf" style={{ height: "auto", padding: 8 }} /></div>
          <div style={{ marginTop: 12 }}><label>Notes</label><textarea name="notes" rows={2} defaultValue={edit?.notes} /></div>
          <p style={{ marginBottom: 0 }}><button>{edit ? "Save expense" : "Add expense"}</button></p>
        </form>

        <section className="card">
          <h2>By category</h2>
          {byCat.length ? byCat.map((c) => <div className="hbar" key={c.cat}>
            <span>{categoryLabel(c.cat)} <span className="muted num">({c.n})</span></span>
            <div className="track"><div className="fill" style={{ width: `${(c.v / maxCat) * 100}%` }} /></div>
            <span className="num">{m(c.v)}</span></div>) : <p className="muted">No expenses in {period}</p>}
        </section>
      </div>

      <section className="card" style={{ marginTop: 12 }}>
        <h2>{rows.length ? `${rows.length} expense${rows.length === 1 ? "" : "s"}` : "No expenses yet"}</h2>
        {rows.length > 0 && <table>
          <thead><tr><th>Date</th><th>What</th><th>Category</th><th>Client</th><th>Billing</th><th className="r">Amount</th><th></th></tr></thead>
          <tbody>{rows.map(({ e, client, invoice }) => <tr key={e.id}>
            <td className="num">{dmy(e.spentOn)}</td>
            <td>{e.description}{e.vendor && <div className="muted">{e.vendor}</div>}</td>
            <td className="muted">{categoryLabel(e.category)}</td>
            <td>{client ?? <span className="muted">–</span>}</td>
            <td>{e.invoiceId ? <Link href={`/invoices/${e.invoiceId}`}>{invoice}</Link> : e.billable ? <span className="badge sent">To invoice</span> : <span className="muted">Own cost</span>}</td>
            <td className="r money">{m(e.amountCents, e.currency)}</td>
            <td className="r"><div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
              {e.receiptDocId && <a href={`/api/documents/${e.receiptDocId}`} className="muted">Receipt</a>}
              <Link href={`/expenses?edit=${e.id}&year=${year}`} className="muted">Edit</Link>
              <form action={deleteExpense}><input type="hidden" name="id" value={e.id} /><button className="danger small">Delete</button></form>
            </div></td>
          </tr>)}</tbody>
        </table>}
      </section>
    </>
  );
}
