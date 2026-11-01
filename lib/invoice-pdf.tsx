import "server-only";
import { loadInvoice } from "./invoice-data";
import { epcQrPng } from "./epc-qr";
import { renderInvoicePdf } from "./invoice-pdf-doc";

export async function invoicePdf(tenantId: string, id: string) {
  const { inv, client, items, company, payments } = await loadInvoice(tenantId, id);
  const balance = inv.totalCents - payments.reduce((a, p) => a + p.amountCents, 0);
  const qr = company.showPaymentQr && balance > 0 && inv.status !== "cancelled"
    ? await epcQrPng({ name: company.accountHolder || company.name, iban: company.iban, bic: company.bic, amountCents: balance, currency: inv.currency, reference: `Invoice ${inv.number}` })
    : null;
  const buffer = await renderInvoicePdf({ inv, client, items, company, balance, qr });
  return { buffer, inv, client, company, balance, fileName: `Invoice-${inv.number.replace(/[^\w-]+/g, "")}.pdf` };
}

