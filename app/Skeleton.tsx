// Placeholder shaped like the page that is loading (no spinners).
export function Skeleton({ kind = "list" }: { kind?: "overview" | "list" | "form" }) {
  return (
    <div className="sk" aria-busy="true" aria-label="Loading">
      <div className="sk-title"><i style={{ width: 220, height: 32 }} /><i style={{ width: 360, height: 40, borderRadius: 24 }} /></div>
      {kind === "overview" && <div className="sk-strip">{[0, 1, 2, 3].map((i) => <div key={i}><i style={{ width: "50%" }} /><i style={{ width: "70%", height: 28 }} /><i style={{ width: "40%" }} /></div>)}</div>}
      <div className="sk-card">{kind === "form"
        ? [0, 1, 2, 3].map((i) => <div key={i} className="sk-row"><i style={{ width: "30%" }} /><i style={{ width: "100%", height: 40 }} /></div>)
        : <>{kind === "overview" && <i style={{ width: "100%", height: 220, marginBottom: 16 }} />}
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="sk-line"><i style={{ width: `${30 + ((i * 17) % 40)}%` }} /><i style={{ width: 90 }} /></div>)}</>}
      </div>
    </div>
  );
}
