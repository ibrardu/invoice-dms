// Finds Clerk keys whether set by hand (CLERK_SECRET_KEY) or by the Vercel Clerk
// integration with a custom prefix (e.g. INVOICE_CLERK_SECRET_KEY). Prefixed ones win.
function find(suffix: string) {
  const keys = Object.keys(process.env).filter((k) => k.endsWith(suffix) && process.env[k]);
  const prefixed = keys.find((k) => k !== suffix && k !== `NEXT_PUBLIC_${suffix}`);
  return process.env[prefixed ?? keys[0] ?? ""] || undefined;
}
export const clerkPublishableKey = () => find("CLERK_PUBLISHABLE_KEY");
export const clerkSecretKey = () => find("CLERK_SECRET_KEY");
