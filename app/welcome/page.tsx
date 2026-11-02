import Link from "next/link";
import { Source_Serif_4 } from "next/font/google";
import { PRODUCT } from "@/lib/mode";
import HeroDemo from "./HeroDemo";
import Reveal from "./Reveal";
import FilmButton from "./FilmButton";
import FeatureVideo from "./FeatureVideo";
import "./landing.css";

const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400"], style: ["normal", "italic"], variable: "--lp-serif" });

export const metadata = {
  title: { absolute: `${PRODUCT.name} · Site visit reports in, invoices out` },
  description: "Invoicing for IT field engineers and technical freelancers in Germany. Upload site visit reports, get priced invoices with the right VAT note, ELSTER figures and bank matching.",
  robots: { index: true, follow: true },
};

const STEPS = [
  { n: "01", t: "Upload the week", d: "Drop in PDFs or phone photos of your site visit reports. They are read in the EU and filed with the client.",
    frag: <div className="lp-frag"><div className="lp-frag-row"><span>IT_19062026.pdf</span><span className="lp-mini"><i style={{ width: "100%" }} /></span><span className="ok">Done</span></div>
      <div className="lp-frag-row"><span>IT_18062026.pdf</span><span className="lp-mini"><i style={{ width: "62%" }} /></span><span className="sienna">Reading · 12 s</span></div></div> },
  { n: "02", t: "Check the lines", d: "Every visit becomes a priced line: half day, full day, hourly or per task, from that client's rates. Missing times are flagged, never guessed.",
    frag: <div className="lp-frag"><div className="lp-frag-row"><span>Support 09.06.2026</span><span className="lp-pill-tag">Half day · 2.5 h</span><b className="num">€ 130.00</b></div>
      <div className="lp-frag-row"><span>Support 18.06.2026</span><span className="lp-pill-tag">Full day · 8.9 h</span><b className="num">€ 230.00</b></div></div> },
  { n: "03", t: "Send it and get paid", d: "Email the PDF with a SEPA QR code. When the money arrives, bank matching finds the invoice and marks it paid.",
    frag: <div className="lp-frag"><div className="lp-frag-row"><span>From Nordlicht IT · Ref 61926</span><b className="num">€ 1,088.00</b></div>
      <div className="lp-frag-row muted"><span>Matches invoice #61926, amount and number</span><span className="lp-mini-btn">Confirm</span></div></div> },
];

const FEATURES: { id: string; t: string; d: string; size: "lg" | "sm"; alt: string }[] = [
  { id: "receipts", size: "lg", t: "Receipts in seconds", d: "Snap the coffee, the taxi, the cables. Date, amount, VAT and shop fill themselves in; billable ones go onto the next invoice.",
    alt: "A taxi receipt is scanned and date, amount, VAT and shop fill the expense form" },
  { id: "bank", size: "lg", t: "Payments that match themselves", d: "Connect your account read-only through your bank's own login. Incoming money finds its invoice by number and amount.",
    alt: "An incoming bank payment links to invoice #61926, which turns paid" },
  { id: "vat", size: "sm", t: "The right VAT note", d: "German client, EU business or outside the EU: the legally required line is printed for you.",
    alt: "Switching the client between Germany, EU business and outside the EU changes the invoice's VAT note" },
  { id: "elster", size: "sm", t: "ELSTER figures", d: "Your VAT pre-return Kennzahlen and EÜR, ready to copy into Mein ELSTER.",
    alt: "The VAT pre-return rows fill in and the amount to pay counts up" },
  { id: "lock", size: "sm", t: "GoBD locking", d: "Sent invoices lock. Corrections go through a credit note with its own number.",
    alt: "A sent invoice locks and a credit note CN-1 cancels it" },
  { id: "numbers", size: "sm", t: "Your numbering", d: "#61927, TSM18092026, IT31102026: running or by date, one prefix per client.",
    alt: "The next invoice number rolls through three numbering formats" },
];

const PLANS = [
  { name: "Start", price: "0", note: "For trying it with real work", items: ["5 invoices a month", "20 report or receipt pages a month", "PDF with SEPA QR", "CSV export"], cta: "Start free", featured: false },
  { name: "Solo", price: "12", note: "For one freelancer, every week", items: ["Unlimited invoices and clients", "200 report or receipt pages a month", "Email invoices and reminders", "ELSTER figures and VAT notes"], cta: "Start free, upgrade later", featured: true },
  { name: "Pro", price: "19", note: "When payments should match themselves", items: ["Everything in Solo", "Bank matching", "600 report or receipt pages a month", "Priority email support"], cta: "Start free, upgrade later", featured: false },
];

const FAQ = [
  ["Where is my data stored?", "The database runs in Frankfurt (AWS eu-central-1). Reports and receipts are read in LlamaCloud's EU region. Your own copies of every PDF and receipt stay in your account."],
  ["Do I need e-invoices (XRechnung, ZUGFeRD)?", "In Germany, businesses must already be able to receive e-invoices. Sending them becomes mandatory from 2027 (over €800,000 turnover) and 2028 for everyone else; small businesses under § 19 appear to be exempt. ZUGFeRD and XRechnung output is the next feature on our roadmap, well before those dates."],
  ["Can it file my VAT return?", "Not directly. ELSTER only accepts filings from its certified ERiC software. Feldbuch gives you every figure with its Kennzahl, so filing in Mein ELSTER takes a couple of minutes."],
  ["I bill clients outside Germany. Does that work?", "Yes. Mark the client as an EU business or outside the EU, and invoices go out without German VAT and with the correct legal note. They are counted in the right fields of your VAT pre-return."],
  ["Can I take my data with me?", "Yes. Invoices, payments, expenses, clients and site visits export as CSV at any time, and every PDF and receipt stays downloadable. You have to keep them for 10 years anyway."],
];

const Mark = () => (
  <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#17191c" /><rect x="9" y="7" width="14" height="18" rx="2" fill="#fbe1d1" /><path d="M12 12h8M12 16h8M12 20h5" stroke="#5d2a1a" strokeWidth="1.8" strokeLinecap="round" /></svg>
);

export default function Welcome() {
  const name = PRODUCT.name;
  return (
    <div className={`lp ${serif.variable}`}>
      <Reveal />
      <nav className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Link href="/welcome" className="lp-brand" aria-label={`${name} home`}><Mark /><span>{name.toLowerCase()}</span></Link>
          <div className="lp-links"><a href="#how">How it works</a><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a></div>
          <div className="lp-nav-cta"><Link href="/sign-in" className="lp-text">Sign in</Link><Link href="/sign-in?mode=up" className="lp-pill">Start free</Link></div>
        </div>
      </nav>

      <header className="lp-wrap lp-hero">
        <p className="lp-eyebrow lp-in" style={{ ["--d" as string]: ".1s" }}><i />For IT field engineers and technical freelancers in Germany</p>
        <h1 className="lp-in" style={{ ["--d" as string]: ".22s" }}><span>Site visit reports in.</span> <span>Invoices <em>out.</em></span></h1>
        <div className="lp-hero-row">
          <div className="lp-hero-copy">
            <p className="lp-sub lp-in" style={{ ["--d" as string]: ".34s" }}>Upload the reports from your week. {name} reads the time on site, travel and parts, prices every visit with your rates and writes the invoice, with the right VAT note for clients at home and abroad.</p>
            <div className="lp-ctas lp-in" style={{ ["--d" as string]: ".46s" }}><Link href="/sign-in?mode=up" className="lp-pill lp-pill-lg">Start free</Link><FilmButton /></div>
            <p className="lp-proof lp-in" style={{ ["--d" as string]: ".58s" }}><span>Made in Hamburg</span><span>GoBD locking</span><span>ELSTER figures</span><span>SEPA QR on every invoice</span></p>
          </div>
          <div className="lp-hero-media"><HeroDemo /></div>
        </div>
      </header>

      <section id="how" className="lp-band lp-fog">
        <div className="lp-wrap">
          <h2 data-reveal>Your Friday paperwork, in three steps</h2>
          <ol className="lp-steps">{STEPS.map((s, i) => (
            <li key={s.n} data-reveal style={{ ["--i" as string]: i }}>
              <div className="lp-step-text"><span className="lp-num">{s.n}</span><h3>{s.t}</h3><p>{s.d}</p></div>
              {s.frag}
            </li>))}</ol>
        </div>
      </section>

      <section id="features" className="lp-band">
        <div className="lp-wrap">
          <h2 data-reveal>Everything a German freelancer <em>has to get right</em></h2>
          <div className="lp-bento">{FEATURES.map((f, i) => (
            <article key={f.id} className={`lp-feat lp-feat-${f.size}`} data-reveal style={{ ["--i" as string]: i % 2 }}>
              <div className="lp-feat-media"><FeatureVideo id={f.id} label={f.alt} /></div>
              <div className="lp-feat-text"><h3>{f.t}</h3><p>{f.d}</p></div>
            </article>))}</div>
        </div>
      </section>

      <section className="lp-wrap" aria-label="Why it exists">
        <figure className="lp-callout" data-reveal>
          <blockquote>Built in Hamburg by a freelance network engineer who was tired of retyping site visit reports on Friday nights.</blockquote>
          <figcaption>Ibrar Ahmad, founder</figcaption>
        </figure>
      </section>

      <section id="pricing" className="lp-band lp-fog">
        <div className="lp-wrap">
          <h2 data-reveal>Simple monthly plans</h2>
          <p className="lp-lede" data-reveal>Prices plus VAT. Cancel any month; your data stays exportable.</p>
          <div className="lp-plans">{PLANS.map((p, i) => (
            <div key={p.name} className={p.featured ? "lp-plan lp-artifact featured" : "lp-plan"} data-reveal style={{ ["--i" as string]: i }}>
              <h3>{p.name}</h3><p className="lp-plan-note">{p.note}</p>
              <p className="lp-price"><span>€</span>{p.price}<small>/ month</small></p>
              <ul>{p.items.map((it) => <li key={it}>{it}</li>)}</ul>
              <Link href="/sign-in?mode=up" className={p.featured ? "lp-pill" : "lp-ghost"}>{p.cta}</Link>
            </div>))}</div>
        </div>
      </section>

      <section id="faq" className="lp-band">
        <div className="lp-wrap lp-faq-wrap">
          <h2 data-reveal>Questions freelancers ask</h2>
          <div className="lp-faq">{FAQ.map(([q, a]) => <details key={q} data-reveal><summary>{q}</summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      <section className="lp-wrap lp-final" data-reveal>
        <h2>Close the week in <em>ten minutes.</em></h2>
        <Link href="/sign-in?mode=up" className="lp-pill lp-pill-lg">Start free</Link>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <span className="lp-brand small"><Mark /><span>{name.toLowerCase()}</span></span>
          <span className="lp-tag">© 2026 {name}</span>
          <nav><Link href="/impressum">Impressum</Link><Link href="/datenschutz">Datenschutz</Link><Link href="/agb">AGB</Link><Link href="/sign-in">Sign in</Link></nav>
        </div>
      </footer>
    </div>
  );
}
