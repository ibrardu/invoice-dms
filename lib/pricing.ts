// Pure pricing logic shared by the server (SVR import) and the invoice form (live edits).
export type Mode = "hourly" | "half_full" | "full_day" | "task";
export type Rates = { half: number; full: number; halfMax: number; hourly: number; task: number; travel: number };
export type Line = { description: string; quantity: number; unitPrice: number; taxRate: number; visitKey?: string };
export type VisitTimes = { date: string | null; start: string | null; end: string | null; hours: number; ticket: string | null };

export const toMin = (t: string | null) => { const m = t?.match(/^(\d{1,2})[:.](\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
export const hoursBetween = (s: string | null, e: string | null) => {
  const a = toMin(s), b = toMin(e);
  return a != null && b != null && b > a ? Math.round((b - a) / 60 * 100) / 100 : 0;
};
export const dmy = (d: string | null) => { const m = d?.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}.${m[2]}.${m[1]}` : ""; };

/** One support line for a visit, plus warnings when data is missing. */
export function priceVisit(v: VisitTimes, mode: Mode, r: Rates, tax: number, visitKey: string): { line: Line; warnings: string[] } {
  const d = dmy(v.date), w: string[] = [];
  if (!v.date) w.push("visit date missing");
  const known = v.hours > 0;
  let line: Line;
  switch (mode) {
    case "hourly":
      if (!known) w.push("time missing: enter hours");
      line = { description: `Support per hour ${d}`.trim(), quantity: known ? v.hours : 0, unitPrice: r.hourly, taxRate: tax, visitKey };
      break;
    case "task":
      line = { description: `${v.ticket ? `Task ${v.ticket.split(",")[0].trim()}` : "Support task"} ${d}`.trim(), quantity: 1, unitPrice: r.task, taxRate: tax, visitKey };
      break;
    case "full_day":
      line = { description: `Support 1 day (${d})`, quantity: 1, unitPrice: r.full, taxRate: tax, visitKey };
      break;
    default: {
      if (!known) w.push("time missing: billed as full day, enter hours if it was a half day");
      const useHalf = r.half > 0 && known && v.hours <= r.halfMax;
      line = { description: `Support ${d}`.trim(), quantity: 1, unitPrice: useHalf ? r.half : (r.full || r.half), taxRate: tax, visitKey };
    }
  }
  return { line, warnings: w };
}
