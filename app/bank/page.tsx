import Link from "next/link";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, bankConnections, invoices, clients } from "@/lib/db";
import { requireTenant } from "@/lib/auth";
import { bankEnabled, listBanks } from "@/lib/enablebanking";
import { connectBank, disconnectBank, syncBank, confirmMatch, confirmAllExact, ignoreTx, latestTx } from "@/lib/bank";
import { fmt } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bank" };
const dmy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const COUNTRIES = [["DE", "Germany"], ["BE", "Belgium"], ["NL", "Netherlands"], ["AT", "Austria"], ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"], ["FI", "Finland"]];

async function syncNow() { "use server"; await syncBank(); }

export default async function Bank({ searchParams }: { searchParams: Promise<{ country?: string; connected?: string; error?: string }> }) {
  const { tenantId } = await requireTenant();
  const sp = await searchParams;
  if (!bankEnabled()) return (
    <div className="card"><h1>Bank</h1>
      <p>Connect your bank account read-only, so incoming payments are matched to your invoices automatically.</p>
      <p className="muted">Not set up yet. Register a free app at Enable Banking (enablebanking.com, Finland, PSD2 licensed): choose <b>Production</b>, link your own account to activate the free restricted mode, then add <code>ENABLE_BANKING_APP_ID</code> and <code>ENABLE_BANKING_PRIVATE_KEY</code> in Vercel. Set the redirect URL to <code>https://invoice-dms.vercel.app/api/bank/callback</code>.</p>
    </div>);

  const country = COUNTRIES.some(([c]) => c === sp.country) ? sp.country! : "DE";
  const paid = sql<number>`coalesce((select sum(p.amount_cents) from payments p where p.invoice_id = ${invoices.id}),0)::int`;
  const [conns, txs, open] = await Promise.all([
    db.select().from(bankConnections).where(eq(bankConnections.tenantId, tenantId)),
    latestTx(tenantId),
    db.select({ id: invoices.id, number: invoices.number, total: invoices.totalCents, paid, currency: invoices.currency, client: clients.name })
      .from(invoices).innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(and(eq(invoices.tenantId, tenantId), inArray(invoices.status, ["sent", "overdue", "draft"]))),
  ]);
  const banks = conns.length ? [] : await listBanks(country).catch(() => null);
  const byId = new Map(open.map((i) => [i.id, i]));
  const suggested = txs.filter((t) => t.status === "suggested");
  const exact = suggested.filter((t) => t.matchExact);
  const unmatched = txs.filter((t) => t.status === "new");
  const matched = txs.filter((t) => t.status === "matched").slice(0, 10);
  const daysLeft = (d: Date | null) => d ? Math.round((d.getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="stagger">
      <div className="ov-title">
        <div><h1>Bank</h1>
          <p className={suggested.length ? "callout" : "callout calm"}>{suggested.length ? `${suggested.length} incoming payment${suggested.length > 1 ? "s" : ""} match open invoices` : conns.length ? "No new payments to match" : "Connect your bank to match payments automatically"}</p></div>
        {conns.length > 0 && <div className="row">
          {exact.length > 0 && <form action={confirmAllExact}><button>Confirm {exact.length} exact match{exact.length > 1 ? "es" : ""}</button></form>}
          <form action={syncNow}><button className="ghost">Sync now</button></form></div>}
      </div>
      {sp.connected && <p className="callout calm">Bank connected. Click Sync now to load the last 90 days.</p>}
      {sp.error && <p className="late">{sp.error}</p>}

      {conns.length === 0 ? (
        <section className="card"><h2>Connect a bank</h2>
          <p className="muted">You log in at your own bank and allow read-only access for up to 180 days. This app can never move money.</p>
          <form className="row" style={{ marginBottom: 12 }}><select name="country" defaultValue={country} style={{ width: 200 }}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select><button className="ghost">Show banks</button></form>
          {banks === null ? <p className="late">Could not load the bank list. Check the Enable Banking keys.</p> :
            <form action={connectBank} className="row"><input type="hidden" name="country" value={country} />
              <select name="bank" required style={{ flex: 1, minWidth: 220 }}><option value="">Choose your bank ({banks.length})</option>{banks.map((b) => <option key={b.name}>{b.name}</option>)}</select>
              <button>Connect</button></form>}
        </section>
      ) : (
        <section className="card"><h2>Connected</h2>
          <table><tbody>{conns.map((c) => { const left = daysLeft(c.validUntil); const accts = JSON.parse(c.accounts) as { iban: string; name: string; currency: string }[];
            return <tr key={c.id}><td><b>{c.bankName}</b><div className="muted">{accts.map((a) => a.iban || a.name).filter(Boolean).join(", ")}</div></td>
              <td className={left !== null && left < 14 ? "late" : "muted"}>{left === null ? "" : left > 0 ? `Access ends in ${left} days` : "Access expired, connect again"}</td>
              <td className="muted">{c.lastSyncAt ? `Synced ${c.lastSyncAt.toISOString().slice(0, 16).replace("T", " ")}` : "Not synced yet"}</td>
              <td className="r"><form action={disconnectBank}><input type="hidden" name="id" value={c.id} /><button className="danger small">Disconnect</button></form></td></tr>; })}</tbody></table>
        </section>
      )}

      {suggested.length > 0 && <section className="card"><h2>Suggested matches</h2>
        <table><thead><tr><th>Date</th><th>From</th><th className="r">Amount</th><th>Invoice</th><th></th></tr></thead>
          <tbody>{suggested.map((t) => { const inv = t.invoiceId ? byId.get(t.invoiceId) : undefined;
            return <tr key={t.id}><td className="num">{dmy(t.bookingDate)}</td><td>{t.counterparty || "–"}<div className="muted">{t.reference}</div></td>
              <td className="r money">{fmt(t.amountCents, t.currency)}</td>
              <td>{inv ? <Link href={`/invoices/${inv.id}`}>{inv.number}</Link> : "–"}<div className={t.matchExact ? "muted" : "late"}>{t.matchReason}</div></td>
              <td className="r"><div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                {t.invoiceId && <form action={confirmMatch}><input type="hidden" name="txId" value={t.id} /><input type="hidden" name="invoiceId" value={t.invoiceId} /><button className="small">Confirm</button></form>}
                <form action={ignoreTx}><input type="hidden" name="txId" value={t.id} /><button className="ghost small">Ignore</button></form></div></td></tr>; })}</tbody></table>
      </section>}

      {unmatched.length > 0 && <section className="card"><h2>Money in, not matched</h2>
        <table><tbody>{unmatched.slice(0, 30).map((t) => <tr key={t.id}><td className="num">{dmy(t.bookingDate)}</td><td>{t.counterparty || "–"}<div className="muted">{t.reference}</div></td>
          <td className="r money">{fmt(t.amountCents, t.currency)}</td>
          <td className="r"><form action={confirmMatch} className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}><input type="hidden" name="txId" value={t.id} />
            <select name="invoiceId" required style={{ width: 200 }}><option value="">Assign to invoice</option>
              {open.filter((i) => i.currency === t.currency).map((i) => <option key={i.id} value={i.id}>{i.number} · {i.client} · {fmt(i.total - i.paid, i.currency)}</option>)}</select>
            <button className="small">Record</button></form>
            <form action={ignoreTx} style={{ marginTop: 4 }}><input type="hidden" name="txId" value={t.id} /><button className="ghost small">Not an invoice payment</button></form></td></tr>)}</tbody></table>
      </section>}

      {matched.length > 0 && <section className="card"><h2>Recently matched</h2>
        <table><tbody>{matched.map((t) => <tr key={t.id}><td className="num">{dmy(t.bookingDate)}</td><td>{t.counterparty}</td><td className="r money">{fmt(t.amountCents, t.currency)}</td>
          <td>{t.invoiceId && <Link href={`/invoices/${t.invoiceId}`}>Invoice</Link>}</td></tr>)}</tbody></table></section>}
    </div>
  );
}
