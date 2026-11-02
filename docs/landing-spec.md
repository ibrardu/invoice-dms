# Feldbuch · site visit reports in, invoices out

## 0. Brief
Build a 7-section landing page for **Feldbuch**, invoicing software for IT field engineers and technical freelancers in Germany.
Aesthetic: paper, ink, warm peach, exact, unhurried.
Signature idea: the hero shows a real site visit report turning into an invoice: the time on site and the taxi highlight on the report, the matching invoice lines write themselves in, the total counts up and a SEPA QR settles in. Built in code from the product itself; no stock video.
Fidelity: build exactly as specified; no extra sections, badges, gradients or decorations.

## 1. Stack & files
Existing Next.js 16 app. Route `app/welcome/page.tsx` (server, public), `app/welcome/landing.css` (scoped under `.lp`), `app/welcome/HeroDemo.tsx` and `app/welcome/Reveal.tsx` (client). Icons: inline SVG only.

## 2. Fonts
| Role | Family | Weights/style | Used on |
|---|---|---|---|
| Display | Source Serif 4 | 400, 400 italic | H1, H2, the italic accent words, prices |
| Body/UI | Geist | 400/500/600 | nav, body, buttons, product fragments |
Loaded with `next/font` (self-hosted, no layout shift). Fallback: Georgia / Helvetica Neue.

## 3. Colour tokens
```css
.lp{
  --bg:#ffffff;        /* paper */
  --mist:#f2f2f3;      /* band behind floating artifacts, cards */
  --fog:#fafafb;       /* alternating section */
  --ink:#17191c;       /* text, primary pill */
  --muted:#777b86;     /* sub copy, labels */
  --tag:#979799;       /* micro labels */
  --line:#e4e4e6;      /* hairlines */
  --peach:#fbe1d1;     /* ONE callout band + highlight wash in the demo */
  --sienna:#5d2a1a;    /* ink on peach, the demo highlight text */
}
```
Accent (peach/sienna) only on: the founder callout band, the demo highlights, the "Ready to send" chip. Hierarchy by ink 100 / muted / tag, never new colours.

## 4. Global utilities
- `.lp-pill` primary: ink fill, white text, 15px/500, padding 12px 22px, radius 9999px, `:active` scale .97, hover bg #33363b 150ms.
- `.lp-ghost`: transparent, 1px ink border, same geometry.
- `.lp-artifact`: white, radius 20px, shadow `0 0 0 1px rgba(4,23,43,.05), 0 20px 25px -5px rgba(0,0,0,.1), 0 8px 10px -6px rgba(0,0,0,.1)`. The only elements with a shadow.
- Reveal: `[data-reveal]` starts `opacity:0; translateY(24px)`; `.is-in` → `opacity:1; none` over .8s `cubic-bezier(0.22,1,0.36,1)`; children stagger 80ms via `--i`. Rest state visible when JS is off (`.no-js` fallback by default: class added only by JS).
- `prefers-reduced-motion`: everything shown in its final state, demo shows the finished invoice.

## 5. Assets
None external. The hero visual is a code-built product artifact (report card + invoice card) using real data from an IT site visit report (19.06.2026, CHG0260260, 08:46 to 17:32, taxi for cable procurement €113.00).

## 6. Layers & root
`.lp` full width (breaks out of the app container with `main:has(.lp){max-width:none;padding:0}`), `overflow-x:clip`. Container `max-width:1200px; margin:0 auto; padding:0 clamp(20px,4vw,48px)`.

## 7. Navbar
Sticky, 64px, transparent over paper, gains a 1px `--line` bottom border after scrollY > 8. Left: wordmark (22px mark: ink rounded square with peach page + "feldbuch" Source Serif 4 21px, tracking -0.02em). Centre (≥900px): How it works · Features · Pricing · FAQ, 15px muted → ink on hover. Right: "Sign in" text link + "Start free" pill. Mobile: centre links hidden; the two actions stay.

## 8. Hero (split: copy left 5/12, demo right 7/12; stacked below 960px)
| Element | Copy | Font | Size | Leading | Tracking | Colour |
|---|---|---|---|---|---|---|
| Eyebrow | For IT field engineers and technical freelancers in Germany | Geist 500 | 13px | 1.3 | 0 | ink on mist pill, 6px dot sienna |
| H1 | Site visit reports in. / Invoices *out.* | Serif 400 (+ italic, muted) | clamp(44px, 6.2vw, 84px) | 1.0 | -0.03em | ink / muted |
| Sub | Upload the reports from your week. Feldbuch reads the time on site, travel and parts, prices every visit with your rates and writes the invoice, with the right VAT note for clients at home and abroad. | Geist 400 | 18px (16 mobile) | 1.55 | -0.01em | muted, max 34rem |
| CTAs | Start free · See how it works | Geist 500 | 15px | | | pill / ghost |
| Proof strip | Made in Hamburg · GoBD locking · ELSTER figures · SEPA QR on every invoice | Geist 400 | 13px | | | tag, `·` separators |
Demo: a mist panel (radius 28px, padding clamp(16px,3vw,32px)) holding two artifacts: report (left, rotated -1.5deg, top) and invoice (right, overlapping by 48px, +1deg). Arrow between them on desktop.

## 9. Sections
1. **How it works** (`#how`, fog bg, 128px padding): H2 "Your Friday paperwork, in three steps", then three numbered rows (01 Upload, 02 Check, 03 Send and get paid), each a 2-col row: text left, a small product fragment right (upload progress row, priced visit row with "Half day" tag, bank match row "Confirm").
2. **Features** (`#features`, paper): H2 "Everything a German freelancer has to get right", 2×3 grid of text blocks separated by hairlines (no icon cards): Receipts, VAT notes, ELSTER figures, Bank matching, GoBD locking, Your numbering.
3. **Callout** (peach band, radius 32px inside container, padding 56px): serif 32–40px sienna statement + founder line.
4. **Pricing** (`#pricing`, fog): three plans on mist cards radius 24px, middle one white artifact; price in serif 48px; "plus VAT · cancel monthly" note.
5. **FAQ** (`#faq`, paper): `<details>` list, hairlines, 18px questions.
6. **Final CTA**: centred serif H2 "Close the week in ten minutes." + pill.
7. **Footer**: wordmark, © 2026, Impressum · Datenschutz · AGB · Sign in.

## 10. Motion
| Element | Trigger | Delay | Duration | From → To |
|---|---|---|---|---|
| Nav | load | 0 | .6s | y -8, 0 → 0, 1 |
| Eyebrow, H1, sub, CTAs, strip | load | .1 + i×.12s | .8s | y 24, 0 → 0, 1 |
| Report card | load | .35s | .9s | y 32 rot -4deg → y 0 rot -1.5deg |
| Invoice card | load | .5s | .9s | y 40 rot 3deg → y 0 rot 1deg |
| Demo sequence | 1.2s after load, loops every 9s while visible | steps every 900ms | highlight "08:46 → 17:32" → line 1 writes in → highlight "Taxi" → line 2 writes in → total counts 0 → 343.00 over 900ms → QR + chip fade in → hold 3s → reset |
Hovers 150ms. NOT animated: backgrounds, sections, prices. Reduced motion: final invoice shown, no loop.

## 12. Responsive
<640: H1 44px, hero stacked (copy, then demo), demo cards un-rotated and stacked with 12px overlap, pricing 1 column. ≥960: split hero. No horizontal scroll at 375px.

## 13. Constraints & acceptance
Do not: stock video, purple, glow, emoji, invented testimonials or customer logos, claims about features that do not exist yet (e-invoicing is described as planned).
Acceptance (first viewport, 1440×900): nav top; left column with eyebrow, two-line serif H1 with "out." in italic muted, sub, two pills, proof strip; right a mist panel with the tilted report card and invoice card mid-animation, sienna highlights on peach.
