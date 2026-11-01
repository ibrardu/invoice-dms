"use server";
import { and, eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { z } from "zod";
import { extractText, getDocumentProxy } from "unpdf";
import { db, documents, clients } from "./db";
import { requireTenant } from "./auth";
import { getCompany } from "./actions";
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
    if (!process.env.LLAMA_API_URL || !process.env.LLAMA_MODEL) return { ok: false, error: "Llama API is not configured (LLAMA_API_URL, LLAMA_MODEL)." };
    const files = f.getAll("svr").filter((x): x is File => x instanceof File && x.size > 0);
    if (!files.length) return { ok: false, error: "Choose one or more SVR files." };
    if (files.length > 15) return { ok: false, error: "Up to 15 SVRs at a time." };
    const company = await getCompany(tenantId);
    const clientId = String(f.get("clientId") ?? "");
    const [client] = clientId ? await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))) : [];
    const tax = Number(f.get("taxRate") ?? company.defaultTaxRate) || 0;

    const visits: Visit[] = await Promise.all(files.map(async (file) => {
      if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB`);
      const text = (await fileToText(file)).slice(0, 30000);
      if (text.trim().length < 20) throw new Error(`${file.name}: no readable text (scanned PDF?)`);
      const v = await llama(text);
      // Recompute hours from times; don't trust model arithmetic.
      const h = hoursBetween(v.start, v.end);
      v.hours = h || (v.start && v.end ? v.hours : 0);
      const warnings: string[] = [];
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
      const blob = await put(`${tenantId}/${crypto.randomUUID()}-${safe}`, file, { access: "private", contentType: file.type || "application/octet-stream" });
      const [doc] = await db.insert(documents).values({ tenantId, uploadedBy: userId, clientId: client?.id ?? null,
        title: `SVR ${v.date ?? ""} ${v.ticket ?? ""}`.replace(/\s+/g, " ").trim(), fileName: file.name,
        contentType: file.type || "application/octet-stream", sizeBytes: file.size, blobPath: blob.pathname, category: "svr",
        tags: [v.ticket, v.endCustomer, v.site, v.engineer].filter(Boolean).join(", ") }).returning({ id: documents.id });
      return { ...v, fileName: file.name, docId: doc.id, warnings };
    }));
    visits.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

    const mode = z.enum(["hourly", "half_full", "full_day", "task"]).catch((client?.pricingMode as "hourly") ?? "hourly").parse(f.get("mode"));
    const rates: Rates = {
      half: (client?.halfDayRateCents ?? 0) / 100, full: (client?.fullDayRateCents ?? 0) / 100,
      halfMax: Number(client?.halfDayMaxHours ?? 4), task: (client?.taskRateCents ?? 0) / 100,
      hourly: ((client?.hourlyRateCents || company.hourlyRateCents) ?? 0) / 100,
      travel: ((client?.travelFlatCents || company.travelRateCents) ?? 0) / 100,
    };
    const travel = rates.travel;
    const support: Line[] = [], extra: Line[] = [];
    for (const v of visits) {
      const { line, warnings } = priceVisit(v, mode, rates, tax, v.docId);
      support.push(line); v.warnings.push(...warnings);
      if (travel) extra.push({ description: `Travel ${dmy(v.date)}`.trim(), quantity: 1, unitPrice: travel, taxRate: tax });
      v.expenses.forEach((x) => extra.push({ description: x.description, quantity: 1, unitPrice: x.amount ?? 0, taxRate: tax }));
      v.materials.forEach((m) => extra.push({ description: m.description, quantity: m.quantity || 1, unitPrice: m.unitPrice ?? 0, taxRate: tax }));
    }

    // "June 9, 16, 18 & 19 2026" style, like the existing invoices.
    const ds = [...new Set(visits.map((v) => v.date).filter((d): d is string => !!d))].map((d) => new Date(d + "T00:00:00Z"));
    let supplyDates = "";
    if (ds.length) {
      const sameMonth = ds.every((d) => d.getUTCMonth() === ds[0].getUTCMonth() && d.getUTCFullYear() === ds[0].getUTCFullYear());
      const month = (d: Date) => d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
      const days = ds.map((d) => d.getUTCDate());
      supplyDates = sameMonth
        ? `${month(ds[0])} ${days.length > 1 ? days.slice(0, -1).join(", ") + " & " + days.at(-1) : days[0]}, ${ds[0].getUTCFullYear()}`
        : ds.map((d) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })).join(", ");
    }
    return { ok: true, visits, lines: [...support, ...extra], supplyDates, mode, rates, tax };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read SVR" };
  }
}
