"use client";
import { useEffect, useRef } from "react";

// A muted feature loop (rendered from marketing/features). Plays only while on screen;
// with reduced motion the poster frame stays.
export default function FeatureVideo({ id, label }: { id: string; label: string }) {
  const v = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = v.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.play().catch(() => {}); else el.pause(); }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <video ref={v} className="lp-fvid" src={`/features/${id}.mp4`} poster={`/features/${id}.jpg`} muted loop playsInline preload="none"
      width={960} height={720} aria-label={label} />
  );
}
