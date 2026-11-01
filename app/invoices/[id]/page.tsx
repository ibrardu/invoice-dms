import Link from "next/link";
import { requireTenant } from "@/lib/auth";
import { loadInvoice } from "@/lib/invoice-data";
import { setInvoiceStatus, deleteInvoice, addPayment } from "@/lib/actions";
import { fmt, today } from "@/lib/money";
import { desc, eq } from "drizzle-orm";
import { db, invoiceEmails } from "@/lib/db";
import { emailEnabled, fillTemplate } from "@/lib/email";
import SendEmail from "./SendEmail";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { tenantId } = await requireTenant();
  const { id } = await params;
  const { inv, client, items, payments, documents, company } = await loadInvoice(tenantId, id);
  const sent = await db.select().from(invoiceEmails).where(eq(invoiceEmails.invoiceId, id)).orderBy(desc(invoiceEmails.sentAt));
  const longDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const paid = payments.reduce((a, p) => a + p.amountCents, 0);
  const daysLate = Math.max(0, Math.round((Date.parse(today()) - Date.parse(inv.dueDate)) / 86400000));
  const vars = { number: inv.number, company: company.name, client: client.name, contact: client.contactName || client.name,
    total: fmt(inv.totalCents, inv.currency), balance: fmt(inv.totalCents - paid, inv.currency), due: longDate(inv.dueDate), days: String(daysLate) };
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{inv.number} <span className={`badge ${inv.status}`}>{inv.status}</span></h1>
        <div className="row">
          <a className="btn" href={`/api/invoices/${id}/pdf`} target="_blank">PDF</a>
          <a className="btn ghost" href={`/invoices/${id}/print`} target="_blank">Print view</a>
          <Link className="btn ghost" href={`/invoices/new?id=${id}`}>Edit</Link>
          <form action={deleteInvoice}><input type="hidden" name="id" value={id} /><button className="danger">Delete</button></form>
        </div>
      </div>
      <div className="card">
        <p><b>{client.name}</b><br /><span className="muted">Issued {inv.issueDate}, due {inv.dueDate}</span></p>
        <table><thead><tr><th>Description</th><th className="r">Qty</th><th className="r">Unit</th><th className="r">Tax %</th><th className="r">Amount</th></tr></thead>
          <tbody>{items.map((it) => <tr key={it.id}><td>{it.description}</td><td className="r">{it.quantity}</td>
            <td className="r">{fmt(it.unitPriceCents, inv.currency)}</td><td className="r">{it.taxRate}</td><td className="r">{fmt(it.lineTotalCents, inv.currency)}</td></tr>)}</tbody></table>
        <p className="r">Subtotal {fmt(inv.subtotalCents, inv.currency)} · Tax {fmt(inv.taxCents, inv.currency)} · <b>Total {fmt(inv.totalCents, inv.currency)}</b><br />
          Paid {fmt(paid, inv.currency)} · <b>Balance {fmt(inv.totalCents - paid, inv.currency)}</b></p>
        <div className="row">{(["draft", "sent", "overdue", "paid", "cancelled"] as const).filter((st) => st !== inv.status).map((st) =>
          <form key={st} action={setInvoiceStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={st} />
            <button className="ghost">Mark {st}</button></form>)}</div>
      </div>
      <div className="card"><h2>Payments</h2>
        <table><tbody>{payments.map((p) => <tr key={p.id}><td>{p.paidOn}</td><td>{p.method}</td><td>{p.reference}</td><td className="r">{fmt(p.amountCents, inv.currency)}</td></tr>)}</tbody></table>
        <form action={addPayment} className="grid" style={{ marginTop: 12, alignItems: "end" }}>
          <input type="hidden" name="invoiceId" value={id} />
          <div><label>Amount</label><input name="amount" type="number" step="0.01" defaultValue={((inv.totalCents - paid) / 100).toFixed(2)} /></div>
          <div><label>Date</label><input name="paidOn" type="date" defaultValue={today()} /></div>
          <div><label>Method</label><input name="method" placeholder="Bank transfer" /></div>
          <div><label>Reference</label><input name="reference" /></div>
          <div><button>Record payment</button></div>
        </form>
      </div>
      <div className="card"><h2>Send by email</h2>
        <SendEmail invoiceId={id} enabled={emailEnabled()} overdue={inv.status === "overdue"}
          invoice={{ to: client.email, subject: fillTemplate(company.emailSubject, vars), body: fillTemplate(company.emailBody, vars) }}
          reminder={{ to: client.email, subject: fillTemplate(company.reminderSubject, vars), body: fillTemplate(company.reminderBody, vars) }} />
        {sent.length > 0 && <table style={{ marginTop: 16 }}><thead><tr><th>Sent</th><th>Type</th><th>To</th><th>Subject</th></tr></thead>
          <tbody>{sent.map((e) => <tr key={e.id}><td className="num">{e.sentAt.toISOString().slice(0, 16).replace("T", " ")}</td>
            <td>{e.kind === "reminder" ? "Reminder" : "Invoice"}</td><td>{e.toEmail}{e.cc && <div className="muted">cc {e.cc}</div>}</td><td>{e.subject}</td></tr>)}</tbody></table>}
      </div>
      <div className="card"><h2>Attached documents</h2>
        {documents.length ? <ul>{documents.map((d) => <li key={d.id}><a href={`/api/documents/${d.id}`}>{d.title}</a></li>)}</ul> : <p className="muted">None. Upload in Documents and link to this invoice.</p>}
      </div>
    </>
  );
}
