import type { Prisma } from "@prisma/client";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { siteById, type PortalId } from "./sites";

export async function requirePortalAccess(db: Prisma.TransactionClient, userId: string, id: PortalId) {
  const site = siteById(id);
  if (!site) throw new AccessError("Gateway unavailable");
  if (id === "skillcity") {
    const company = await db.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true, type: true, status: true, company: { select: { status: true } } } });
    if (!company || company.type !== "COMPANY" || company.status !== "ACTIVE" || company.company?.status !== "ACTIVE") throw new AccessError("Gateway unavailable");
    const scope = { organizationId: company.id };
    const ctx = await createAccessContext(userId, db, undefined, scope);
    await ctx.requireAccess("organization.read", scope);
    return { site, divisionId: company.id, companyId: company.id, ctx };
  }
  const division = await db.organization.findUnique({ where: { slug: site.divisionSlug }, select: { id: true, type: true, status: true, parent: { select: { id: true, slug: true, type: true, status: true, company: { select: { status: true } } } } } });
  if (!division || division.type !== "DIVISION" || division.status !== "ACTIVE" || division.parent?.slug !== "aira-skill-city" || division.parent.type !== "COMPANY" || division.parent.status !== "ACTIVE" || division.parent.company?.status !== "ACTIVE") throw new AccessError("Gateway unavailable");
  if (id === "jobs") {
    const product = await db.product.findUnique({ where: { organizationId_slug: { organizationId: division.parent.id, slug: "nice-jobs" } }, select: { divisionId: true, status: true } });
    if (!product || product.divisionId !== division.id || product.status !== "ACTIVE") throw new AccessError("Gateway unavailable");
  }
  const scope = { organizationId: division.id };
  const ctx = await createAccessContext(userId, db, undefined, scope);
  await ctx.requireAccess("organization.read", scope);
  return { site, divisionId: division.id, companyId: division.parent.id, ctx };
}
