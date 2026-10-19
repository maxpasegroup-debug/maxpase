import type { Prisma } from "@prisma/client";
import { AccessError, type createAccessContext } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { leadPayload } from "./input";
export async function labsReminderGuard(db: Prisma.TransactionClient, ctx: Awaited<ReturnType<typeof createAccessContext>>, row: { reference: string; organizationId: string; recipientUserId: string; remindAt: Date; resourceType: string; resourceId: string }, cancel = false) {
  if (!row.reference.startsWith("labs-followup:")) return;
  const parts = row.reference.split(":"), lead = await db.executiveRecord.findUnique({ where: { id: parts[1] ?? "" } });
  if (!lead || lead.kind !== "LABS_LEAD" || lead.organizationId !== row.organizationId || row.resourceType !== "ORGANIZATION" || row.resourceId !== row.organizationId) throw new AccessError("Invalid Labs reminder binding");
  await ctx.requireAccess("labs.sales.manage", { organizationId: row.organizationId });
  if (cancel) return;
  const p = leadPayload.parse(JSON.parse(lead.payload));
  const owner = await requirePortalAccess(db, row.recipientUserId, "labs");
  if (owner.divisionId !== row.organizationId || p.ownerUserId !== row.recipientUserId || lead.ownerPersonId !== owner.ctx.user!.personId || !p.nextFollowUp || new Date(p.nextFollowUp).getTime() !== row.remindAt.getTime() || ["WON", "LOST"].includes(lead.status)) throw new AccessError("Labs follow-up changed or recipient revoked");
  if (!(await owner.ctx.decide("labs.sales.self", { organizationId: row.organizationId })).allowed && !(await owner.ctx.decide("labs.sales.read", { organizationId: row.organizationId })).allowed) throw new AccessError("Recipient cannot read the lead");
}
