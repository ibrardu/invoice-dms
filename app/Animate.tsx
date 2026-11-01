"use client";
import { useAutoAnimate } from "@formkit/auto-animate/react";

// Animates children being added, removed or reordered (fluid-design principle 7: don't teleport).
// AutoAnimate honours prefers-reduced-motion by default.
export default function Animate({ as = "div", className, children }: { as?: "div" | "ul" | "tbody"; className?: string; children: React.ReactNode }) {
  const [ref] = useAutoAnimate<HTMLElement>({ duration: 220, easing: "cubic-bezier(0.23,1,0.32,1)" });
  const Tag = as as "div";
  return <Tag ref={ref as React.Ref<HTMLDivElement>} className={className}>{children}</Tag>;
}
