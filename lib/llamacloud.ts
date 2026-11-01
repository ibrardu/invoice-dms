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

export type ExtractStatus = { state: "running" } | { state: "done"; data: Record<string, unknown> } | { state: "failed"; error: string };

/** Uploads the file and starts an extract job. Returns the job id right away. */
export async function startExtract(file: File, dataSchema: object, systemPrompt: string): Promise<string> {
  const fd = new FormData();
  fd.set("file", file, file.name);
  fd.set("purpose", "extract");
  const up = await fetch(`${base()}/api/v1/beta/files${projectQs()}`, { method: "POST", headers: headers(), body: fd, signal: AbortSignal.timeout(60000) });
  if (!up.ok) await fail(up, "upload");
  const fileId = (await up.json()).id as string;
  const start = await fetch(`${base()}/api/v2/extract${projectQs()}`, {
    method: "POST", headers: headers(true), signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ file_input: fileId, configuration: {
      tier: process.env.LLAMA_CLOUD_TIER || "cost_effective", version: "latest", extraction_target: "per_doc",
      data_schema: dataSchema, system_prompt: systemPrompt } }),
  });
  if (!start.ok) await fail(start, "extract");
  const job = await start.json();
  return String(job.id ?? job.job?.id);
}

/** One status check of an extract job. */
export async function checkExtract(jobId: string, fileName = "file"): Promise<ExtractStatus> {
  const r = await fetch(`${base()}/api/v2/extract/${encodeURIComponent(jobId)}${projectQs()}`, { headers: headers(), signal: AbortSignal.timeout(30000) });
  if (!r.ok) await fail(r, "status");
  const j = await r.json();
  const status = String(j.status ?? j.job?.status ?? "").toUpperCase();
  if (status === "COMPLETED" || status === "SUCCESS") {
    const result = j.extract_result ?? j.data ?? j.result;
    const obj = Array.isArray(result) ? result[0] : result;
    if (!obj || typeof obj !== "object") return { state: "failed", error: `No data found in ${fileName}` };
    return { state: "done", data: obj as Record<string, unknown> };
  }
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED"].includes(status)) return { state: "failed", error: `LlamaParse could not read ${fileName}` };
  return { state: "running" };
}

/** Runs LlamaExtract on one file and waits for the result (used where no progress UI is needed). */
export async function llamaExtract(file: File, dataSchema: object, systemPrompt: string): Promise<Record<string, unknown>> {
  const jobId = await startExtract(file, dataSchema, systemPrompt);
  const deadline = Date.now() + 120000;
  let wait = 1000;
  while (Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, wait));
    wait = Math.min(wait * 1.5, 5000);
    const st = await checkExtract(jobId, file.name);
    if (st.state === "done") return st.data;
    if (st.state === "failed") throw new Error(st.error);
  }
  throw new Error("LlamaCloud took too long. Try again in a minute.");
}
