"use server";
import { z } from "zod";
import { extractText, getDocumentProxy } from "unpdf";
import { requireTenant } from "./auth";
import { EXPENSE_CATEGORIES } from "./expense-categories";

const CATS = EXPENSE_CATEGORIES.map(([k]) => k) as [string, ...string[]];
const n = z.coerce.number().nullable().catch(null);
const receiptSchema = z.object({
  date: z.string().nullable().catch(null),
  vendor: z.string().nullable().catch(null),
  total: n, currency: z.string().nullable().catch(null), vatRate: n,
  category: z.enum(CATS).catch("other"),
  description: z.string().nullable().catch(null),
  paymentMethod: z.string().nullable().catch(null),
});
export type ReceiptData = z.infer<typeof receiptSchema>;

const PROMPT = `You read shop receipts, taxi receipts and invoices for a field engineer's expense log.
Return ONLY a JSON object:
{"date":"YYYY-MM-DD"|null, "vendor": shop or company name|null, "total": the final amount paid incl. tax as a number|null,
 "currency": ISO code like EUR|null, "vatRate": the main VAT/MwSt percentage as a number (e.g. 19 or 7)|null,
 "category": one of ${CATS.join(", ")},
 "description": 2 to 6 words saying what was bought, e.g. "Coffee and sandwich" or "Taxi to warehouse"|null,
 "paymentMethod": "Card", "Cash" or similar if printed|null}
Rules: dates like 19.06.2026 are day.month.year. Use the grand total (Summe, Total, Gesamt, Betrag), never a subtotal or the cash given.
German receipts: "MwSt" or "USt" A=19%, B=7% unless stated otherwise. Never invent values; use null when unsure.`;

/** Reads a receipt photo (vision model) or PDF (text) and returns the fields for the expense form. */
export async function readReceipt(f: FormData): Promise<{ ok: true; data: ReceiptData } | { ok: false; error: string }> {
  try {
    await requireTenant();
    const { LLAMA_API_URL, LLAMA_API_KEY, LLAMA_MODEL } = process.env;
    const visionModel = process.env.LLAMA_VISION_MODEL || LLAMA_MODEL;
    if (!LLAMA_API_URL || !visionModel) return { ok: false, error: "Llama API is not configured (LLAMA_API_URL, LLAMA_MODEL)." };
    const file = f.get("receipt");
    if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a receipt photo or PDF first." };
    if (file.size > 8 * 1024 * 1024) return { ok: false, error: "Receipt is larger than 8 MB." };
    const buf = new Uint8Array(await file.arrayBuffer());

    let user: unknown;
    let model = visionModel;
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const { text } = await extractText(await getDocumentProxy(buf), { mergePages: true });
      if (text.trim().length < 10) return { ok: false, error: "This PDF has no readable text. Upload a photo of the receipt instead." };
      user = `Receipt text:\n"""\n${text.slice(0, 20000)}\n"""`;
      model = LLAMA_MODEL || visionModel;
    } else if (/^image\/(jpeg|png|webp)$/.test(file.type)) {
      const b64 = Buffer.from(buf).toString("base64");
      user = [{ type: "text", text: "Read this receipt." }, { type: "image_url", image_url: { url: `data:${file.type};base64,${b64}` } }];
    } else return { ok: false, error: "Use a JPG, PNG, WebP photo or a PDF." };

    const r = await fetch(`${LLAMA_API_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(LLAMA_API_KEY ? { Authorization: `Bearer ${LLAMA_API_KEY}` } : {}) },
      body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" },
        messages: [{ role: "system", content: PROMPT }, { role: "user", content: user }] }),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 200);
      return { ok: false, error: `Llama API error ${r.status}${/image|vision|multimodal/i.test(detail) ? ": this model cannot read images, set LLAMA_VISION_MODEL" : ""}` };
    }
    const raw = String((await r.json()).choices?.[0]?.message?.content ?? "");
    const data = receiptSchema.parse(JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)));
    if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) data.date = null;
    if (data.currency) data.currency = data.currency.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || null;
    if (data.total != null && (data.total <= 0 || data.total > 100000)) data.total = null;
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the receipt" };
  }
}
