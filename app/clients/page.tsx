import { asc, eq } from "drizzle-orm";
import { db, clients } from "@/lib/db";
import { requireTenant } from "@/lib/auth";
import { saveClient, deleteClient } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Clients({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { tenantId } = await requireTenant();
  const { edit } = await searchParams;
  const list = await db.select().from(clients).where(eq(clients.tenantId, tenantId)).orderBy(asc(clients.name));
  const e = list.find((c) => c.id === edit);
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
