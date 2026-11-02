import LegalDraft from "../LegalDraft";
export const metadata = { title: "Datenschutz", robots: { index: false } };
export default function Page() {
  return <LegalDraft title="Datenschutzerklärung" items={["Controller and contact details", "What data is processed (account, invoices, clients, uploaded documents, bank transactions) and why", "Legal bases (Art. 6 GDPR) and retention periods (10 years for invoices)", "Subprocessors: Vercel, Neon, LlamaCloud (EU region), Brevo, Enable Banking, with their locations and safeguards", "Data subject rights and the right to complain to a supervisory authority", "Cookies: only the sign-in session cookie"]} />;
}
