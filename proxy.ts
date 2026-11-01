import { auth } from "@/lib/auth/server";

// Redirects signed-out visitors to /sign-in. Every page and action also checks the session itself.
export default auth.middleware({ loginUrl: "/sign-in" });

export const config = {
  matcher: ["/((?!sign-in|api/auth|api/auth-info|_next|favicon|.*\\.(?:css|js|png|jpg|svg|ico|woff2?)$).*)"],
};
