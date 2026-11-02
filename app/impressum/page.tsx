import LegalDraft from "../LegalDraft";
export const metadata = { title: "Impressum", robots: { index: false } };
export default function Page() {
  return <LegalDraft title="Impressum" items={["Name and legal form of the provider (e.g. UG / GmbH, or your name as sole trader)", "Postal address (no P.O. box)", "Email and a second fast contact channel", "Commercial register and number, if registered", "VAT ID (USt-IdNr.)", "Person responsible for content (§ 18 MStV)", "EU online dispute resolution note, if consumers can buy"]} />;
}
