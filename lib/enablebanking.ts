import "server-only";
import { createSign } from "node:crypto";

// Enable Banking (Finland), PSD2 account information, read-only. Free "restricted" mode for your own accounts.
// Env: ENABLE_BANKING_APP_ID, ENABLE_BANKING_PRIVATE_KEY (PEM of the key generated when registering the app).
const API = "https://api.enablebanking.com";
export const bankEnabled = () => !!process.env.ENABLE_BANKING_APP_ID && !!process.env.ENABLE_BANKING_PRIVATE_KEY;

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: process.env.ENABLE_BANKING_APP_ID }));
  const body = b64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 }));
  const key = process.env.ENABLE_BANKING_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(key);
  return `${head}.${body}.${b64url(sig)}`;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method, headers: { Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 300);
    if (r.status === 401) throw new Error("Enable Banking rejected the app key. Check ENABLE_BANKING_APP_ID and the private key.");
    throw new Error(`Bank service error ${r.status}: ${t}`);
  }
  return (r.status === 204 ? {} : await r.json()) as T;
}

export type Aspsp = { name: string; country: string; logo?: string };
export async function listBanks(country: string) {
  const r = await call<{ aspsps?: Aspsp[] }>("GET", `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal`);
  return (r.aspsps ?? []).map((a) => ({ name: a.name, country: a.country, logo: a.logo }));
}

export async function startAuth(bank: string, country: string, state: string, redirectUrl: string, days = 180) {
  const validUntil = new Date(Date.now() + days * 86400000).toISOString();
  const r = await call<{ url: string }>("POST", "/auth", { access: { valid_until: validUntil }, aspsp: { name: bank, country }, state, redirect_url: redirectUrl, psu_type: "personal" });
  return r.url;
}

type RawAccount = { uid: string; account_id?: { iban?: string }; name?: string; currency?: string };
export async function createSession(code: string) {
  const r = await call<{ session_id: string; accounts?: RawAccount[]; access?: { valid_until?: string } }>("POST", "/sessions", { code });
  return { sessionId: r.session_id, validUntil: r.access?.valid_until ? new Date(r.access.valid_until) : null,
    accounts: (r.accounts ?? []).map((a) => ({ uid: a.uid, iban: a.account_id?.iban ?? "", name: a.name ?? "", currency: a.currency ?? "" })) };
}

export async function deleteSession(sessionId: string) { await call("DELETE", `/sessions/${encodeURIComponent(sessionId)}`).catch(() => {}); }

export type BankTx = { externalId: string; bookingDate: string; amountCents: number; currency: string; counterparty: string; reference: string };
type RawTx = { entry_reference?: string; transaction_id?: string; transaction_amount?: { amount?: string; currency?: string };
  credit_debit_indicator?: string; booking_date?: string; value_date?: string; transaction_date?: string;
  remittance_information?: string[]; debtor?: { name?: string }; creditor?: { name?: string } };

/** Incoming and outgoing transactions since dateFrom, all pages. */
export async function fetchTransactions(accountUid: string, dateFrom: string): Promise<BankTx[]> {
  const out: BankTx[] = [];
  let cont = "";
  for (let page = 0; page < 20; page++) {
    const r = await call<{ transactions?: RawTx[]; continuation_key?: string }>("GET",
      `/accounts/${encodeURIComponent(accountUid)}/transactions?date_from=${dateFrom}${cont ? `&continuation_key=${encodeURIComponent(cont)}` : ""}`);
    for (const t of r.transactions ?? []) {
      const amt = Math.round(Number(t.transaction_amount?.amount ?? 0) * 100);
      const credit = t.credit_debit_indicator ? t.credit_debit_indicator === "CRDT" : amt > 0;
      const date = t.booking_date ?? t.value_date ?? t.transaction_date ?? "";
      if (!date) continue;
      const ref = (t.remittance_information ?? []).join(" ").slice(0, 500);
      out.push({ externalId: t.entry_reference || t.transaction_id || `${accountUid}:${date}:${amt}:${ref.slice(0, 40)}`,
        bookingDate: date.slice(0, 10), amountCents: credit ? Math.abs(amt) : -Math.abs(amt), currency: t.transaction_amount?.currency ?? "EUR",
        counterparty: (credit ? t.debtor?.name : t.creditor?.name) ?? "", reference: ref });
    }
    if (!r.continuation_key) break;
    cont = r.continuation_key;
  }
  return out;
}
