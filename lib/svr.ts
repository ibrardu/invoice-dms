"use server";
import { put } from "@vercel/blob";
import { z } from "zod";
import { extractText, getDocumentProxy } from "unpdf";
import { db, documents } from "./db";
import { requireTenant } from "./auth";
import { getCompany } from "./actions";

const resultSchema = z.object({
  visitDate: z.string().nullable().catch(null),
  clientName: z.string().nullable().catch(null),
  siteAddress: z.string().nullable().catch(null),
  technician: z.string().nullable().catch(null),
  workSummary: z.string().catch(""),
  labourHours: z.coerce.number().catch(0),
  travelHours: z.coerce.number().catch(0),
  visits: z.array(z.object({ date: z.string().nullable().catch(null), start: z.string().nullable().catch(null),
    end: z.string().nullable().catch(null), hours: z.coerce.number().catch(0) })).catch([]),
  materials: z.array(z.object({ description: z.string(), quantity: z.coerce.number().catch(1),
    unitPrice: z.coerce.number().nullable().catch(null) })).catch([]),
});
export type SvrResult = z.infer<typeof resultSchema>;

const PROMPT = `You read Site Visit Reports (SVR) from field technicians and extract billable data.
Return ONLY a JSON object with these keys:
visitDate (YYYY-MM-DD or null), clientName, siteAddress, technician, workSummary (one or two sentences),
visits: [{date, start (HH:MM), end (HH:MM), hours}] one entry per time-on-site block,
labourHours (total on-site hours, subtract breaks if stated), travelHours (0 if not stated),
materials: [{description, quantity, unitPrice (number or null)}].
Compute hours from start/end times when hours are not written. Do not invent data; use null or 0 when missing.`;

async function fileToText(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const { text } = await extractText(await getDocumentProxy(buf), { mergePages: true });
    return text;
  }
  return new TextDecoder().decode(buf);
}

export async function extractSvr(f: FormData): Promise<{ ok: true; data: SvrResult; docId: string; hourly: number; travel: number } | { ok: false; error: string }> {
  try {
    const { tenantId, userId } = await requireTenant();
    const { LLAMA_API_URL, LLAMA_API_KEY, LLAMA_MODEL } = process.env;
    if (!LLAMA_API_URL || !LLAMA_MODEL) return { ok: false, error: "Llama API is not configured (LLAMA_API_URL, LLAMA_MODEL)." };
    const file = f.get("svr");
    if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose an SVR file (PDF or text)." };
    if (file.size > 10 * 1024 * 1024) return { ok: false, error: "SVR file is larger than 10 MB." };
    const text = (await fileToText(file)).slice(0, 30000);
    if (text.trim().length < 20) return { ok: false, error: "No readable text in this file (scanned PDFs are not supported yet)." };

    const r = await fetch(`${LLAMA_API_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(LLAMA_API_KEY ? { Authorization: `Bearer ${LLAMA_API_KEY}` } : {}) },
      body: JSON.stringify({ model: LLAMA_MODEL, temperature: 0, response_format: { type: "json_object" },
        messages: [{ role: "system", content: PROMPT }, { role: "user", content: `SVR text:\n"""\n${text}\n"""` }] }),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) return { ok: false, error: `Llama API error ${r.status}` };
    const j = await r.json();
    const raw = String(j.choices?.[0]?.message?.content ?? "");
    const data = resultSchema.parse(JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)));

    // Keep the SVR in the DMS; it is linked to the invoice when the invoice is saved.
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
    const blob = await put(`${tenantId}/${crypto.randomUUID()}-${safe}`, file, { access: "private", contentType: file.type || "application/octet-stream" });
    const [doc] = await db.insert(documents).values({ tenantId, uploadedBy: userId, title: `SVR ${data.visitDate ?? ""} ${file.name}`.trim(),
      fileName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size, blobPath: blob.pathname,
      category: "svr", tags: [data.technician, data.clientName].filter(Boolean).join(", ") }).returning({ id: documents.id });

    const company = await getCompany(tenantId);
    return { ok: true, data, docId: doc.id, hourly: company.hourlyRateCents / 100, travel: company.travelRateCents / 100 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read SVR" };
  }
}
