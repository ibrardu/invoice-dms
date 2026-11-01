"use client";
import { useState } from "react";
import { saveInvoice } from "@/lib/actions";
import { extractSvr, type Visit } from "@/lib/svr";
import { priceVisit, hoursBetween, type Mode, type Rates } from "@/lib/pricing";

type Item = { description: string; quantity: number; unitPrice: number; taxRate: number; visitKey?: string };
type RVisit = Visit & { mode: Mode; rates: Rates; tax: number };
type Props = { clients: { id: string; name: string }[]; currency: string; defaultTax: number;
  initial?: { id: string; clientId: string; issueDate: string; dueDate: string; notes: string; supplyDates: string; items: Item[] } };

export default function InvoiceForm({ clients, currency, defaultTax, initial }: Props) {
  const blank = (): Item => ({ description: "", quantity: 1, unitPrice: 0, taxRate: defaultTax });
  const [items, setItems] = useState<Item[]>(initial?.items ?? [blank()]);
  const upd = (i: number, k: keyof Item, v: string) => setItems(items.map((it, j) => j === i ? { ...it, [k]: k === "description" ? v : Number(v) } : it));
  const f = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(n);
  const [svrDocs, setSvrDocs] = useState<string[]>([]);
  const [visits, setVisits] = useState<RVisit[]>([]);
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
    setVisits([...visits, ...r.visits.map((v) => ({ ...v, mode: r.mode, rates: r.rates, tax: r.tax }))]);
    setSvrDocs([...svrDocs, ...r.visits.map((v) => v.docId)]);
    setSvrMsg(`Read ${r.visits.length} SVR(s). Check the lines below; expenses without an amount are set to 0.`);
  }

  // Edit times/hours of an imported visit and reprice its invoice line.
  function editVisit(key: string, patch: Partial<Pick<Visit, "start" | "end" | "hours" | "date">>) {
    const next = visits.map((v) => {
      if (v.docId !== key) return v;
      const u = { ...v, ...patch };
      if (("start" in patch || "end" in patch)) { const h = hoursBetween(u.start, u.end); if (h) u.hours = h; }
      const { line, warnings } = priceVisit(u, u.mode, u.rates, u.tax, key);
      setItems((its) => its.map((it) => it.visitKey === key ? { ...it, quantity: line.quantity, unitPrice: line.unitPrice, description: line.description } : it));
      return { ...u, warnings };
    });
    setVisits(next);
  }

  const sub = items.reduce((a, it) => a + it.quantity * it.unitPrice, 0);
  const tax = items.reduce((a, it) => a + it.quantity * it.unitPrice * it.taxRate / 100, 0);

  return (
    <>
    {!initial && <form action={importSvr} className="card">
      <h2>Optional: fill from Site Visit Reports</h2>
      <p className="muted">Select the client below first, then upload one or more SVRs (PDF). One line is added per visit, priced by the client&apos;s default mode or the one you pick here. Skip if there is no SVR.</p>
      <div className="row"><select name="mode" defaultValue="" style={{ width: 240 }}>
          <option value="">Client default pricing</option><option value="half_full">Half / full day</option>
          <option value="full_day">Fixed full day</option><option value="hourly">Hourly</option><option value="task">Per task</option></select>
        <input type="file" name="svr" multiple accept=".pdf,.txt,text/plain,application/pdf" style={{ flex: 1, width: "auto" }} required />
        <button disabled={busy}>{busy ? "Reading..." : "Extract"}</button></div>
      {svrMsg && <p>{svrMsg}</p>}
      {visits.length > 0 && <table><thead><tr><th>Date</th><th>Start</th><th>End</th><th>Hours</th><th>Ticket</th><th>Site / customer</th><th>Check</th></tr></thead>
        <tbody>{visits.map((v) => <tr key={v.docId}>
          <td><input type="date" value={v.date ?? ""} onChange={(e) => editVisit(v.docId, { date: e.target.value || null })} /></td>
          <td><input type="time" value={v.start ?? ""} onChange={(e) => editVisit(v.docId, { start: e.target.value || null })} style={{ width: 100 }} /></td>
          <td><input type="time" value={v.end ?? ""} onChange={(e) => editVisit(v.docId, { end: e.target.value || null })} style={{ width: 100 }} /></td>
          <td><input type="number" step="0.25" min="0" value={v.hours || ""} placeholder="?" onChange={(e) => editVisit(v.docId, { hours: Number(e.target.value) || 0 })} style={{ width: 70 }} /></td>
          <td>{v.ticket}</td><td>{[v.endCustomer, v.site].filter(Boolean).join(", ")}</td>
          <td>{v.warnings.length ? <span style={{ color: "var(--danger)" }}>{v.warnings.join("; ")}</span> : <span style={{ color: "var(--ok)" }}>OK</span>}</td></tr>)}</tbody></table>}
    </form>}
    <form action={saveInvoice} className="card">
      <input type="hidden" name="svrDocIds" value={svrDocs.join(",")} />
      <input type="hidden" name="id" defaultValue={initial?.id} />
      <input type="hidden" name="items" value={JSON.stringify(items.map(({ visitKey: _k, ...it }) => it))} />
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
      {items.some((it) => it.quantity <= 0) && <p style={{ color: "var(--danger)" }}>Some lines have quantity 0. Enter the missing hours above or in the line.</p>}
      <button disabled={items.some((it) => it.quantity <= 0)}>{initial ? "Save invoice" : "Create invoice"}</button>
    </form>
    </>
  );
}
