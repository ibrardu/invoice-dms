// German VAT pre-return (UStVA) and EÜR figures, computed from invoices, payments and expenses.
// Pure function: data in, figures out. Kennzahl numbers follow the UStVA form (check against the current year's form).
export type Treatment = "domestic" | "eu_reverse" | "non_eu";
export type TaxInvoice = { id: string; number: string; client: string; treatment: Treatment; issueDate: string; status: string; totalCents: number; hasCreditNote?: boolean;
  lines: { netCents: number; rate: number }[] };
export type TaxPayment = { invoiceId: string; paidOn: string; amountCents: number };
export type TaxExpense = { spentOn: string; grossCents: number; vatRate: number; currency: string; category: string };
export type Period = { from: string; to: string };          // [from, to)

export type Bucket = { netCents: number; taxCents: number };
export type TaxResult = {
  kz81: Bucket; kz86: Bucket; otherRate: Bucket; kz21: Bucket; kz45: Bucket;
  kz66: number; kz83: number;
  income: { taxableNetCents: number; nonTaxableNetCents: number; vatReceivedCents: number };
  expenses: { category: string; netCents: number; vatCents: number }[];
  warnings: string[];
  sources: { number: string; client: string; share: number; treatment: Treatment }[];
};

const inP = (d: string, p: Period) => d >= p.from && d < p.to;
const empty = (): Bucket => ({ netCents: 0, taxCents: 0 });

export function computeTax(p: Period, basis: "ist" | "soll", invoices: TaxInvoice[], payments: TaxPayment[], expenses: TaxExpense[], currency = "EUR"): TaxResult {
  const r: TaxResult = { kz81: empty(), kz86: empty(), otherRate: empty(), kz21: empty(), kz45: empty(), kz66: 0, kz83: 0,
    income: { taxableNetCents: 0, nonTaxableNetCents: 0, vatReceivedCents: 0 }, expenses: [], warnings: [], sources: [] };

  for (const inv of invoices) {
    // Drafts never count. A cancelled invoice still counts if a credit note reverses it (the credit note carries the minus).
    if (inv.status === "draft" || (inv.status === "cancelled" && !inv.hasCreditNote)) continue;
    // Share of the invoice that falls in this period: Ist = paid in period / total, Soll = issued in period.
    let share = 0;
    if (basis === "soll") share = inP(inv.issueDate, p) ? 1 : 0;
    else if (inv.totalCents !== 0) {
      // Ist: share actually paid in the period. For a credit note that is the refund (negative over negative).
      const paid = payments.filter((x) => x.invoiceId === inv.id && inP(x.paidOn, p)).reduce((a, x) => a + x.amountCents, 0);
      share = Math.min(1, paid / inv.totalCents);
    }
    if (share <= 0) continue;
    r.sources.push({ number: inv.number, client: inv.client, share, treatment: inv.treatment });
    for (const l of inv.lines) {
      const net = Math.round(l.netCents * share);
      const tax = Math.round(l.netCents * l.rate / 100 * share);
      if (inv.treatment === "eu_reverse") { r.kz21.netCents += net; r.income.nonTaxableNetCents += net; if (l.rate) r.warnings.push(`${inv.number}: EU reverse charge invoice has ${l.rate}% VAT on a line; it should be 0%`); continue; }
      if (inv.treatment === "non_eu") { r.kz45.netCents += net; r.income.nonTaxableNetCents += net; if (l.rate) r.warnings.push(`${inv.number}: client outside the EU but a line has ${l.rate}% VAT`); continue; }
      const b = l.rate === 19 ? r.kz81 : l.rate === 7 ? r.kz86 : r.otherRate;
      b.netCents += net; b.taxCents += tax;
      r.income.taxableNetCents += net; r.income.vatReceivedCents += tax;
      if (l.rate === 0) r.warnings.push(`${inv.number}: German client invoiced with 0% VAT. Set the client to EU or outside the EU, or add VAT.`);
    }
  }

  // Input VAT (Vorsteuer) from expenses in the period, by date spent. Only the home currency counts.
  const byCat = new Map<string, { netCents: number; vatCents: number }>();
  let foreign = 0;
  for (const e of expenses) {
    if (!inP(e.spentOn, p)) continue;
    if (e.currency !== currency) { foreign++; continue; }
    const net = Math.round(e.grossCents / (1 + e.vatRate / 100));
    const vat = e.grossCents - net;
    r.kz66 += vat;
    const c = byCat.get(e.category) ?? { netCents: 0, vatCents: 0 };
    c.netCents += net; c.vatCents += vat; byCat.set(e.category, c);
  }
  if (foreign) r.warnings.push(`${foreign} expense(s) in another currency are not included`);
  r.expenses = [...byCat].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.netCents - a.netCents);
  r.kz83 = r.kz81.taxCents + r.kz86.taxCents + r.otherRate.taxCents - r.kz66;
  r.warnings = [...new Set(r.warnings)];
  return r;
}

/** Period helpers: month 1-12, quarter 1-4. */
export function periodOf(year: number, kind: "month" | "quarter" | "year", n = 1): Period {
  const pad = (x: number) => String(x).padStart(2, "0");
  if (kind === "year") return { from: `${year}-01-01`, to: `${year + 1}-01-01` };
  const m0 = kind === "month" ? n : (n - 1) * 3 + 1, m1 = kind === "month" ? n + 1 : m0 + 3;
  return { from: `${year}-${pad(m0)}-01`, to: m1 > 12 ? `${year + 1}-01-01` : `${year}-${pad(m1)}-01` };
}

/** Legal note printed on the invoice, by company VAT status and client treatment. */
export function vatNote(vatStatus: string, treatment: string, ownVatId: string, clientVatId: string): string {
  if (vatStatus === "kleinunternehmer") return "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet. (Small business: no VAT charged under § 19 UStG.)";
  if (treatment === "eu_reverse") return `Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG). Reverse charge: VAT to be accounted for by the recipient.${clientVatId ? ` Customer VAT ID: ${clientVatId}.` : ""}${ownVatId ? ` Our VAT ID: ${ownVatId}.` : ""}`;
  if (treatment === "non_eu") return "Nicht im Inland steuerbare Leistung (§ 3a Abs. 2 UStG). Service not taxable in Germany: place of supply is outside Germany.";
  return "";
}
