"use client";
import { useActionState, useEffect, useState } from "react";
import { sendInvoiceEmail, type SendState } from "@/lib/invoice-email";

type Draft = { to: string; subject: string; body: string };
export default function SendEmail({ invoiceId, invoice, reminder, enabled, overdue }:
  { invoiceId: string; invoice: Draft; reminder: Draft; enabled: boolean; overdue: boolean }) {
  const [kind, setKind] = useState<"invoice" | "reminder">(overdue ? "reminder" : "invoice");
  const [state, action, pending] = useActionState<SendState, FormData>(sendInvoiceEmail, null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  useEffect(() => { if (state?.ok) setKey(crypto.randomUUID()); }, [state]);
  const d = kind === "invoice" ? invoice : reminder;
  const err = (k: string) => state?.errors?.[k] ? <span className="field-error">{state.errors[k]}</span> : null;

  if (!enabled) return <p className="muted">Email is not set up yet. Add <code>BREVO_API_KEY</code> and <code>MAIL_FROM</code> in Vercel to send invoices from here.</p>;
  return (
    <form action={action} key={kind} noValidate>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="submissionKey" value={key} />
      <div className="row" role="tablist" style={{ marginBottom: 12 }}>
        <button type="button" className={kind === "invoice" ? "small" : "ghost small"} onClick={() => setKind("invoice")}>Invoice</button>
        <button type="button" className={kind === "reminder" ? "small" : "ghost small"} onClick={() => setKind("reminder")}>Payment reminder</button>
      </div>
      <div className="grid">
        <div><label htmlFor="to">To</label><input id="to" name="to" defaultValue={d.to} placeholder="accounts@client.com" />{err("to")}</div>
        <div><label htmlFor="cc">CC (optional)</label><input id="cc" name="cc" />{err("cc")}</div>
      </div>
      <div style={{ marginTop: 12 }}><label htmlFor="subject">Subject</label><input id="subject" name="subject" defaultValue={d.subject} />{err("subject")}</div>
      <div style={{ marginTop: 12 }}><label htmlFor="body">Message</label><textarea id="body" name="body" rows={7} defaultValue={d.body} />{err("body")}</div>
      <p className="muted" style={{ margin: "8px 0 0" }}>The invoice PDF is attached. Replies go to your company email.</p>
      {state?.message && <p role="alert" className={state.ok ? "" : "late"}>{state.message}</p>}
      <p style={{ marginBottom: 0 }}><button disabled={pending}>{pending ? "Sending..." : kind === "invoice" ? "Send invoice" : "Send reminder"}</button></p>
    </form>
  );
}
