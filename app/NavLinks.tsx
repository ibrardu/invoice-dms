"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [["/", "Overview"], ["/invoices", "Invoices"], ["/clients", "Clients"], ["/documents", "Documents"], ["/export", "Export"], ["/settings", "Settings"]] as const;

export default function NavLinks() {
  const path = usePathname();
  return <nav>{LINKS.map(([href, label]) => {
    const on = href === "/" ? path === "/" : path.startsWith(href);
    return <Link key={href} href={href} aria-current={on ? "page" : undefined}>{label}</Link>;
  })}</nav>;
}
