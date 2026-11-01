import { requireTenant } from "@/lib/auth";
import { loadInvoice } from "@/lib/invoice-data";
import PrintButton from "./PrintButton";
import "./invoice.css";

export const dynamic = "force-dynamic";

const long = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function PrintInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { tenantId } = await requireTenant();
  const { id } = await params;
  const { inv, client, items, company } = await loadInvoice(tenantId, id);
  const sym = new Intl.NumberFormat("en", { style: "currency", currency: inv.currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? inv.currency;
  const m = (cents: number) => `${sym}\u2009${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const addrLines = company.address.split(/\n/).map((l) => l.trim()).filter(Boolean);
  return (
    <div className="inv-wrap">
      <PrintButton />
      <article className="inv">
        <header className="inv-head">
          {company.logoUrl ? <img src={company.logoUrl} alt="" className="inv-logo" /> : <div className="inv-name">{company.name.toUpperCase()}</div>}
          <div className="r">
            <div className="inv-no">Invoice {inv.number}</div>
            <div className="inv-small">Issued on {long(inv.issueDate)}</div>
          </div>
        </header>

        <section className="inv-parties">
          <div>
            <h3>Billed to</h3>
            <b>{client.name.toUpperCase()}</b>
            {client.email && <div>{client.email}</div>}
            <div className="pre">{client.address}</div>
            {client.taxId && <div>VAT: {client.taxId}</div>}
          </div>
          <div>
            <h3>From</h3>
            <b>{company.name.toUpperCase()}</b>
            <div>{addrLines.join(", ")}</div>
            {company.taxId && <div>VAT: {company.taxId}</div>}
            <div className="gap"><b>Date of sale / supply</b> - {inv.supplyDates || long(inv.issueDate)}</div>
            <div><b>Due date</b> - {long(inv.dueDate)}</div>
          </div>
        </section>

        <section className="inv-items">
          <h2>Items</h2>
          <table>
            <thead><tr><th>Name / description</th><th className="r">Price</th><th className="r">Quantity</th><th className="r">Tax rate (%)</th><th className="r">Amount</th></tr></thead>
            <tbody>{items.map((it) => <tr key={it.id}><td>{it.description}</td><td className="r">{m(it.unitPriceCents)}</td>
              <td className="r">{Number(it.quantity)}</td><td className="r">{Number(it.taxRate)}</td><td className="r">{m(it.lineTotalCents)}</td></tr>)}</tbody>
            <tfoot>
              <tr className="first"><th colSpan={4} className="r">Subtotal</th><td className="r">{m(inv.subtotalCents)}</td></tr>
              <tr><th colSpan={4} className="r">Total Tax</th><td className="r">{m(inv.taxCents)}</td></tr>
              <tr className="grand"><th colSpan={4} className="r">Total</th><td className="r">{m(inv.totalCents)}</td></tr>
            </tfoot>
          </table>
        </section>

        {(inv.notes || company.footerNote) && <section className="inv-note">
          <b>Invoice note</b>
          <div className="pre">{[inv.notes, company.footerNote].filter(Boolean).join("\n")}</div>
        </section>}

        <footer className="inv-foot">
          <div><h4>Address</h4><div>{company.name.toUpperCase()}</div>{addrLines.map((l, i) => <div key={i}>{l}</div>)}</div>
          <div><h4>Contact</h4>{company.email && <div>{company.email}</div>}{company.phone && <div>{company.phone}</div>}</div>
          <div><h4>Payment details</h4>{company.bankDetails.split(/\n/).filter(Boolean).map((l, i) => {
            const [k, ...v] = l.split(":"); return <div key={i}>{v.length ? <><b>{k}:</b>{v.join(":")}</> : l}</div>; })}</div>
        </footer>
      </article>
    </div>
  );
}
