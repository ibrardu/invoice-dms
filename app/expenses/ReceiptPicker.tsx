"use client";
import { useRef, useState } from "react";
import { readReceipt } from "@/lib/receipt";

// Shrinks photos in the browser (max 1600px, JPEG) so uploads stay small and inside model limits.
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

/** Receipt file input plus "Read receipt": fills the empty fields of the surrounding expense form. */
export default function ReceiptPicker() {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function onPick() {
    const file = input.current?.files?.[0];
    if (!file) return;
    const small = await shrink(file);
    if (small !== file) { const dt = new DataTransfer(); dt.items.add(small); input.current!.files = dt.files; }
  }

  async function read() {
    const form = input.current?.form;
    const file = input.current?.files?.[0];
    if (!form || !file) { setMsg("Choose a receipt first"); return; }
    setBusy(true); setMsg("Reading receipt with Llama...");
    const fd = new FormData(); fd.set("receipt", file);
    const r = await readReceipt(fd);
    setBusy(false);
    if (!r.ok) { setMsg(r.error); return; }
    const d = r.data;
    const set = (name: string, v: string | number | null | undefined) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (el && v != null && v !== "") el.value = String(v);
    };
    set("spentOn", d.date); set("amount", d.total != null ? d.total.toFixed(2) : null); set("vendor", d.vendor);
    set("vatRate", d.vatRate); set("currency", d.currency); set("category", d.category);
    set("paymentMethod", d.paymentMethod);
    const desc = form.elements.namedItem("description") as HTMLInputElement | null;
    if (desc && !desc.value && d.description) desc.value = d.description;
    const missing = [!d.total && "amount", !d.date && "date"].filter(Boolean);
    setMsg(missing.length ? `Filled what was readable. Please enter the ${missing.join(" and ")}.` : "Filled from the receipt. Check the amount before saving.");
  }

  return (
    <div style={{ marginTop: 12 }}>
      <label>Receipt (photo or PDF, optional)</label>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input ref={input} type="file" name="receipt" accept="image/*,application/pdf" capture="environment" onChange={onPick} style={{ height: "auto", padding: 8, flex: 1, minWidth: 0 }} />
        <button type="button" className="ghost" onClick={read} disabled={busy}>{busy ? "Reading..." : "Read receipt"}</button>
      </div>
      {msg && <p className="muted" style={{ margin: "6px 0 0" }} role="status">{msg}</p>}
    </div>
  );
}
