"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [["/", "Overview"], ["/invoices", "Invoices"], ["/clients", "Clients"], ["/expenses", "Expenses"], ["/bank", "Bank"], ["/documents", "Documents"], ["/export", "Export"], ["/settings", "Settings"]] as const;

export default function NavLinks({ elster = false }: { elster?: boolean }) {
  const path = usePathname();
  const links = elster ? [...LINKS.slice(0, 5), ["/elster", "ELSTER"] as const, ...LINKS.slice(5)] : LINKS;
  return <nav>{links.map(([href, label]) => {
    const on = href === "/" ? path === "/" : path.startsWith(href);
    return <Link key={href} href={href} aria-current={on ? "page" : undefined}>{label}</Link>;
  })}</nav>;
}
