import { and, eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import { db, documents } from "@/lib/db";
import { requireTenant } from "@/lib/auth";

// Private files are streamed through here, only after login and tenant check.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { tenantId } = await requireTenant();
  const { id } = await params;
  const [d] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.tenantId, tenantId)));
  if (!d) return new Response("Not found", { status: 404 });
  const res = await get(d.blobPath, { access: "private" });
  if (!res || res.statusCode !== 200) return new Response("Not found", { status: 404 });
  return new Response(res.stream, { headers: {
    "Content-Type": d.contentType,
    "Content-Disposition": `inline; filename="${encodeURIComponent(d.fileName)}"`,
    "Cache-Control": "private, no-store",
  } });
}
