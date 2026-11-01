import { cookies } from "next/headers";
import { db, bankConnections } from "@/lib/db";
import { requireTenant } from "@/lib/auth";
import { createSession } from "@/lib/enablebanking";

// The bank sends the user back here after they approved read access.
export async function GET(req: Request) {
  const { tenantId } = await requireTenant();
  const u = new URL(req.url);
  const jar = await cookies();
  const saved = jar.get("bank_state")?.value;
  jar.delete("bank_state");
  const back = (q: string) => Response.redirect(new URL(`/bank?${q}`, u.origin), 303);
  if (u.searchParams.get("error")) return back(`error=${encodeURIComponent(u.searchParams.get("error_description") ?? u.searchParams.get("error")!)}`);
  let st: { state: string; bank: string; country: string } | null = null;
  try { st = saved ? JSON.parse(saved) : null; } catch { st = null; }
  if (!st || st.state !== u.searchParams.get("state")) return back("error=The bank login expired. Please connect again.");
  const code = u.searchParams.get("code");
  if (!code) return back("error=No authorisation code from the bank");
  try {
    const sess = await createSession(code);
    await db.insert(bankConnections).values({ tenantId, bankName: st.bank, country: st.country, sessionId: sess.sessionId,
      accounts: JSON.stringify(sess.accounts), validUntil: sess.validUntil });
    return back("connected=1");
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "Could not connect")}`);
  }
}
