// Field mapping layer (form-filler pattern): source field -> form field + transform, kept as config.
// Shared by the browser (autofill, pre-submit checks) and the server (authoritative validation).
import { EXPENSE_CATEGORIES } from "./expense-categories";

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dez: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

export const transforms = {
  /** 2026-06-19, 19.06.2026, 19/06/2026, 19.06.26, 19 Jun 2026 -> 2026-06-19, else null */
  date(v: unknown): string | null {
    const s = String(v ?? "").trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return valid(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (m) return valid(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    m = s.match(/^(\d{1,2})\.?\s*([a-zäA-Z]{3})[a-z]*\.?\s*(\d{4})$/);
    if (m && MONTHS[m[2].toLowerCase()]) return valid(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    return null;
    function valid(y: number, mo: number, d: number) {
      const t = new Date(Date.UTC(y, mo - 1, d));
      return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : null;
    }
  },
  /** 12.5, "12,50", "1.234,56", "€ 1,234.56" -> "12.50" / "1234.56", else null */
  amount(v: unknown): string | null {
    if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v.toFixed(2) : null;
    let s = String(v ?? "").replace(/[^\d.,-]/g, "");
    if (!s) return null;
    const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");   // German 1.234,56
    else s = s.replace(/,/g, "");                                           // English 1,234.56
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
  },
  /** VAT close to a German rate snaps to it (18.99 -> 19); otherwise kept */
  vat(v: unknown): string | null {
    const n = Number(String(v ?? "").replace(",", ".").replace("%", ""));
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    const snap = [0, 7, 19].find((r) => Math.abs(r - n) <= 0.5);
    return String(snap ?? Math.round(n * 100) / 100);
  },
  currency(v: unknown): string | null {
    const s = String(v ?? "").trim().toUpperCase();
    if (s === "€") return "EUR";
    if (s === "$") return "USD";
    if (s === "£") return "GBP";
    return /^[A-Z]{3}$/.test(s) ? s : null;
  },
  category(v: unknown): string | null {
    const s = String(v ?? "");
    return EXPENSE_CATEGORIES.some(([k]) => k === s) ? s : null;
  },
  text(v: unknown): string | null {
    const s = String(v ?? "").replace(/\s+/g, " ").trim();
    return s ? s.slice(0, 200) : null;
  },
};

export type FieldMap = { source: string; field: string; label: string; transform: keyof typeof transforms; required?: boolean }[];

/** Receipt (LlamaExtract output) -> expense form fields. */
export const RECEIPT_TO_EXPENSE: FieldMap = [
  { source: "date", field: "spentOn", label: "date", transform: "date", required: true },
  { source: "total", field: "amount", label: "amount", transform: "amount", required: true },
  { source: "description", field: "description", label: "description", transform: "text" },
  { source: "vendor", field: "vendor", label: "shop", transform: "text" },
  { source: "vatRate", field: "vatRate", label: "VAT", transform: "vat" },
  { source: "currency", field: "currency", label: "currency", transform: "currency" },
  { source: "category", field: "category", label: "category", transform: "category" },
  { source: "paymentMethod", field: "paymentMethod", label: "payment method", transform: "text" },
];

/** Applies a map. Missing-data policy: skip the field and report it (never invent a value). */
export function applyMap(data: Record<string, unknown>, map: FieldMap) {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const m of map) {
    const v = transforms[m.transform](data[m.source]);
    if (v != null) values[m.field] = v;
    else if (m.required) missing.push(m.label);
  }
  return { values, missing, recognised: map.some((m) => m.required && values[m.field] != null) };
}

/** The expense form's rules, in one place. Returns field -> message. */
export function validateExpense(v: Record<string, string>, todayIso: string) {
  const e: Record<string, string> = {};
  const date = transforms.date(v.spentOn);
  if (!date) e.spentOn = "Enter a valid date";
  else if (date > addDays(todayIso, 1)) e.spentOn = "Date is in the future";
  else if (date < addDays(todayIso, -3 * 366)) e.spentOn = "Date is more than 3 years ago";
  const amount = transforms.amount(v.amount);
  if (!amount) e.amount = "Enter the amount from the receipt";
  else if (Number(amount) > 50000) e.amount = "Amount looks too high, please check";
  if (!transforms.text(v.description)) e.description = "Say what it was for, e.g. Coffee on site";
  if (v.vatRate && transforms.vat(v.vatRate) == null) e.vatRate = "VAT must be between 0 and 100";
  if (v.currency && !transforms.currency(v.currency)) e.currency = "Use a 3-letter code like EUR";
  if (v.billable === "on" && !v.clientId) e.clientId = "Pick the client to charge";
  return e;
}

function addDays(d: string, n: number) {
  const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10);
}
