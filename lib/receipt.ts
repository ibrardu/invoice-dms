"use server";
import { z } from "zod";
import { extractText, getDocumentProxy } from "unpdf";
import { requireTenant } from "./auth";
import { EXPENSE_CATEGORIES } from "./expense-categories";
import { llamaCloudEnabled, llamaExtract, startExtract, checkExtract } from "./llamacloud";

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

// JSON Schema for LlamaExtract (same fields as receiptSchema).
const RECEIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    date: { type: "string", description: "Purchase date as YYYY-MM-DD. Receipts write 19.06.2026 as day.month.year." },
    vendor: { type: "string", description: "Shop, restaurant or taxi company name" },
    total: { type: "number", description: "Final amount paid including tax (Summe, Total, Gesamt, Betrag). Not a subtotal, not cash given." },
    currency: { type: "string", description: "ISO currency code, e.g. EUR" },
    vatRate: { type: "number", description: "Main VAT/MwSt/USt percentage, e.g. 19 or 7" },
    category: { type: "string", enum: CATS, description: "Best fitting expense category" },
    description: { type: "string", description: "2 to 6 words on what was bought, e.g. Coffee and sandwich, Taxi to warehouse" },
    paymentMethod: { type: "string", description: "Card, Cash or similar, if printed" },
  },
};

const PROMPT = `You read shop receipts, taxi receipts and invoices for a field engineer's expense log.
Return ONLY a JSON object:
{"date":"YYYY-MM-DD"|null, "vendor": shop or company name|null, "total": the final amount paid incl. tax as a number|null,
 "currency": ISO code like EUR|null, "vatRate": the main VAT/MwSt percentage as a number (e.g. 19 or 7)|null,
 "category": one of ${CATS.join(", ")},
 "description": 2 to 6 words saying what was bought, e.g. "Coffee and sandwich" or "Taxi to warehouse"|null,
 "paymentMethod": "Card", "Cash" or similar if printed|null}
Rules: dates like 19.06.2026 are day.month.year. Use the grand total (Summe, Total, Gesamt, Betrag), never a subtotal or the cash given.
German receipts: "MwSt" or "USt" A=19%, B=7% unless stated otherwise. Never invent values; use null when unsure.`;

function clean(data: ReceiptData) {
  if (data.total != null && (data.total <= 0 || data.total > 100000)) data.total = null;
  // Observability without sensitive values: log which fields came back, never their contents.
  console.info("receipt read", { fields: Object.entries(data).filter(([, v]) => v != null && v !== "").map(([k]) => k) });
  return data;
}

/** Drift check: a result with neither a total nor a date is not a usable receipt. */
function usable(data: ReceiptData): { ok: true; data: ReceiptData } | { ok: false; error: string } {
  if (data.total == null && !data.date) return { ok: false, error: "No total or date found. Is this a receipt? Try a sharper photo or enter it by hand." };
  return { ok: true, data };
}

/** Reads a receipt photo (vision model) or PDF (text) and returns the fields for the expense form. */
export async function readReceipt(f: FormData): Promise<{ ok: true; data: ReceiptData } | { ok: false; error: string }> {
  try {
    await requireTenant();
    const { LLAMA_API_URL, LLAMA_API_KEY, LLAMA_MODEL } = process.env;
    const visionModel = process.env.LLAMA_VISION_MODEL || LLAMA_MODEL;
    const file = f.get("receipt");
    if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a receipt photo or PDF first." };
    if (file.size > 8 * 1024 * 1024) return { ok: false, error: "Receipt is larger than 8 MB." };
    if (llamaCloudEnabled()) return usable(clean(receiptSchema.parse(await llamaExtract(file, RECEIPT_JSON_SCHEMA, PROMPT))));
    if (!LLAMA_API_URL || !visionModel) return { ok: false, error: "Receipt reading is not set up. Add LLAMA_CLOUD_API_KEY (LlamaParse) in Vercel." };
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
    return usable(clean(data));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the receipt" };
  }
}

/** Step 1 of receipt reading with progress: upload and start LlamaParse. null = use readReceipt instead. */
export async function startReceipt(f: FormData): Promise<{ ok: true; jobId: string } | { ok: false; error: string } | null> {
  await requireTenant();
  if (!llamaCloudEnabled()) return null;
  const file = f.get("receipt");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a receipt photo or PDF first." };
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "Receipt is larger than 8 MB." };
  try { return { ok: true, jobId: await startExtract(file, RECEIPT_JSON_SCHEMA, PROMPT) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Could not upload" }; }
}

/** Step 2: one status check. */
export async function checkReceipt(jobId: string): Promise<{ state: "running" } | { state: "failed"; error: string } | { state: "done"; result: { ok: true; data: ReceiptData } | { ok: false; error: string } }> {
  await requireTenant();
  if (!/^[\w-]{4,80}$/.test(jobId)) return { state: "failed", error: "Bad job id" };
  try {
    const st = await checkExtract(jobId, "receipt");
    if (st.state !== "done") return st;
    return { state: "done", result: usable(clean(receiptSchema.parse(st.data))) };
  } catch (e) { return { state: "failed", error: e instanceof Error ? e.message : "Could not check" }; }
}
