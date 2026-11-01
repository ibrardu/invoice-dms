import { requireTenant } from "@/lib/auth";
import { getCompany, saveSettings, listSeries, saveSeries, deleteSeries } from "@/lib/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function Settings() {
  const { tenantId } = await requireTenant();
  const [c, series] = await Promise.all([getCompany(tenantId), listSeries(tenantId)]);
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
          {field("paymentTermsDays", "Payment terms (days)", "number")}
        </div>
        <div className="grid" style={{ marginTop: 12 }}>
          <div><label>Address</label><textarea name="address" rows={4} defaultValue={c.address} /></div>
          <div><label>Bank / payment details</label><textarea name="bankDetails" rows={4} defaultValue={c.bankDetails} /></div>
          <div><label>Invoice footer</label><textarea name="footerNote" rows={4} defaultValue={c.footerNote} /></div>
        </div>
        <h2 style={{ marginTop: 16 }}>Tax and ELSTER</h2>
        <p className="muted">Optional. Shows the figures for your VAT pre-return (Umsatzsteuer-Voranmeldung) and EÜR to copy into Mein ELSTER, and prints the right VAT note on invoices. Ask your tax adviser if unsure which options apply.</p>
        <label className="check"><input type="checkbox" name="elsterEnabled" defaultChecked={c.elsterEnabled} /> Show the ELSTER page</label>
        <div className="grid" style={{ marginTop: 12 }}>
          <div><label>VAT status</label><select name="vatStatus" defaultValue={c.vatStatus}>
            <option value="regular">VAT registered (Regelbesteuerung)</option><option value="kleinunternehmer">Small business, no VAT (§ 19 UStG)</option></select></div>
          <div><label>VAT counted when</label><select name="taxBasis" defaultValue={c.taxBasis}>
            <option value="ist">Payment received (Ist-Versteuerung)</option><option value="soll">Invoice issued (Soll-Versteuerung)</option></select></div>
          <div><label>Pre-return period</label><select name="vatPeriod" defaultValue={c.vatPeriod}>
            <option value="quarterly">Quarterly</option><option value="monthly">Monthly</option></select></div>
          {field("taxNumber", "Tax number (Steuernummer)")}
        </div>
        <h2 style={{ marginTop: 16 }}>Email templates</h2>
        <p className="muted">Placeholders: {"{number} {company} {client} {contact} {total} {balance} {due} {days}"}</p>
        <div className="grid">
          <div><label>Invoice email subject</label><input name="emailSubject" defaultValue={c.emailSubject} /></div>
          <div><label>Reminder subject</label><input name="reminderSubject" defaultValue={c.reminderSubject} /></div>
        </div>
        <div className="grid" style={{ marginTop: 12 }}>
          <div><label>Invoice email message</label><textarea name="emailBody" rows={6} defaultValue={c.emailBody} /></div>
          <div><label>Reminder message</label><textarea name="reminderBody" rows={6} defaultValue={c.reminderBody} /></div>
        </div>
        <h2 style={{ marginTop: 16 }}>Payment QR code</h2>
        <p className="muted">Adds a SEPA (EPC / GiroCode) QR to EUR invoices. Banking apps such as Wise, N26, Sparkasse or Revolut scan it to pre-fill IBAN, amount and invoice number.</p>
        <div className="grid">
          {field("accountHolder", "Account holder")}{field("iban", "IBAN")}{field("bic", "BIC / SWIFT")}
          <div><label>Online payment link (optional, https://)</label><input name="paymentLink" defaultValue={c.paymentLink} placeholder="https://wise.com/pay/..." /></div>
          <div><label><input type="checkbox" name="showPaymentQr" defaultChecked={c.showPaymentQr} style={{ width: "auto" }} /> Show payment QR on invoices</label></div>
        </div>
        <p><button>Save</button></p>
      </form>

      <div className="card">
        <h2>Invoice numbering</h2>
        <p className="muted">Add as many prefixes as you need. <b>Running number</b>: prefix + next number (e.g. #61927). <b>Date</b>: prefix + DDMMYYYY of the supply or issue date (e.g. TSM18092026); a second invoice on the same date gets -2.</p>
        <table><thead><tr><th>Prefix</th><th>Type</th><th>Next number</th><th>Default</th><th></th></tr></thead>
          <tbody>{series.map((x) => <tr key={x.id}><td colSpan={5}>
            <form action={saveSeries} className="row">
              <input type="hidden" name="id" value={x.id} />
              <input name="prefix" defaultValue={x.prefix} style={{ width: 120 }} />
              <select name="mode" defaultValue={x.mode} style={{ width: 170 }}><option value="sequence">Running number</option><option value="date">Date DDMMYYYY</option></select>
              <input name="nextNumber" type="number" min="1" defaultValue={x.nextNumber} style={{ width: 110 }} />
              <label style={{ margin: 0 }}><input type="checkbox" name="isDefault" defaultChecked={x.isDefault} style={{ width: "auto" }} /> default</label>
              <button className="ghost">Save</button>
              <button formAction={deleteSeries} className="danger" disabled={series.length <= 1}>Delete</button>
            </form></td></tr>)}</tbody></table>
        <form action={saveSeries} className="row" style={{ marginTop: 12 }}>
          <input name="prefix" placeholder="New prefix e.g. TSM" style={{ width: 160 }} required />
          <select name="mode" defaultValue="date" style={{ width: 170 }}><option value="sequence">Running number</option><option value="date">Date DDMMYYYY</option></select>
          <input name="nextNumber" type="number" min="1" defaultValue={1} style={{ width: 110 }} />
          <label style={{ margin: 0 }}><input type="checkbox" name="isDefault" style={{ width: "auto" }} /> default</label>
          <button>Add prefix</button>
        </form>
      </div>
    </>
  );
}
