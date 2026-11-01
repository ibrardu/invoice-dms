import "server-only";
import QRCode from "qrcode";

/** IBAN mod-97 check, so a typo never ends up in a payment QR. */
export function validIban(iban: string) {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const n = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let r = 0;
  for (const d of n) r = (r * 10 + Number(d)) % 97;
  return r === 1;
}

/**
 * EPC069-12 SEPA credit transfer QR ("GiroCode"), version 002.
 * Returns an SVG string, or null when it cannot be made (non-EUR, bad IBAN, amount out of range).
 */
export async function epcQrSvg(o: { name: string; iban: string; bic?: string; amountCents: number; currency: string; reference: string }) {
  const iban = o.iban.replace(/\s+/g, "").toUpperCase();
  if (o.currency !== "EUR" || !validIban(iban) || o.amountCents < 1 || o.amountCents > 99999999999) return null;
  const clean = (t: string, max: number) => t.replace(/[\r\n]+/g, " ").trim().slice(0, max);
  const payload = [
    "BCD", "002", "1", "SCT",
    (o.bic ?? "").replace(/\s+/g, "").toUpperCase(),
    clean(o.name, 70),
    iban,
    `EUR${(o.amountCents / 100).toFixed(2)}`,
    "", "",                          // purpose, structured creditor reference
    clean(o.reference, 140),         // unstructured remittance text
  ].join("\n");
  return QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 0 });
}
