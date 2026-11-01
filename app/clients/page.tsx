import { asc, eq } from "drizzle-orm";
import { db, clients } from "@/lib/db";
import { requireTenant } from "@/lib/auth";
import { saveClient, deleteClient, listSeries } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Clients({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { tenantId } = await requireTenant();
  const { edit } = await searchParams;
  const list = await db.select().from(clients).where(eq(clients.tenantId, tenantId)).orderBy(asc(clients.name));
  const e = list.find((c) => c.id === edit);
  const series = await listSeries(tenantId);
  return (
    <>
      <h1>Clients</h1>
      <form action={saveClient} className="card" key={e?.id ?? "new"}>
        <h2>{e ? `Edit ${e.name}` : "Add client"}</h2>
        <input type="hidden" name="id" defaultValue={e?.id} />
        <div className="grid">
          {([["name", "Company / name *"], ["contactName", "Contact person"], ["email", "Email"], ["phone", "Phone"], ["taxId", "VAT / Tax ID"]] as const).map(([k, l]) =>
            <div key={k}><label>{l}</label><input name={k} defaultValue={e?.[k] ?? ""} required={k === "name"} /></div>)}
        </div>
        <div className="grid" style={{ marginTop: 12 }}>
          <div><label>Address</label><textarea name="address" rows={3} defaultValue={e?.address} /></div>
          <div><label>Notes</label><textarea name="notes" rows={3} defaultValue={e?.notes} /></div>
        </div>
        <h2 style={{ marginTop: 16 }}>Pricing for site visits</h2>
        <p className="muted">Default way to price lines generated from SVRs. You can switch mode per import on the invoice page.</p>
        <div className="grid">
          <div><label>Invoice number prefix</label><select name="defaultSeriesId" defaultValue={e?.defaultSeriesId ?? ""}>
            <option value="">Use default</option>{series.map((x) => <option key={x.id} value={x.id}>{x.prefix} ({x.mode === "date" ? "date" : "running"})</option>)}</select></div>
          <div><label>Default pricing mode</label><select name="pricingMode" defaultValue={e?.pricingMode ?? "half_full"}>
            <option value="half_full">Half / full day (by hours on site)</option>
            <option value="full_day">Fixed full-day rate</option>
            <option value="hourly">Hourly</option>
            <option value="task">Fixed price per task / visit</option></select></div>
          <div><label>Task rate</label><input name="taskRate" type="number" step="0.01" defaultValue={((e?.taskRateCents ?? 0) / 100).toFixed(2)} /></div>
          <div><label>Half-day rate</label><input name="halfDayRate" type="number" step="0.01" defaultValue={((e?.halfDayRateCents ?? 0) / 100).toFixed(2)} /></div>
          <div><label>Half-day up to (hours)</label><input name="halfDayMaxHours" type="number" step="0.25" defaultValue={e?.halfDayMaxHours ?? "4"} /></div>
          <div><label>Full-day rate</label><input name="fullDayRate" type="number" step="0.01" defaultValue={((e?.fullDayRateCents ?? 0) / 100).toFixed(2)} /></div>
          <div><label>Hourly rate</label><input name="hourlyRate" type="number" step="0.01" defaultValue={((e?.hourlyRateCents ?? 0) / 100).toFixed(2)} /></div>
          <div><label>Travel flat fee per visit</label><input name="travelFlat" type="number" step="0.01" defaultValue={((e?.travelFlatCents ?? 0) / 100).toFixed(2)} /></div>
        </div>
        <p><button>{e ? "Save changes" : "Add client"}</button></p>
      </form>
      <div className="card">
        <table><thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>VAT</th><th></th></tr></thead>
          <tbody>{list.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.contactName}</td><td>{c.email}</td><td>{c.taxId}</td>
            <td className="r"><div className="row" style={{ justifyContent: "flex-end" }}><a className="btn ghost" href={`/clients?edit=${c.id}`}>Edit</a>
              <form action={deleteClient}><input type="hidden" name="id" value={c.id} /><button className="danger">Delete</button></form></div></td></tr>)}</tbody></table>
      </div>
    </>
  );
}
