"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const LINKS = [["#how", "How it works"], ["#features", "Features"], ["#pricing", "Pricing"], ["#faq", "FAQ"]];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState<Element | null>(null);
  useEffect(() => setRoot(document.querySelector(".lp")), []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const r = () => window.innerWidth > 900 && setOpen(false);
    document.addEventListener("keydown", k); window.addEventListener("resize", r); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); window.removeEventListener("resize", r); document.body.style.overflow = ""; };
  }, [open]);
  return <>
    <button type="button" className="lp-menu-btn" aria-expanded={open} aria-controls="lp-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d={open ? "M5 5l10 10M15 5L5 15" : "M3 7h14M3 13h14"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
    </button>
    {root && createPortal(<div id="lp-menu" className="lp-menu" hidden={!open}>
      <nav aria-label="Sections">{LINKS.map(([h, l]) => <a key={h} href={h} onClick={() => setOpen(false)}>{l}</a>)}</nav>
      <div className="lp-menu-cta">
        <Link href="/sign-in" className="lp-ghost">Sign in</Link>
        <Link href="/sign-in?mode=up" className="lp-pill">Start free</Link>
      </div>
    </div>, root)}
  </>;
}
