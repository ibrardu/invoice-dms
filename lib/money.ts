export const toCents = (v: string | number) => Math.round(Number(String(v).replace(",", ".")) * 100) || 0;
export const fmt = (cents: number, currency = "EUR") =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(cents / 100);
export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => {
  const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
};
