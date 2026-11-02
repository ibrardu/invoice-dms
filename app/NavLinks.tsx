"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOutAction } from "./sign-in/actions";

const LINKS = [["/", "Overview"], ["/invoices", "Invoices"], ["/clients", "Clients"], ["/expenses", "Expenses"], ["/bank", "Bank"], ["/documents", "Documents"], ["/export", "Export"], ["/settings", "Settings"]] as const;
const MORE = ["/clients", "/bank", "/elster", "/documents", "/export", "/settings"];

const I = {
  home: "M3 10.5 10 4l7 6.5V17h-4.5v-4h-5v4H3z",
  doc: "M5 3h7l4 4v10H5zM12 3v4h4M8 11h5M8 14h5",
  plus: "M10 4v12M4 10h12",
  receipt: "M5 3h10v14l-2.5-1.5L10 17l-2.5-1.5L5 17zM8 7h4M8 10h4",
  more: "M4 6h12M4 10h12M4 14h12",
};
const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 20 20" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export default function NavLinks({ elster = false, email }: { elster?: boolean; email?: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", k); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [open]);
  const links = elster ? [...LINKS.slice(0, 5), ["/elster", "ELSTER"] as const, ...LINKS.slice(5)] : LINKS;
  const on = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const tab = (href: string, label: string, d: string) =>
    <Link href={href} aria-current={on(href) && !(href === "/invoices" && path === "/invoices/new") ? "page" : undefined}><Icon d={d} /><span>{label}</span></Link>;
  return <>
    <nav className="desk-nav" aria-label="Main">{links.map(([href, label]) =>
      <Link key={href} href={href} aria-current={on(href) ? "page" : undefined}>{label}</Link>)}</nav>
    <nav className="tabbar no-print" aria-label="Main">
      {tab("/", "Overview", I.home)}
      {tab("/invoices", "Invoices", I.doc)}
      <Link href="/invoices/new" className="tb-new" aria-label="New invoice"><Icon d={I.plus} /></Link>
      {tab("/expenses", "Expenses", I.receipt)}
      <button type="button" className={MORE.some(on) ? "on" : ""} aria-expanded={open} aria-controls="more-sheet" onClick={() => setOpen(!open)}><Icon d={I.more} /><span>More</span></button>
    </nav>
    {open && <div className="sheet-scrim no-print" onClick={() => setOpen(false)} />}
    <div id="more-sheet" className={`sheet no-print${open ? " open" : ""}`} role="dialog" aria-modal="true" aria-label="More" hidden={!open}>
      <span className="sheet-grip" aria-hidden="true" />
      <ul>{links.filter(([h]) => MORE.includes(h)).map(([href, label]) =>
        <li key={href}><Link href={href} aria-current={on(href) ? "page" : undefined}>{label}</Link></li>)}</ul>
      <div className="sheet-foot">{email && <span>{email}</span>}<form action={signOutAction}><button className="ghost small">Sign out</button></form></div>
    </div>
  </>;
}
