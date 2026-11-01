import Link from "next/link";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="state">
      <h1>This page does not exist</h1>
      <p className="muted">The invoice, client or document may have been deleted, or the link is wrong.</p>
      <div className="row"><Link className="btn" href="/">Back to overview</Link><Link className="btn ghost" href="/invoices">All invoices</Link></div>
    </div>
  );
}
