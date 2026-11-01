import { auth } from "@/lib/auth/server";

const h = auth.handler();
const signupOpen = () => process.env.ALLOW_SIGNUP === "true";

// Sign-up is closed unless ALLOW_SIGNUP=true (set it temporarily to add a user).
export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!signupOpen() && path[0] === "sign-up") return Response.json({ error: "Sign-up is disabled" }, { status: 403 });
  return h.POST(req, ctx);
}
export const { GET, PUT, DELETE, PATCH } = h;
