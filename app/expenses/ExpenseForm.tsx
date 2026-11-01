"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveExpense, type ExpenseFormState } from "@/lib/expenses";
import { readReceipt } from "@/lib/receipt";
import { applyMap, RECEIPT_TO_EXPENSE, validateExpense } from "@/lib/field-maps";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

type Edit = { id: string; spentOn: string; amountCents: number; description: string; category: string; vendor: string;
  vatRate: string; currency: string; paymentMethod: string; clientId: string | null; billable: boolean; notes: string } | undefined;

async function shrink(file: File): Promise<File> {
  if (!/^image\//.test(file.type) || file.type === "image/gif") return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob | null = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
}

export default function ExpenseForm({ edit, clients, currency, today }: { edit: Edit; clients: { id: string; name: string }[]; currency: string; today: string }) {
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState<ExpenseFormState, FormData>(saveExpense, null);
  const [key, setKey] = useState(() => crypto.randomUUID());     // idempotency key for this form instance
  const [touched, setTouched] = useState<Set<string>>(new Set());  // fields the user typed in: never overwritten
  const [auto, setAuto] = useState<Set<string>>(new Set());        // fields filled from the receipt: highlighted for review
  const [local, setLocal] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [reading, setReading] = useState(false);
  const errors = { ...local, ...(state?.errors ?? {}) };

  // After a successful add: clear the form and start a fresh submission key.
  useEffect(() => {
    if (state?.ok && !edit) { form.current?.reset(); setKey(crypto.randomUUID()); setAuto(new Set()); setTouched(new Set()); setMsg(""); }
  }, [state, edit]);

  function onEdit(e: React.FormEvent<HTMLFormElement>) {
    const name = (e.target as HTMLInputElement).name;
    if (!name) return;
    setTouched((t) => new Set(t).add(name));
    setAuto((a) => { const n = new Set(a); n.delete(name); return n; });
    setLocal((l) => { const n = { ...l }; delete n[name]; return n; });
  }

  async function read() {
    const file = fileInput.current?.files?.[0];
    if (!form.current || !file) { setMsg("Choose a receipt first"); return; }
    setReading(true); setMsg("Reading receipt...");
    const fd = new FormData(); fd.set("receipt", file);
    const r = await readReceipt(fd);
    setReading(false);
    if (!r.ok) { setMsg(r.error); return; }
    const { values, missing } = applyMap(r.data as Record<string, unknown>, RECEIPT_TO_EXPENSE);
    const filled = new Set<string>();
    for (const [name, v] of Object.entries(values)) {
      const el = form.current.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (!el) continue;
      const untouchedDefault = !touched.has(name);
      if (untouchedDefault) { el.value = v; filled.add(name); }
    }
    setAuto(filled);
    const labels = RECEIPT_TO_EXPENSE.filter((m) => filled.has(m.field)).map((m) => m.label);
    setMsg([labels.length ? `Filled ${labels.join(", ")} from the receipt. Check them before saving.` : "Nothing new to fill.",
      missing.length ? `Not found: ${missing.join(" and ")}.` : ""].filter(Boolean).join(" "));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Same rules as the server, so mistakes show before anything is uploaded.
    const fd = new FormData(e.currentTarget);
    const v: Record<string, string> = {};
    fd.forEach((val, k) => { if (typeof val === "string") v[k] = val; });
    const errs = validateExpense(v, today);
    setLocal(errs);
    if (Object.keys(errs).length) e.preventDefault();
  }

  const cls = (name: string) => [errors[name] ? "invalid" : "", auto.has(name) ? "autofilled" : ""].join(" ").trim() || undefined;
  const err = (name: string) => errors[name] ? <span className="field-error" id={`${name}-err`}>{errors[name]}</span> : null;
  const aria = (name: string) => errors[name] ? { "aria-invalid": true, "aria-describedby": `${name}-err` } : {};

  return (
    <form ref={form} action={action} onSubmit={onSubmit} onInput={onEdit} className="card" noValidate>
      <div className="head"><h2>{edit ? "Edit expense" : "Add expense"}</h2>{edit && <Link href="/expenses" className="muted">Cancel</Link>}</div>
      <input type="hidden" name="id" defaultValue={edit?.id} />
      <input type="hidden" name="submissionKey" value={key} />

      <label>Receipt (photo or PDF, optional)</label>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input ref={fileInput} type="file" name="receipt" accept="image/*,application/pdf" capture="environment" style={{ height: "auto", padding: 8, flex: 1, minWidth: 0 }}
          onChange={async () => { const f = fileInput.current?.files?.[0]; if (!f) return; const s = await shrink(f);
            if (s !== f) { const dt = new DataTransfer(); dt.items.add(s); fileInput.current!.files = dt.files; } }} />
        <button type="button" className="ghost" onClick={read} disabled={reading}>{reading ? "Reading..." : "Read receipt"}</button>
      </div>
      {msg && <p className="muted" role="status" style={{ margin: "6px 0 0" }}>{msg}</p>}
      {err("receipt")}

      <div className="grid" style={{ marginTop: 12 }}>
        <div><label htmlFor="spentOn">Date</label><input id="spentOn" type="date" name="spentOn" defaultValue={edit?.spentOn ?? today} className={cls("spentOn")} {...aria("spentOn")} />{err("spentOn")}</div>
        <div><label htmlFor="amount">Amount (incl. VAT)</label><input id="amount" name="amount" inputMode="decimal" defaultValue={edit ? (edit.amountCents / 100).toFixed(2) : ""} placeholder="12,50" className={cls("amount")} {...aria("amount")} />{err("amount")}</div>
      </div>
      <div style={{ marginTop: 12 }}><label htmlFor="description">What was it for</label>
        <input id="description" name="description" defaultValue={edit?.description} placeholder="Coffee on site, taxi to warehouse, LC/LC fibre cables" className={cls("description")} {...aria("description")} />{err("description")}</div>
      <div className="grid" style={{ marginTop: 12 }}>
        <div><label htmlFor="category">Category</label><select id="category" name="category" defaultValue={edit?.category ?? "food"} className={cls("category")}>{EXPENSE_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label htmlFor="vendor">Shop or vendor</label><input id="vendor" name="vendor" defaultValue={edit?.vendor} className={cls("vendor")} /></div>
        <div><label htmlFor="vatRate">VAT %</label><input id="vatRate" name="vatRate" inputMode="decimal" defaultValue={edit?.vatRate ?? "19"} className={cls("vatRate")} {...aria("vatRate")} />{err("vatRate")}</div>
        <div><label htmlFor="currency">Currency</label><input id="currency" name="currency" defaultValue={edit?.currency ?? currency} maxLength={3} className={cls("currency")} {...aria("currency")} />{err("currency")}</div>
        <div><label htmlFor="paymentMethod">Paid with</label><input id="paymentMethod" name="paymentMethod" defaultValue={edit?.paymentMethod} placeholder="Card, cash, Wise" className={cls("paymentMethod")} /></div>
        <div><label htmlFor="clientId">Client / job</label><select id="clientId" name="clientId" defaultValue={edit?.clientId ?? ""} {...aria("clientId")}><option value="">None</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{err("clientId")}</div>
      </div>
      <label className="check"><input type="checkbox" name="billable" defaultChecked={edit?.billable} /> Charge to the client on the next invoice</label>
      <div style={{ marginTop: 12 }}><label htmlFor="notes">Notes</label><textarea id="notes" name="notes" rows={2} defaultValue={edit?.notes} /></div>

      {state?.message && <p role="alert" className={state.ok ? "muted" : "late"} style={{ marginBottom: 0 }}>{state.message}</p>}
      {state?.duplicateOf && <label className="check"><input type="checkbox" name="confirmDuplicate" /> Save anyway, it is a different expense</label>}
      <p style={{ marginBottom: 0 }}><button disabled={pending || reading}>{pending ? "Saving..." : edit ? "Save expense" : "Add expense"}</button></p>
    </form>
  );
}
