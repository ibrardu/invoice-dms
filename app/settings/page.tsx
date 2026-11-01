import { requireTenant } from "@/lib/auth";
import { getCompany, saveSettings } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const { tenantId } = await requireTenant();
  const c = await getCompany(tenantId);
  const field = (k: keyof typeof c, l: string, type = "text") =>
    <div key={k}><label>{l}</label><input name={k} type={type} defaultValue={String(c[k] ?? "")} /></div>;
  return (
    <>
      <h1>Company settings</h1>
      <form action={saveSettings} className="card">
        <div className="grid">
          {field("name", "Company name")}{field("email", "Email")}{field("phone", "Phone")}{field("taxId", "VAT / Tax ID")}
          {field("logoUrl", "Logo URL")}{field("currency", "Currency (e.g. EUR)")}{field("defaultTaxRate", "Default tax %", "number")}
          <div><label>Hourly labour rate</label><input name="hourlyRate" type="number" step="0.01" defaultValue={(c.hourlyRateCents / 100).toFixed(2)} /></div>
          <div><label>Hourly travel rate</label><input name="travelRate" type="number" step="0.01" defaultValue={(c.travelRateCents / 100).toFixed(2)} /></div>
          {field("paymentTermsDays", "Payment terms (days)", "number")}{field("invoicePrefix", "Invoice prefix")}{field("nextInvoiceNumber", "Next invoice number", "number")}
        </div>
        <div className="grid" style={{ marginTop: 12 }}>
          <div><label>Address</label><textarea name="address" rows={4} defaultValue={c.address} /></div>
          <div><label>Bank / payment details</label><textarea name="bankDetails" rows={4} defaultValue={c.bankDetails} /></div>
          <div><label>Invoice footer</label><textarea name="footerNote" rows={4} defaultValue={c.footerNote} /></div>
        </div>
        <p><button>Save</button></p>
      </form>
    </>
  );
}
