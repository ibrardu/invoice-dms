import "server-only";

// Brevo (France) transactional email API. Free plan: 300 emails/day.
// Env: BREVO_API_KEY, MAIL_FROM (a sender verified in Brevo, e.g. ibrar@ibrar.eu), MAIL_FROM_NAME (optional)
export const emailEnabled = () => !!process.env.BREVO_API_KEY && !!process.env.MAIL_FROM;

type Mail = { to: { email: string; name?: string }[]; cc?: { email: string }[]; replyTo?: string; subject: string; text: string;
  attachments?: { name: string; content: Buffer }[] };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export async function sendMail(m: Mail): Promise<string> {
  if (!emailEnabled()) throw new Error("Email is not set up. Add BREVO_API_KEY and MAIL_FROM in Vercel.");
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#17191c">${esc(m.text).replace(/\n/g, "<br>")}</div>`;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || undefined },
      to: m.to, cc: m.cc?.length ? m.cc : undefined, replyTo: m.replyTo ? { email: m.replyTo } : undefined,
      subject: m.subject, textContent: m.text, htmlContent: html,
      attachment: m.attachments?.map((a) => ({ name: a.name, content: a.content.toString("base64") })),
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) {
    const body = (await r.text()).slice(0, 300);
    if (r.status === 401) throw new Error("Brevo rejected the API key.");
    if (/sender/i.test(body)) throw new Error(`Brevo does not accept ${process.env.MAIL_FROM} as sender yet. Verify it under Senders & IP in Brevo.`);
    throw new Error(`Brevo error ${r.status}: ${body}`);
  }
  return String((await r.json()).messageId ?? "");
}

/** Fills {placeholders} in a template. Unknown placeholders stay as they are. */
export function fillTemplate(t: string, v: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (all, k) => (k in v ? v[k] : all));
}
