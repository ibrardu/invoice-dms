"use client";
import { useEffect } from "react";

// Adds .is-in to [data-reveal] blocks once they scroll into view. Without JS, everything stays visible.
export default function Reveal() {
  useEffect(() => {
    const root = document.querySelector(".lp");
    if (!root) return;
    root.classList.add("js");
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { threshold: 0.15 });
    root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    const nav = root.querySelector(".lp-nav");
    const onScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 8);
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);
  return null;
}
