import "server-only";
import { redirect } from "next/navigation";
import { auth } from "./auth/server";
import { isSaas } from "./mode";

export const allowedEmails = () =>
  (process.env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/** Signed-in user or redirect.
 *  internal mode: only ALLOWED_EMAILS, all sharing the workspace "main".
 *  saas mode: every account is its own workspace (tenantId = user id). */
export async function requireTenant() {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/sign-in");
  if (isSaas()) return { tenantId: user.id, userId: user.id, email: user.email };
  const allowed = allowedEmails();
  if (!allowed.length || !allowed.includes(user.email.toLowerCase())) redirect("/sign-in?error=not-allowed");
  return { tenantId: "main", userId: user.id, email: user.email };
}
