// Ledger line chart: one ink line (this year), last year in grey, the current month marked in the one
// chart hue. 4 faint gridlines with round y ticks, no fill, no legend box beyond two labelled swatches.
type Props = { labels: string[]; current: (number | null)[]; previous: number[]; highlight: number; format: (n: number) => string;
  currentLabel: string; previousLabel: string };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)); const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export default function LineChart({ labels, current, previous, highlight, format, currentLabel, previousLabel }: Props) {
  const W = 1080, H = 240, L = 56, R = 28, T = 12, B = 28;
  const max = niceMax(Math.max(...previous, ...current.map((v) => v ?? 0)));
  const x = (i: number) => L + (i * (W - L - R)) / (labels.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const path = (vals: (number | null)[]) => vals.map((v, i) => v == null ? "" : `${i && vals[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const hv = current[highlight];
  return (
    <figure className="lc" style={{ margin: 0 }}>
      <figcaption className="lc-legend"><span><i className="ink" />{currentLabel}</span><span><i className="grey" />{previousLabel}</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${currentLabel} by month compared with ${previousLabel}`}>
        {ticks.map((t) => <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e4e4e6" />
          <text x={L - 10} y={y(t) + 4} textAnchor="end">{format(t)}</text></g>)}
        <path d={path(previous)} fill="none" stroke="#c9c9ce" strokeWidth="2" strokeLinejoin="round" />
        <path d={path(current)} fill="none" stroke="#17191c" strokeWidth="2.5" strokeLinejoin="round" />
        {labels.map((l, i) => <g key={l}>
          <text x={x(i)} y={H - 8} textAnchor="middle" className={i === highlight ? "on" : ""}>{l}</text>
          <rect x={x(i) - (W - L) / labels.length / 2} y={T} width={(W - L) / labels.length} height={H - T - B} fill="transparent">
            <title>{`${l}\n${currentLabel}: ${current[i] == null ? "–" : format(current[i]!)}\n${previousLabel}: ${format(previous[i])}`}</title></rect>
        </g>)}
        {hv != null && <circle cx={x(highlight)} cy={y(hv)} r="5" fill="#5d2a1a" stroke="#fff" strokeWidth="2" pointerEvents="none" />}
      </svg>
    </figure>
  );
}
