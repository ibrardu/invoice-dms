import { requireTenant } from "@/lib/auth";
import { invoicePdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { tenantId } = await requireTenant();
  const { id } = await params;
  const { buffer, fileName } = await invoicePdf(tenantId, id);
  return new Response(new Uint8Array(buffer), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${fileName}"`, "Cache-Control": "private, no-store" } });
}
