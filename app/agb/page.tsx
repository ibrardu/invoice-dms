import LegalDraft from "../LegalDraft";
export const metadata = { title: "AGB", robots: { index: false } };
export default function Page() {
  return <LegalDraft title="Allgemeine Geschäftsbedingungen" items={["Scope: business customers (B2B) only, or also consumers", "Plans, prices, billing period, cancellation", "Availability and support", "Customer responsibilities (correct data, tax filings)", "Note that tax figures are not tax advice", "Liability limits", "Data processing agreement (AVV) under Art. 28 GDPR as an annex", "Data export when leaving; deletion after the contract ends", "Governing law and place of jurisdiction"]} />;
}
