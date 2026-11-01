// Clerk keys set by hand, or by the Vercel Clerk integration with prefix INVOICE_. Prefixed ones win.
// Literal property access only: middleware cannot enumerate process.env.
export const clerkPublishableKey = () =>
  process.env.NEXT_PUBLIC_INVOICE_CLERK_PUBLISHABLE_KEY || process.env.INVOICE_CLERK_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || undefined;
export const clerkSecretKey = () => process.env.INVOICE_CLERK_SECRET_KEY || process.env.CLERK_SECRET_KEY || undefined;
