import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/** Returns the tenant + user for the signed in person, or redirects. Enforces ALLOWED_EMAILS. */
export async function requireTenant() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");
  const allowed = (process.env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (allowed.length) {
    const user = await currentUser();
    const emails = user?.emailAddresses.filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress.toLowerCase()) ?? [];
    if (!emails.some((e) => allowed.includes(e))) throw new Error("Your account is not allowed to use this app.");
  }
  return { tenantId: orgId ?? userId, userId };
}
