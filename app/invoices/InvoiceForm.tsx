"use client";
import { useState } from "react";
import { saveInvoice } from "@/lib/actions";
import { extractSvr } from "@/lib/svr";

type Item = { description: string; quantity: number; unitPrice: number; taxRate: number };
type Props = { clients: { id: string; name: string }[]; currency: string; defaultTax: number;
  initial?: { id: string; clientId: string; issueDate: string; dueDate: string; notes: string; supplyDates: string; items: Item[] } };

export default function InvoiceForm({ clients, currency, defaultTax, initial }: Props) {
  const blank = (): Item => ({ description: "", quantity: 1, unitPrice: 0, taxRate: defaultTax });
  const [items, setItems] = useState<Item[]>(initial?.items ?? [blank()]);
  const upd = (i: number, k: keyof Item, v: string) => setItems(items.map((it, j) => j === i ? { ...it, [k]: k === "description" ? v : Number(v) } : it));
  const f = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(n);
  const [svrDoc, setSvrDoc] = useState("");
  const [svrMsg, setSvrMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? "");
  const [supply, setSupply] = useState(initial?.supplyDates ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  async function importSvr(fd: FormData) {
    setBusy(true); setSvrMsg("Reading SVR with Llama...");
    const r = await extractSvr(fd);
    setBusy(false);
    if (!r.ok) { setSvrMsg(r.error); return; }
    const d = r.data;
    const times = d.visits.filter((v) => v.start && v.end).map((v) => `${v.date ?? ""} ${v.start}-${v.end}`.trim()).join(", ");
    const lines: Item[] = [];
    const dm = (x: string | null) => { const m = x?.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}.${m[2]}.${m[1]}` : x ?? ""; };
    const dated = d.visits.filter((v) => v.date && v.hours > 0);
    if (dated.length > 1) dated.forEach((v) => lines.push({ description: `Support ${dm(v.date)}${v.start && v.end ? ` (${v.start}-${v.end})` : ""}`,
      quantity: Math.round(v.hours * 100) / 100, unitPrice: r.hourly, taxRate: defaultTax }));
    else if (d.labourHours > 0) lines.push({ description: `Support ${dm(d.visitDate)}${times ? ` (${times})` : ""}`.trim(),
      quantity: Math.round(d.labourHours * 100) / 100, unitPrice: r.hourly, taxRate: defaultTax });
    if (d.travelHours > 0) lines.push({ description: `Travel ${dm(d.visitDate)}`.trim(), quantity: d.travelHours, unitPrice: r.travel, taxRate: defaultTax });
    d.materials.forEach((m) => lines.push({ description: m.description, quantity: m.quantity || 1, unitPrice: m.unitPrice ?? 0, taxRate: defaultTax }));
    if (lines.length) setItems(lines);
    const ds = [...new Set([d.visitDate, ...d.visits.map((v) => v.date)].filter(Boolean))].map((x) => new Date(x + "T00:00:00Z")).filter((x) => !isNaN(+x));
    if (ds.length) setSupply(ds.map((x) => x.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })).join(", "));
    if (d.clientName) { const m = clients.find((c) => c.name.toLowerCase().includes(d.clientName!.toLowerCase()) || d.clientName!.toLowerCase().includes(c.name.toLowerCase())); if (m) setClientId(m.id); }
    if (d.siteAddress) setNotes((n) => n || `Site: ${d.siteAddress}`);
    setSvrDoc(r.docId);
    setSvrMsg(`Extracted ${d.labourHours} h labour, ${d.travelHours} h travel, ${d.materials.length} material line(s). Please check before saving.`);
  }

  const sub = items.reduce((a, it) => a + it.quantity * it.unitPrice, 0);
  const tax = items.reduce((a, it) => a + it.quantity * it.unitPrice * it.taxRate / 100, 0);

  return (
    <>
    {!initial && <form action={importSvr} className="card">
      <h2>Optional: fill from Site Visit Report</h2>
      <p className="muted">Upload an SVR (PDF or text) and Llama will extract visit times and materials. Skip this if no SVR.</p>
      <div className="row"><input type="file" name="svr" accept=".pdf,.txt,text/plain,application/pdf" style={{ flex: 1, width: "auto" }} required />
        <button disabled={busy}>{busy ? "Reading..." : "Extract"}</button></div>
      {svrMsg && <p>{svrMsg}</p>}
    </form>}
    <form action={saveInvoice} className="card">
      <input type="hidden" name="svrDocId" value={svrDoc} />
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
