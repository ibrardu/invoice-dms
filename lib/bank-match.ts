// Matches an incoming bank payment to an open invoice. Pure, so it can be tested.
export type OpenInvoice = { id: string; number: string; balanceCents: number; currency: string; client: string };
export type Match = { invoiceId: string; reason: string; exact: boolean } | null;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const isDigit = (c: string | undefined) => !!c && c >= "0" && c <= "9";

/** True if `num` appears in `ref` without being part of a longer number (6192 is not inside 61926). */
function containsNumber(ref: string, num: string) {
  for (let i = ref.indexOf(num); i !== -1; i = ref.indexOf(num, i + 1)) {
    const before = ref[i - 1], after = ref[i + num.length];
    if (!(isDigit(num[0]) && isDigit(before)) && !(isDigit(num[num.length - 1]) && isDigit(after))) return true;
  }
  return false;
}

export function matchPayment(tx: { amountCents: number; currency: string; reference: string; counterparty: string }, open: OpenInvoice[]): Match {
  if (tx.amountCents <= 0) return null;
  const ref = norm(tx.reference);
  const same = open.filter((i) => i.currency === tx.currency && i.balanceCents > 0);
  // 1. Invoice number in the payment reference (longest number first, so #6192 does not win over #61926).
  const byNumber = same.filter((i) => norm(i.number).length >= 3 && containsNumber(ref, norm(i.number)))
    .sort((a, b) => norm(b.number).length - norm(a.number).length)[0];
  if (byNumber) {
    if (byNumber.balanceCents === tx.amountCents) return { invoiceId: byNumber.id, reason: `Reference has ${byNumber.number}, amount matches`, exact: true };
    if (tx.amountCents < byNumber.balanceCents) return { invoiceId: byNumber.id, reason: `Reference has ${byNumber.number}, part payment`, exact: false };
    return { invoiceId: byNumber.id, reason: `Reference has ${byNumber.number}, but amount is higher than the balance`, exact: false };
  }
  // 2. Amount equals the balance of exactly one open invoice.
  const byAmount = same.filter((i) => i.balanceCents === tx.amountCents);
  if (byAmount.length === 1) {
    const i = byAmount[0];
    const payer = norm(tx.counterparty), client = norm(i.client);
    const named = payer && client && (payer.includes(client.slice(0, 8)) || client.includes(payer.slice(0, 8)));
    return { invoiceId: i.id, reason: named ? `Amount and payer match ${i.number}` : `Amount matches ${i.number} only`, exact: !!named };
  }
  return null;
}
