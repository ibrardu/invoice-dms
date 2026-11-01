"use server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { put } from "@vercel/blob";
import { z } from "zod";
import { extractText, getDocumentProxy } from "unpdf";
import { db, documents, clients } from "./db";
import { requireTenant } from "./auth";
import { getCompany } from "./actions";
import { llamaCloudEnabled, llamaExtract, startExtract, checkExtract } from "./llamacloud";
import { priceVisit, hoursBetween, dmy, type Mode, type Rates, type Line } from "./pricing";

const n = z.coerce.number().catch(0);
const str = z.string().nullable().catch(null);
const visitSchema = z.object({
  date: str, start: str, end: str, hours: n,
  ticket: str, site: str, endCustomer: str, engineer: str, summary: z.string().catch(""),
  expenses: z.array(z.object({ description: z.string(), amount: z.coerce.number().nullable().catch(null) })).catch([]),
  materials: z.array(z.object({ description: z.string(), quantity: z.coerce.number().catch(1), unitPrice: z.coerce.number().nullable().catch(null) })).catch([]),
});
export type Visit = z.infer<typeof visitSchema> & { fileName: string; docId: string; warnings: string[] };

const PROMPT = `You read field engineer Site Visit Reports (SVR). Layouts vary (forms, spreadsheets exported to PDF, post-visit templates).
Return ONLY a JSON object:
{"date":"YYYY-MM-DD"|null, "start":"HH:MM"|null, "end":"HH:MM"|null, "hours":number,
 "ticket": all ticket/reference numbers comma separated|null, "site": site name or address|null,
 "endCustomer": end customer / account name|null, "engineer": engineer name|null,
 "summary": one short sentence of the work done,
 "expenses":[{"description","amount"}] costs the engineer incurred on behalf of the customer (taxi, parking, buying cables/parts, procurement trips). amount = number if written, else null,
 "materials":[{"description","quantity","unitPrice"}] parts supplied by the engineer (NOT replaced customer hardware)}
Rules: dates like 19.06.2026 are day.month.year. "31st October 2026" -> 2026-10-31.
start = time on site / time onsite / start time. end = time left site / time off site / end time.
hours = end minus start in decimal hours, or 0 if either is missing. Never invent values.`;

// JSON Schema for LlamaExtract (same fields as visitSchema).
const SVR_JSON_SCHEMA = {
  type: "object",
  properties: {
    date: { type: "string", description: "Date of the site visit as YYYY-MM-DD. 19.06.2026 is day.month.year; 31st October 2026 is 2026-10-31." },
    start: { type: "string", description: "Time on site / time onsite / start time, HH:MM" },
    end: { type: "string", description: "Time left site / time off site / end time, HH:MM" },
    hours: { type: "number", description: "End minus start in decimal hours; 0 if a time is missing" },
    ticket: { type: "string", description: "All ticket, change or reference numbers, comma separated" },
    site: { type: "string", description: "Site name or address" },
    endCustomer: { type: "string", description: "End customer or account name" },
    engineer: { type: "string", description: "Engineer name" },
    summary: { type: "string", description: "One short sentence of the work done" },
    expenses: { type: "array", description: "Costs the engineer paid for the customer (taxi, parking, buying cables)", items: { type: "object",
      properties: { description: { type: "string" }, amount: { type: "number", description: "Amount if written" } }, required: ["description"] } },
    materials: { type: "array", description: "Parts supplied by the engineer, not replaced customer hardware", items: { type: "object",
      properties: { description: { type: "string" }, quantity: { type: "number" }, unitPrice: { type: "number" } }, required: ["description"] } },
  },
};

async function fileToText(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const { text } = await extractText(await getDocumentProxy(buf), { mergePages: true });
    return text;
  }
  return new TextDecoder().decode(buf);
}


async function llama(text: string) {
  const { LLAMA_API_URL, LLAMA_API_KEY, LLAMA_MODEL } = process.env;
  const r = await fetch(`${LLAMA_API_URL!.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(LLAMA_API_KEY ? { Authorization: `Bearer ${LLAMA_API_KEY}` } : {}) },
    body: JSON.stringify({ model: LLAMA_MODEL, temperature: 0, response_format: { type: "json_object" },
      messages: [{ role: "system", content: PROMPT }, { role: "user", content: `SVR text:\n"""\n${text}\n"""` }] }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`Llama API error ${r.status}`);
  const raw = String((await r.json()).choices?.[0]?.message?.content ?? "");
  return visitSchema.parse(JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)));
}

/** Reads one or more SVRs, stores them in the DMS and returns priced invoice lines. */
export async function extractSvr(f: FormData): Promise<
  { ok: true; visits: Visit[]; lines: Line[]; supplyDates: string; mode: Mode; rates: Rates; tax: number } | { ok: false; error: string }> {
  try {
    const { tenantId, userId } = await requireTenant();
    const cloud = llamaCloudEnabled();
    if (!cloud && (!process.env.LLAMA_API_URL || !process.env.LLAMA_MODEL)) return { ok: false, error: "SVR reading is not set up. Add LLAMA_CLOUD_API_KEY (LlamaParse) in Vercel." };
    const files = f.getAll("svr").filter((x): x is File => x instanceof File && x.size > 0);
    if (!files.length) return { ok: false, error: "Choose one or more SVR files." };
    if (files.length > 15) return { ok: false, error: "Up to 15 SVRs at a time." };
    const company = await getCompany(tenantId);
    const clientId = String(f.get("clientId") ?? "");
    const [client] = clientId ? await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))) : [];
    const tax = Number(f.get("taxRate") ?? company.defaultTaxRate) || 0;

    const visits: Visit[] = await Promise.all(files.map(async (file) => {
      if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB`);
      let v: z.infer<typeof visitSchema>;
      if (cloud) {
        v = visitSchema.parse(await llamaExtract(file, SVR_JSON_SCHEMA, PROMPT)); // reads scanned PDFs and photos too
      } else {
        const text = (await fileToText(file)).slice(0, 30000);
        if (text.trim().length < 20) throw new Error(`${file.name}: no readable text (scanned PDF?)`);
        v = await llama(text);
      }
      // Recompute hours from times; don't trust model arithmetic.
      const h = hoursBetween(v.start, v.end);
      v.hours = h || (v.start && v.end ? v.hours : 0);
      const warnings: string[] = [];
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
      const blob = await put(`${tenantId}/${crypto.randomUUID()}-${safe}`, file, { access: "private", contentType: file.type || "application/octet-stream" });
      const [doc] = await db.insert(documents).values({ tenantId, uploadedBy: userId, clientId: client?.id ?? null,
        title: `SVR ${v.date ?? ""} ${v.ticket ?? ""}`.replace(/\s+/g, " ").trim(), fileName: file.name,
        contentType: file.type || "application/octet-stream", sizeBytes: file.size, blobPath: blob.pathname, category: "svr", visitDate: /^\d{4}-\d{2}-\d{2}$/.test(v.date ?? "") ? v.date : null, visitHours: v.hours ? String(v.hours) : null,
        tags: [v.ticket, v.endCustomer, v.site, v.engineer].filter(Boolean).join(", ") }).returning({ id: documents.id });
      return { ...v, fileName: file.name, docId: doc.id, warnings };
    }));
    visits.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

    const mode = z.enum(["hourly", "half_full", "full_day", "task"]).catch((client?.pricingMode as "hourly") ?? "hourly").parse(f.get("mode"));
    const { rates, lines, supplyDates } = priceVisits(visits, client, company, mode, tax);
    return { ok: true, visits, lines, supplyDates, mode, rates, tax };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read SVR" };
  }
}

type ClientRow = typeof clients.$inferSelect;
type CompanyRow = Awaited<ReturnType<typeof getCompany>>;

/** Prices visits with the client's rates and builds the "June 9, 16 & 18, 2026" supply text. */
function priceVisits(visits: Visit[], client: ClientRow | undefined, company: CompanyRow, mode: Mode, tax: number) {
  const rates: Rates = {
    half: (client?.halfDayRateCents ?? 0) / 100, full: (client?.fullDayRateCents ?? 0) / 100,
    halfMax: Number(client?.halfDayMaxHours ?? 4), task: (client?.taskRateCents ?? 0) / 100,
    hourly: ((client?.hourlyRateCents || company.hourlyRateCents) ?? 0) / 100,
    travel: ((client?.travelFlatCents || company.travelRateCents) ?? 0) / 100,
  };
  const support: Line[] = [], extra: Line[] = [];
  for (const v of visits) {
    const { line, warnings } = priceVisit(v, mode, rates, tax, v.docId);
    support.push(line); v.warnings.push(...warnings);
    if (rates.travel) extra.push({ description: `Travel ${dmy(v.date)}`.trim(), quantity: 1, unitPrice: rates.travel, taxRate: tax });
    v.expenses.forEach((x) => extra.push({ description: x.description, quantity: 1, unitPrice: x.amount ?? 0, taxRate: tax }));
    v.materials.forEach((m) => extra.push({ description: m.description, quantity: m.quantity || 1, unitPrice: m.unitPrice ?? 0, taxRate: tax }));
  }
  const ds = [...new Set(visits.map((v) => v.date).filter((d): d is string => !!d))].sort().map((d) => new Date(d + "T00:00:00Z"));
  let supplyDates = "";
  if (ds.length) {
    const sameMonth = ds.every((d) => d.getUTCMonth() === ds[0].getUTCMonth() && d.getUTCFullYear() === ds[0].getUTCFullYear());
    const month = (d: Date) => d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
    const days = ds.map((d) => d.getUTCDate());
    supplyDates = sameMonth
      ? `${month(ds[0])} ${days.length > 1 ? days.slice(0, -1).join(", ") + " & " + days.at(-1) : days[0]}, ${ds[0].getUTCFullYear()}`
      : ds.map((d) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })).join(", ");
  }
  return { rates, lines: [...support, ...extra], supplyDates };
}

/** Builds invoice lines from SVRs already stored in Documents (no re-upload, no Llama call). */
export async function visitsFromDocs(ids: string[], clientId: string) {
  const { tenantId } = await requireTenant();
  const clean = ids.filter((i) => /^[0-9a-f-]{36}$/.test(i)).slice(0, 30);
  if (!clean.length) return null;
  const company = await getCompany(tenantId);
  const [client] = clientId ? await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))) : [];
  const docs = await db.select().from(documents)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.category, "svr"), isNull(documents.invoiceId), inArray(documents.id, clean)));
  const visits: Visit[] = docs.map((d) => ({
    date: d.visitDate, start: null, end: null, hours: Number(d.visitHours ?? 0),
    ticket: d.tags.split(",")[0]?.trim() || null, site: null, endCustomer: null, engineer: null, summary: d.title,
    expenses: [], materials: [], fileName: d.fileName, docId: d.id, warnings: [],
  })).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const mode = ((client?.pricingMode as Mode) ?? "hourly");
  const tax = Number(company.defaultTaxRate) || 0;
  const { rates, lines, supplyDates } = priceVisits(visits, client, company, mode, tax);
  return { visits, lines, supplyDates, mode, rates, tax };
}

/* ---------- Step-by-step reading with progress (LlamaCloud) ----------
   startSvr: store the file and start the LlamaParse job (returns at once)
   checkSvr: one status check; the browser calls it every ~1.5 s and shows elapsed time
   finishSvr: save the documents and price the visits                                  */

export type SvrRead = z.infer<typeof visitSchema>;
export type SvrStarted = { ok: true; jobId: string; blobPath: string; fileName: string; contentType: string; size: number } | { ok: false; error: string };

export async function startSvr(f: FormData): Promise<SvrStarted> {
  try {
    const { tenantId } = await requireTenant();
    if (!llamaCloudEnabled()) return { ok: false, error: "LlamaParse is not set up (LLAMA_CLOUD_API_KEY)." };
    const file = f.get("svr");
    if (!(file instanceof File) || !file.size) return { ok: false, error: "Empty file" };
    if (file.size > 10 * 1024 * 1024) return { ok: false, error: `${file.name} is larger than 10 MB` };
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
    const contentType = file.type || "application/octet-stream";
    // Store our copy and start LlamaParse at the same time.
    const [blob, jobId] = await Promise.all([
      put(`${tenantId}/${crypto.randomUUID()}-${safe}`, file, { access: "private", contentType }),
      startExtract(file, SVR_JSON_SCHEMA, PROMPT),
    ]);
    return { ok: true, jobId, blobPath: blob.pathname, fileName: file.name, contentType, size: file.size };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not upload" };
  }
}

export async function checkSvr(jobId: string, fileName: string): Promise<{ state: "running" } | { state: "done"; visit: SvrRead } | { state: "failed"; error: string }> {
  try {
    await requireTenant();
    if (!/^[\w-]{4,80}$/.test(jobId)) return { state: "failed", error: "Bad job id" };
    const st = await checkExtract(jobId, fileName);
    if (st.state !== "done") return st;
    const v = visitSchema.parse(st.data);
    const h = hoursBetween(v.start, v.end);               // recompute, don't trust model arithmetic
    v.hours = h || (v.start && v.end ? v.hours : 0);
    return { state: "done", visit: v };
  } catch (e) {
    return { state: "failed", error: e instanceof Error ? e.message : "Could not check" };
  }
}

type Finished = { visit: SvrRead; blobPath: string; fileName: string; contentType: string; size: number };

export async function finishSvr(items: Finished[], clientId: string, modeIn: string, taxIn: number):
  Promise<{ ok: true; visits: Visit[]; lines: Line[]; supplyDates: string; mode: Mode; rates: Rates; tax: number } | { ok: false; error: string }> {
  try {
    const { tenantId, userId } = await requireTenant();
    if (!items.length || items.length > 15) return { ok: false, error: "Nothing to add" };
    const company = await getCompany(tenantId);
    const [client] = clientId ? await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))) : [];
    const visits: Visit[] = [];
    for (const it of items) {
      if (!it.blobPath.startsWith(`${tenantId}/`)) return { ok: false, error: "File does not belong to this workspace" };
      const v = visitSchema.parse(it.visit);
      const [doc] = await db.insert(documents).values({ tenantId, uploadedBy: userId, clientId: client?.id ?? null,
        title: `SVR ${v.date ?? ""} ${v.ticket ?? ""}`.replace(/\s+/g, " ").trim(), fileName: it.fileName.slice(0, 200),
        contentType: it.contentType.slice(0, 100), sizeBytes: Math.max(0, Math.round(it.size)), blobPath: it.blobPath, category: "svr",
        visitDate: /^\d{4}-\d{2}-\d{2}$/.test(v.date ?? "") ? v.date : null, visitHours: v.hours ? String(v.hours) : null,
        tags: [v.ticket, v.endCustomer, v.site, v.engineer].filter(Boolean).join(", ") }).returning({ id: documents.id });
      visits.push({ ...v, fileName: it.fileName, docId: doc.id, warnings: [] });
    }
    visits.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    const mode = z.enum(["hourly", "half_full", "full_day", "task"]).catch((client?.pricingMode as "hourly") ?? "hourly").parse(modeIn || undefined);
    const tax = Number.isFinite(taxIn) ? taxIn : Number(company.defaultTaxRate) || 0;
    const { rates, lines, supplyDates } = priceVisits(visits, client, company, mode, tax);
    return { ok: true, visits, lines, supplyDates, mode, rates, tax };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the SVRs" };
  }
}
