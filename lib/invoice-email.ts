"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, invoices, invoiceEmails } from "./db";
import { requireTenant } from "./auth";
import { invoicePdf } from "./invoice-pdf";
import { sendMail } from "./email";

export type SendState = { ok: boolean; message: string; errors?: Record<string, string> } | null;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
const list = (v: string) => v.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

export async function sendInvoiceEmail(_: SendState, f: FormData): Promise<SendState> {
  const { tenantId, userId } = await requireTenant();
  const g = (k: string) => String(f.get(k) ?? "").trim();
  const invoiceId = g("invoiceId");
  const kind = g("kind") === "reminder" ? "reminder" : "invoice";
  const to = list(g("to")), cc = list(g("cc"));
  const errors: Record<string, string> = {};
  if (!to.length) errors.to = "Add the client's email";
  else if (to.some((e) => !EMAIL.test(e))) errors.to = "Check the email address";
  if (cc.some((e) => !EMAIL.test(e))) errors.cc = "Check the CC address";
  if (!g("subject")) errors.subject = "Add a subject";
  if (!g("body")) errors.body = "Add a message";
  if (Object.keys(errors).length) return { ok: false, message: "Please fix the marked fields", errors };

  const [inv] = await db.select({ id: invoices.id, status: invoices.status }).from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));
  if (!inv) return { ok: false, message: "Invoice not found" };

  // Idempotency: the same open form sends once, even on double click or retry.
  const submissionKey = /^[\w-]{8,64}$/.test(g("submissionKey")) ? g("submissionKey") : null;
  if (submissionKey) {
    const [done] = await db.select({ id: invoiceEmails.id }).from(invoiceEmails).where(and(eq(invoiceEmails.tenantId, tenantId), eq(invoiceEmails.submissionKey, submissionKey)));
    if (done) return { ok: true, message: "Already sent" };
  }

  try {
    const { buffer, fileName, company } = await invoicePdf(tenantId, invoiceId);
    const messageId = await sendMail({
      to: to.map((email) => ({ email })), cc: cc.map((email) => ({ email })), replyTo: company.email || undefined,
      subject: g("subject"), text: g("body"), attachments: [{ name: fileName, content: buffer }],
    });
    await db.insert(invoiceEmails).values({ tenantId, invoiceId, kind, toEmail: to.join(", "), cc: cc.join(", "), subject: g("subject"),
      providerMessageId: messageId, submissionKey, sentBy: userId }).onConflictDoNothing();
    if (inv.status === "draft") await db.update(invoices).set({ status: "sent", updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
    revalidatePath(`/invoices/${invoiceId}`);
    return { ok: true, message: `${kind === "reminder" ? "Reminder" : "Invoice"} sent to ${to.join(", ")}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not send" };
  }
}
