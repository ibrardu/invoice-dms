// Small dependency-free SVG bar chart. Grouped bars, one axis, hover tooltips via <title>.
type Series = { name: string; color: string; values: number[] };

export default function BarChart({ labels, series, format, height = 200 }:
  { labels: string[]; series: Series[]; format: (n: number) => string; height?: number }) {
  const W = 720, H = height, padL = 56, padB = 24, padT = 8;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; })();
  const ticks = [0, 0.5, 1].map((t) => t * nice);
  const slot = (W - padL) / labels.length, gap = 2;
  const bw = Math.min(22, (slot * 0.7 - gap * (series.length - 1)) / series.length);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / nice);
  return (
    <div className="chart">
      {series.length > 1 && <div className="legend">{series.map((s) =>
        <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: "100%", height: "auto" }}>
        {ticks.map((t) => <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="#e5e7eb" />
          <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#6b7280">{format(t)}</text></g>)}
        {labels.map((l, i) => {
          const x0 = padL + i * slot + (slot - (bw * series.length + gap * (series.length - 1))) / 2;
          return <g key={l}>
            {series.map((s, j) => {
              const v = s.values[i] ?? 0, top = y(v), h = Math.max(0, H - padB - top);
              return <g key={s.name}>
                <rect x={padL + i * slot} y={padT} width={slot} height={H - padT - padB} fill="transparent"><title>{`${l}\n${series.map((ss) => `${ss.name}: ${format(ss.values[i] ?? 0)}`).join("\n")}`}</title></rect>
                {h > 0 && <path pointerEvents="none" fill={s.color} d={`M${x0 + j * (bw + gap)},${H - padB} v${-(h - Math.min(4, h))} q0,-${Math.min(4, h)} ${Math.min(4, bw / 2)},-${Math.min(4, h)} h${bw - 2 * Math.min(4, bw / 2)} q${Math.min(4, bw / 2)},0 ${Math.min(4, bw / 2)},${Math.min(4, h)} v${h - Math.min(4, h)} z`} />}
              </g>;
            })}
            <text x={padL + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#6b7280">{l}</text>
          </g>;
        })}
        <line x1={padL} x2={W} y1={H - padB} y2={H - padB} stroke="#9ca3af" />
      </svg>
    </div>
  );
}
