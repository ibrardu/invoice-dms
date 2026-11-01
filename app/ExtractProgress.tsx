"use client";
import { useEffect, useState } from "react";

export type FileStage = "waiting" | "uploading" | "reading" | "pricing" | "done" | "failed";
export type FileProgress = { name: string; stage: FileStage; startedAt?: number; readStartedAt?: number; error?: string };

const LABEL: Record<FileStage, string> = {
  waiting: "Waiting", uploading: "Uploading", reading: "Reading with LlamaParse", pricing: "Adding to invoice", done: "Done", failed: "Failed",
};
// How far along each stage is, out of 100. "reading" creeps from 25 toward 85 while LlamaParse works,
// slowing as it goes, so the bar keeps moving without pretending to know the exact end.
const BASE: Record<FileStage, number> = { waiting: 0, uploading: 8, reading: 25, pricing: 92, done: 100, failed: 100 };
const TYPICAL_READ_S = 25;

function pct(f: FileProgress, now: number) {
  if (f.stage !== "reading" || !f.readStartedAt) return BASE[f.stage];
  const t = (now - f.readStartedAt) / 1000;
  return 25 + 60 * (1 - Math.exp(-t / TYPICAL_READ_S));
}

/** Per-file stages plus one overall bar. Tracks real steps; only the reading stage is estimated. */
export default function ExtractProgress({ files }: { files: FileProgress[] }) {
  const [now, setNow] = useState(() => Date.now());
  const active = files.some((f) => f.stage !== "done" && f.stage !== "failed");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  if (!files.length) return null;
  const overall = files.reduce((a, f) => a + pct(f, now), 0) / files.length;
  const done = files.filter((f) => f.stage === "done").length;
  return (
    <div className="xp" role="status" aria-live="polite">
      <div className="xp-head">
        <span>{active ? `Reading ${files.length} file${files.length > 1 ? "s" : ""}` : `${done} of ${files.length} read`}</span>
        <span className="num muted">{Math.round(overall)}%</span>
      </div>
      <div className="xp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overall)}>
        <i style={{ transform: `scaleX(${overall / 100})` }} />
      </div>
      <ul>{files.map((f, i) => {
        const p = pct(f, now);
        return <li key={i} className={f.stage}>
          <span className="xp-name" title={f.name}>{f.name}</span>
          <span className="xp-stage">{f.stage === "failed" ? f.error ?? LABEL.failed : LABEL[f.stage]}
            {f.stage === "reading" && f.readStartedAt ? <span className="num muted"> · {Math.round((now - f.readStartedAt) / 1000)} s</span> : null}</span>
          <span className="xp-mini"><i style={{ transform: `scaleX(${p / 100})` }} /></span>
        </li>;
      })}</ul>
      {active && files.some((f) => f.stage === "reading" && f.readStartedAt && now - f.readStartedAt > 45000) &&
        <p className="muted" style={{ margin: "8px 0 0" }}>LlamaParse is busier than usual. You can keep working; this page will fill in when it finishes.</p>}
    </div>
  );
}
