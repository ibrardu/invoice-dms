import "server-only";

// LlamaCloud (LlamaParse / LlamaExtract) client, EU region by default.
// Flow: upload file -> start extract job with a JSON schema -> poll -> extract_result.
// Docs: developers.llamaindex.ai/llamaparse/extract/api and /general/regions
const base = () => (process.env.LLAMA_CLOUD_BASE_URL || "https://api.cloud.eu.llamaindex.ai").replace(/\/$/, "");

export const llamaCloudEnabled = () => !!process.env.LLAMA_CLOUD_API_KEY;

function headers(json = false): Record<string, string> {
  return { Authorization: `Bearer ${process.env.LLAMA_CLOUD_API_KEY}`, Accept: "application/json", ...(json ? { "Content-Type": "application/json" } : {}) };
}
const projectQs = () => process.env.LLAMA_CLOUD_PROJECT_ID ? `?project_id=${encodeURIComponent(process.env.LLAMA_CLOUD_PROJECT_ID)}` : "";

async function fail(r: Response, step: string): Promise<never> {
  const body = (await r.text()).slice(0, 300);
  if (r.status === 401 || r.status === 403) throw new Error("LlamaCloud rejected the API key. EU keys only work with the EU address (cloud.eu.llamaindex.ai).");
  if (r.status === 402) throw new Error("LlamaCloud free credits are used up for this month.");
  throw new Error(`LlamaCloud ${step} failed (${r.status}): ${body}`);
}

/** Runs LlamaExtract on one file and returns the extracted JSON object. */
export async function llamaExtract(file: File, dataSchema: object, systemPrompt: string): Promise<Record<string, unknown>> {
  // 1. upload
  const fd = new FormData();
  fd.set("file", file, file.name);
  fd.set("purpose", "extract");
  const up = await fetch(`${base()}/api/v1/beta/files${projectQs()}`, { method: "POST", headers: headers(), body: fd, signal: AbortSignal.timeout(60000) });
  if (!up.ok) await fail(up, "upload");
  const fileId = (await up.json()).id as string;

  // 2. start extraction (cost_effective tier: ~8 credits per page including parsing)
  const start = await fetch(`${base()}/api/v2/extract${projectQs()}`, {
    method: "POST", headers: headers(true), signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ file_input: fileId, configuration: {
      tier: process.env.LLAMA_CLOUD_TIER || "cost_effective", version: "latest", extraction_target: "per_doc",
      data_schema: dataSchema, system_prompt: systemPrompt } }),
  });
  if (!start.ok) await fail(start, "extract");
  const job = await start.json();
  const jobId = (job.id ?? job.job?.id) as string;

  // 3. poll until done (max ~2 minutes)
  const deadline = Date.now() + 120000;
  let wait = 1000;
  while (Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, wait));
    wait = Math.min(wait * 1.5, 5000);
    const r = await fetch(`${base()}/api/v2/extract/${jobId}${projectQs()}`, { headers: headers(), signal: AbortSignal.timeout(30000) });
    if (!r.ok) await fail(r, "status");
    const j = await r.json();
    const status = String(j.status ?? j.job?.status ?? "").toUpperCase();
    if (status === "COMPLETED" || status === "SUCCESS") {
      const result = j.extract_result ?? j.data ?? j.result;
      const obj = Array.isArray(result) ? result[0] : result;
      if (!obj || typeof obj !== "object") throw new Error("LlamaCloud returned no data for this file");
      return obj as Record<string, unknown>;
    }
    if (["FAILED", "ERROR", "CANCELLED", "CANCELED"].includes(status)) throw new Error(`LlamaCloud could not read ${file.name} (${status.toLowerCase()})`);
  }
  throw new Error("LlamaCloud took too long. Try again in a minute.");
}
