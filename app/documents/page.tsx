import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { db, documents, clients, invoices } from "@/lib/db";
import { requireTenant } from "@/lib/auth";
import { uploadDocument, deleteDocument } from "@/lib/actions";

export const dynamic = "force-dynamic";
const CATS = ["general", "svr", "receipt", "contract", "receipt", "invoice", "quote", "correspondence", "other"];

export default async function Documents({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const { tenantId } = await requireTenant();
  const { q = "", cat = "" } = await searchParams;
  const where = and(eq(documents.tenantId, tenantId),
    q ? or(ilike(documents.title, `%${q}%`), ilike(documents.tags, `%${q}%`), ilike(documents.fileName, `%${q}%`)) : undefined,
    cat ? eq(documents.category, cat) : undefined);
  const [list, cl, inv] = await Promise.all([
    db.select({ d: documents, client: clients.name, invoice: invoices.number }).from(documents)
      .leftJoin(clients, eq(clients.id, documents.clientId)).leftJoin(invoices, eq(invoices.id, documents.invoiceId))
      .where(where).orderBy(desc(documents.createdAt)),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.tenantId, tenantId)).orderBy(asc(clients.name)),
    db.select({ id: invoices.id, number: invoices.number }).from(invoices).where(eq(invoices.tenantId, tenantId)).orderBy(desc(invoices.createdAt)),
  ]);
  return (
    <>
      <h1>Documents</h1>
      <form action={uploadDocument} className="card">
        <h2>Upload</h2>
        <div className="grid">
          <div><label>File * (max 20 MB)</label><input type="file" name="file" required /></div>
          <div><label>Title</label><input name="title" /></div>
          <div><label>Category</label><select name="category">{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label>Tags (comma separated)</label><input name="tags" /></div>
          <div><label>Client</label><select name="clientId"><option value="">None</option>{cl.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label>Invoice</label><select name="invoiceId"><option value="">None</option>{inv.map((i) => <option key={i.id} value={i.id}>{i.number}</option>)}</select></div>
        </div>
        <p><button>Upload</button></p>
      </form>
      <form className="card row">
        <input name="q" placeholder="Search title, tags, file name" defaultValue={q} style={{ flex: 1, width: "auto" }} />
        <select name="cat" defaultValue={cat} style={{ width: 180 }}><option value="">All categories</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <button>Search</button>
      </form>
      <div className="card"><table>
        <thead><tr><th>Title</th><th>Category</th><th>Tags</th><th>Client</th><th>Invoice</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
        <tbody>{list.map(({ d, client, invoice }) => <tr key={d.id}>
          <td><a href={`/api/documents/${d.id}`}>{d.title}</a></td><td>{d.category}</td><td>{d.tags}</td><td>{client}</td><td>{invoice}</td>
          <td>{(d.sizeBytes / 1024).toFixed(0)} KB</td><td>{d.createdAt.toISOString().slice(0, 10)}</td>
          <td><form action={deleteDocument}><input type="hidden" name="id" value={d.id} /><button className="danger">Delete</button></form></td>
        </tr>)}</tbody>
      </table></div>
    </>
  );
}
