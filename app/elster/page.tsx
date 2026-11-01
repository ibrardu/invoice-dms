import Link from "next/link";
import { requireTenant } from "@/lib/auth";
import { getCompany } from "@/lib/actions";
import { loadTax } from "@/lib/tax-data";
import { periodOf } from "@/lib/tax";
import { categoryLabel } from "@/lib/expense-categories";
import { today } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "ELSTER" };
const eur = (c: number) => (c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (c: number) => Math.trunc(c / 100).toLocaleString("de-DE");   // UStVA bases are entered in full euros

export default async function Elster({ searchParams }: { searchParams: Promise<{ year?: string; p?: string }> }) {
  const { tenantId } = await requireTenant();
  const company = await getCompany(tenantId);
  if (!company.elsterEnabled) return <div className="card"><h1>ELSTER</h1><p className="muted">Turn on <Link href="/settings">Settings &gt; Tax and ELSTER</Link> to use this page.</p></div>;
  const sp = await searchParams;
  const now = today();
  const year = Number(sp.year) || Number(now.slice(0, 4));
  const monthly = company.vatPeriod === "monthly";
  const curIdx = monthly ? Number(now.slice(5, 7)) : Math.ceil(Number(now.slice(5, 7)) / 3);
  const idx = Math.min(monthly ? 12 : 4, Math.max(1, Number(sp.p) || curIdx));
  const period = periodOf(year, monthly ? "month" : "quarter", idx);
  const basis = company.taxBasis === "soll" ? "soll" : "ist";
  const [r, yr] = await Promise.all([loadTax(tenantId, period, basis, company.currency), loadTax(tenantId, periodOf(year, "year"), basis, company.currency)]);
  const klein = company.vatStatus === "kleinunternehmer";
  const label = monthly ? new Date(Date.UTC(year, idx - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : `Q${idx} ${year}`;
  const zahllast = r.kz83;
  const rows: [string, string, string, string][] = [
    ["81", "Taxable sales at 19 % (net)", whole(r.kz81.netCents), eur(r.kz81.taxCents)],
    ["86", "Taxable sales at 7 % (net)", whole(r.kz86.netCents), eur(r.kz86.taxCents)],
    ["21", "Services to EU businesses, reverse charge (net)", whole(r.kz21.netCents), ""],
    ["45", "Services not taxable in Germany, e.g. clients outside the EU (net)", whole(r.kz45.netCents), ""],
    ["66", "Input VAT from your expenses (Vorsteuer)", "", eur(r.kz66)],
    ["83", zahllast >= 0 ? "VAT to pay" : "VAT refund", "", eur(zahllast)],
  ];
  const yrIncome = yr.income.taxableNetCents + yr.income.nonTaxableNetCents;
  const yrExpenses = yr.expenses.reduce((a, e) => a + e.netCents, 0);

  return (
    <div className="stagger">
      <div className="ov-title">
        <div><h1>ELSTER, {label}</h1>
          <p className={zahllast > 0 && !klein ? "callout" : "callout calm"}>{klein ? "Small business (§ 19 UStG): no VAT pre-return needed. Use the EÜR figures below for your yearly return."
            : `${zahllast >= 0 ? "VAT to pay" : "VAT refund"}: € ${eur(Math.abs(zahllast))}. Counted on ${basis === "ist" ? "payments received" : "invoices issued"}.`}</p></div>
        <form className="row">
          <select name="year" defaultValue={year} aria-label="Year" style={{ width: 96 }}>{[0, 1, 2, 3].map((i) => <option key={i}>{Number(now.slice(0, 4)) - i}</option>)}</select>
          <select name="p" defaultValue={idx} aria-label="Period" style={{ width: 150 }}>
            {(monthly ? Array.from({ length: 12 }, (_, i) => [i + 1, new Date(Date.UTC(2000, i, 1)).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })])
              : [[1, "Q1 (Jan to Mar)"], [2, "Q2 (Apr to Jun)"], [3, "Q3 (Jul to Sep)"], [4, "Q4 (Oct to Dec)"]]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <button className="ghost">Apply</button>
          <a className="btn ghost" href={`/api/export?type=ustva&year=${year}&p=${idx}`}>CSV</a>
        </form>
      </div>

      {r.warnings.length > 0 && <section className="card"><h2>Check before filing</h2><ul style={{ margin: 0, paddingLeft: 18 }}>{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul></section>}

      {!klein && <section className="card">
        <div className="head"><h2>Umsatzsteuer-Voranmeldung</h2><a className="muted" href="https://www.elster.de/eportal/formulare-leistungen/alleformulare/ustva" target="_blank" rel="noreferrer">Open in Mein ELSTER</a></div>
        <p className="muted" style={{ marginTop: 0 }}>Copy each figure into the field with the same Kennzahl (Kz). Bases are full euros, tax amounts with cents.{company.taxNumber ? ` Tax number ${company.taxNumber}.` : ""}</p>
        <table>
          <thead><tr><th>Kz</th><th>Field</th><th className="r">Base (€)</th><th className="r">Tax (€)</th></tr></thead>
          <tbody>{rows.map(([kz, l, b, t]) => <tr key={kz}><td className="num"><b>{kz}</b></td><td>{l}</td><td className="r money">{b}</td><td className="r money">{t}</td></tr>)}</tbody>
        </table>
        {r.otherRate.netCents !== 0 && <p className="late">Some German-client lines use a rate other than 19 % or 7 % (€ {eur(r.otherRate.netCents)} net). Check them.</p>}
        {r.sources.length > 0 && <details style={{ marginTop: 12 }}><summary className="muted">Which invoices are included ({r.sources.length})</summary>
          <table><tbody>{r.sources.map((x) => <tr key={x.number}><td>{x.number}</td><td>{x.client}</td><td className="muted">{x.treatment === "domestic" ? "Germany" : x.treatment === "eu_reverse" ? "EU reverse charge" : "Outside EU"}</td>
            <td className="r num">{Math.round(x.share * 100)} %</td></tr>)}</tbody></table></details>}
      </section>}

      <section className="card">
        <div className="head"><h2>EÜR {year}</h2><a className="btn ghost small" href={`/api/export?type=euer&year=${year}`}>CSV</a></div>
        <p className="muted" style={{ marginTop: 0 }}>Income and costs for the Anlage EÜR, counted on {basis === "ist" ? "money received and spent" : "invoices issued"}. Net amounts.</p>
        <table><tbody>
          <tr><td>Income subject to German VAT</td><td className="r money">{eur(yr.income.taxableNetCents)}</td></tr>
          <tr><td>Income not taxable in Germany / reverse charge</td><td className="r money">{eur(yr.income.nonTaxableNetCents)}</td></tr>
          {!klein && <tr><td>VAT received from clients</td><td className="r">{eur(yr.income.vatReceivedCents)}</td></tr>}
          {yr.expenses.map((e) => <tr key={e.category}><td>Expenses: {categoryLabel(e.category)}</td><td className="r">−{eur(e.netCents)}</td></tr>)}
          {!klein && <tr><td>Input VAT paid (Vorsteuer)</td><td className="r">{eur(yr.kz66)}</td></tr>}
          <tr><td><b>Profit before tax (income − expenses, net)</b></td><td className="r money">{eur(yrIncome - yrExpenses)}</td></tr>
        </tbody></table>
        <p className="muted">Billable expenses charged on to clients are left out, because they come back as income. Mileage, home office and depreciation are not included.</p>
      </section>

      <p className="muted">These figures help you fill in ELSTER; they are not tax advice. Filing directly from this app is not possible: ELSTER only accepts submissions through its certified ERiC software.</p>
    </div>
  );
}
