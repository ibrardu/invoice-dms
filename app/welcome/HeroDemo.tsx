"use client";
import { useEffect, useRef, useState } from "react";

// The signature: a real site visit report becomes invoice lines.
// Steps (900ms apart): 1 highlight times → 2 line one → 3 highlight taxi → 4 line two → 5 total counts up → 6 QR + chip.
const STEPS = 6, STEP_MS = 900, HOLD_MS = 3200;

export default function HeroDemo() {
  const root = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setStep(STEPS); setTotal(34300); return; }
    let visible = true, timer: ReturnType<typeof setTimeout>;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.2 });
    if (root.current) io.observe(root.current);
    const run = (s: number) => {
      if (!visible) { timer = setTimeout(() => run(s), 500); return; }
      setStep(s);
      if (s === 5) {                                   // count the total up over 900ms
        const t0 = performance.now();
        const tick = (t: number) => { const p = Math.min(1, (t - t0) / 900); setTotal(Math.round(34300 * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }
      if (s < STEPS) timer = setTimeout(() => run(s + 1), STEP_MS);
      else timer = setTimeout(() => { setStep(0); setTotal(0); timer = setTimeout(() => run(1), 600); }, HOLD_MS);
    };
    timer = setTimeout(() => run(1), 1200);
    return () => { clearTimeout(timer); io.disconnect(); };
  }, []);

  const eur = (c: number) => `€ ${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className="lp-demo" ref={root} aria-label="A site visit report from 19 June 2026 turning into invoice lines: support 230 euros and taxi 113 euros, total 343 euros">
      <article className="lp-artifact lp-report" aria-hidden="true">
        <header><span className="lp-tag">Site visit report</span><span className="num">19.06.2026</span></header>
        <dl>
          <div><dt>Ticket</dt><dd className="num">CHG0260260</dd></div>
          <div><dt>Engineer</dt><dd>Ibrar Ahmed</dd></div>
          <div className={step >= 1 ? "hl on" : "hl"}><dt>Time onsite</dt><dd className="num">08:46</dd></div>
          <div className={step >= 1 ? "hl on" : "hl"}><dt>Time left site</dt><dd className="num">17:32</dd></div>
        </dl>
        <p className="lp-actions">Stacked access switches SW11 and SW12, patched the core uplinks. Fibre delivery missed, <span className={step >= 3 ? "hl-inline on" : "hl-inline"}>took a taxi to the supplier&apos;s warehouse</span> for 4 × OM3 LC/LC.</p>
      </article>

      <svg className="lp-arrow" viewBox="0 0 64 24" aria-hidden="true"><path d="M2 12h56m-8-8 8 8-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>

      <article className="lp-artifact lp-invoice" aria-hidden="true">
        <header><span className="lp-serif">Invoice #61927</span><span className={step >= 6 ? "lp-chip on" : "lp-chip"}>Ready to send</span></header>
        <div className="lp-lines">
          <div className="lp-th"><span>Description</span><span>Amount</span></div>
          <div className={step >= 2 ? "lp-line on" : "lp-line"}><span>Support 19.06.2026 <em>8.8 h · full day</em></span><span className="num">€ 230.00</span></div>
          <div className={step >= 4 ? "lp-line on" : "lp-line"}><span>Taxi for cable procurement</span><span className="num">€ 113.00</span></div>
        </div>
        <footer>
          <div className={step >= 6 ? "lp-qr on" : "lp-qr"}>
            <svg viewBox="0 0 21 21" shapeRendering="crispEdges"><path fill="currentColor" d="M0 0h7v7H0zM1 1v5h5V1zM2 2h3v3H2zM14 0h7v7h-7zM15 1v5h5V1zM16 2h3v3h-3zM0 14h7v7H0zM1 15v5h5v-5zM2 16h3v3H2zM9 0h1v2H9zM11 1h2v1h-2zM8 3h2v2H8zM11 3h1v3h-1zM9 6h2v2H9zM8 9h3v1H8zM13 8h2v2h-2zM16 9h2v1h-2zM19 8h2v3h-2zM0 9h2v2H0zM3 8h3v1H3zM4 10h2v2H4zM9 11h2v3H9zM12 11h3v1h-3zM14 13h2v2h-2zM17 12h1v3h-1zM19 13h2v1h-2zM8 15h2v2H8zM11 15h2v1h-2zM12 17h3v1h-3zM16 16h2v2h-2zM19 16h2v1h-2zM9 18h2v3H9zM13 19h3v2h-3zM18 19h3v2h-3z" /></svg>
            <span>SEPA QR</span>
          </div>
          <div className="lp-total"><span>Total</span><b className="num">{eur(total)}</b></div>
        </footer>
      </article>
    </div>
  );
}
