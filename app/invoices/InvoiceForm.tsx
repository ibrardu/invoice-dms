"use client";
import { useState } from "react";
import { saveInvoice } from "@/lib/actions";
import { extractSvr, type Visit } from "@/lib/svr";

type Item = { description: string; quantity: number; unitPrice: number; taxRate: number };
type Props = { clients: { id: string; name: string }[]; currency: string; defaultTax: number;
  initial?: { id: string; clientId: string; issueDate: string; dueDate: string; notes: string; supplyDates: string; items: Item[] } };

export default function InvoiceForm({ clients, currency, defaultTax, initial }: Props) {
  const blank = (): Item => ({ description: "", quantity: 1, unitPrice: 0, taxRate: defaultTax });
  const [items, setItems] = useState<Item[]>(initial?.items ?? [blank()]);
  const upd = (i: number, k: keyof Item, v: string) => setItems(items.map((it, j) => j === i ? { ...it, [k]: k === "description" ? v : Number(v) } : it));
  const f = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(n);
  const [svrDocs, setSvrDocs] = useState<string[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [svrMsg, setSvrMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? "");
  const [supply, setSupply] = useState(initial?.supplyDates ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  async function importSvr(fd: FormData) {
    if (!clientId) { setSvrMsg("Select the client first so the right rates are used."); return; }
    fd.set("clientId", clientId); fd.set("taxRate", String(defaultTax));
    setBusy(true); setSvrMsg("Reading SVRs with Llama...");
    const r = await extractSvr(fd);
    setBusy(false);
    if (!r.ok) { setSvrMsg(r.error); return; }
    const keep = items.filter((it) => it.description.trim());
    setItems([...keep, ...r.lines]);
    setSupply(r.supplyDates || supply);
    setVisits([...visits, ...r.visits]);
    setSvrDocs([...svrDocs, ...r.visits.map((v) => v.docId)]);
    setSvrMsg(`Read ${r.visits.length} SVR(s). Check the lines below; expenses without an amount are set to 0.`);
  }

  const sub = items.reduce((a, it) => a + it.quantity * it.unitPrice, 0);
  const tax = items.reduce((a, it) => a + it.quantity * it.unitPrice * it.taxRate / 100, 0);

  return (
    <>
    {!initial && <form action={importSvr} className="card">
      <h2>Optional: fill from Site Visit Reports</h2>
      <p className="muted">Select the client below first, then upload one or more SVRs (PDF). One line is added per visit, priced with the client&apos;s half/full-day or hourly rate. Skip if there is no SVR.</p>
      <div className="row"><input type="file" name="svr" multiple accept=".pdf,.txt,text/plain,application/pdf" style={{ flex: 1, width: "auto" }} required />
        <button disabled={busy}>{busy ? "Reading..." : "Extract"}</button></div>
      {svrMsg && <p>{svrMsg}</p>}
      {visits.length > 0 && <table><thead><tr><th>Date</th><th>On site</th><th>Hours</th><th>Ticket</th><th>Site / customer</th><th>Notes</th></tr></thead>
        <tbody>{visits.map((v) => <tr key={v.docId}><td>{v.date}</td><td>{v.start ?? "?"} - {v.end ?? "?"}</td><td>{v.hours || "?"}</td>
          <td>{v.ticket}</td><td>{[v.endCustomer, v.site].filter(Boolean).join(", ")}</td>
          <td>{v.warnings.length ? <span style={{ color: "var(--danger)" }}>{v.warnings.join("; ")}</span> : v.summary}</td></tr>)}</tbody></table>}
    </form>}
    <form action={saveInvoice} className="card">
      <input type="hidden" name="svrDocIds" value={svrDocs.join(",")} />
      <input type="hidden" name="id" defaultValue={initial?.id} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <div className="grid">
        <div><label>Client *</label><select name="clientId" required value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="" disabled>Select client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label>Issue date</label><input type="date" name="issueDate" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
        <div><label>Date of sale / supply</label><input name="supplyDates" value={supply} onChange={(e) => setSupply(e.target.value)} placeholder="June 9, 16, 18 & 19 2026" /></div>
        <div><label>Due date (blank = payment terms)</label><input type="date" name="dueDate" defaultValue={initial?.dueDate} /></div>
      </div>
      <table style={{ marginTop: 16 }}>
        <thead><tr><th style={{ width: "45%" }}>Description</th><th>Qty</th><th>Unit price</th><th>Tax %</th><th className="r">Amount</th><th></th></tr></thead>
        <tbody>{items.map((it, i) => <tr key={i}>
          <td><input value={it.description} onChange={(e) => upd(i, "description", e.target.value)} required /></td>
          <td><input type="number" step="0.01" min="0.01" value={it.quantity} onChange={(e) => upd(i, "quantity", e.target.value)} /></td>
          <td><input type="number" step="0.01" value={it.unitPrice} onChange={(e) => upd(i, "unitPrice", e.target.value)} /></td>
          <td><input type="number" step="0.01" min="0" max="100" value={it.taxRate} onChange={(e) => upd(i, "taxRate", e.target.value)} /></td>
          <td className="r">{f(it.quantity * it.unitPrice)}</td>
          <td><button type="button" className="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1}>x</button></td>
        </tr>)}</tbody>
      </table>
      <p><button type="button" className="ghost" onClick={() => setItems([...items, blank()])}>+ Add line</button></p>
      <div className="grid">
        <div><label>Notes (shown on invoice)</label><textarea name="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <div className="r"><p>Subtotal: {f(sub)}</p><p>Tax: {f(tax)}</p><p><b>Total: {f(sub + tax)}</b></p></div>
      </div>
      <button>{initial ? "Save invoice" : "Create invoice"}</button>
    </form>
    </>
  );
}
