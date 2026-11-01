import "server-only";
import { redirect } from "next/navigation";
import { auth } from "./auth/server";

export const allowedEmails = () =>
  (process.env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/** Signed-in, allowed user or redirect. All allowed users share one workspace ("main"). */
export async function requireTenant() {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/sign-in");
  const allowed = allowedEmails();
  if (!allowed.length || !allowed.includes(user.email.toLowerCase())) redirect("/sign-in?error=not-allowed");
  return { tenantId: "main", userId: user.id, email: user.email };
}
