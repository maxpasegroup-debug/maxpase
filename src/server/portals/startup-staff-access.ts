import type { Prisma } from "@prisma/client";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { requirePortalAccess } from "./policy";

/** AIRA staff use Skill City; applicant and student credentials remain on Startup Skool. */
export async function requireStartupStaffAccess(db: Prisma.TransactionClient, userId: string) {
  const employee = await requirePortalAccess(db, userId, "skillcity");
  const division = await db.organization.findUnique({ where: { slug: "aira-startup-school" }, select: { id: true, parentId: true, type: true, status: true } });
  if (!division || division.parentId !== employee.companyId || division.type !== "DIVISION" || division.status !== "ACTIVE") throw new AccessError("Startup School scope unavailable");
  const ctx = await createAccessContext(userId, db, undefined, { organizationId: division.id });
  await ctx.requireAccess("organization.read", { organizationId: division.id });
  await ctx.requireAccess("program.manage", { organizationId: division.id });
  return { divisionId: division.id, companyId: employee.companyId, ctx };
}
