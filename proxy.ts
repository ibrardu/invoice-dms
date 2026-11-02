import { auth } from "@/lib/auth/server";

// Redirects signed-out visitors to /sign-in. Every page and action also checks the session itself.
export default auth.middleware({ loginUrl: "/sign-in" });

export const config = {
  matcher: ["/((?!$|welcome|impressum|datenschutz|agb|sign-in|api/auth|icon|_next|favicon|.*\\.(?:css|js|png|jpe?g|svg|ico|woff2?|mp4|webm)$).*)"],
};
