import Link from "next/link";

// Placeholder for legal pages. Must be replaced with real, checked texts before the SaaS launch.
export default function LegalDraft({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="state" style={{ maxWidth: 680 }}>
      <p><Link href="/welcome">← Back</Link></p>
      <h1>{title}</h1>
      <p className="callout">Draft. This page must be completed with checked legal text before the public launch.</p>
      <h2>Required content</h2>
      <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}
