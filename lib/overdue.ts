import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { db, invoices } from "./db";
import { today } from "./money";

/** Marks sent invoices past their due date as overdue. Cheap; runs on dashboard / list load. */
export async function markOverdue(tenantId: string) {
  await db.update(invoices).set({ status: "overdue", updatedAt: new Date() })
    .where(and(eq(invoices.tenantId, tenantId), eq(invoices.status, "sent"), lt(invoices.dueDate, today())));
}
