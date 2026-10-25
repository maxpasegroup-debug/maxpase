import type { Prisma } from "@prisma/client";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { siteById, type PortalId } from "./sites";
import { accountPortalRealm } from "@/server/auth/account-realm";

const skillCityStaffRoles = new Set(["Director", "Division Director", "Business Development & Operations Manager", "Senior Academic Advisor", "Junior Academic Advisor", "Software Developer", "Full Stack Developer", "Junior Developer"]);

export async function requirePortalAccess(db: Prisma.TransactionClient, userId: string, id: PortalId, credentialSetup = false) {
  const site = siteById(id);
  if (!site) throw new AccessError("Gateway unavailable");
  if (id === "skillcity") {
    const company = await db.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true, type: true, status: true, company: { select: { status: true } } } });
    if (!company || company.type !== "COMPANY" || company.status !== "ACTIVE" || company.company?.status !== "ACTIVE") throw new AccessError("Gateway unavailable");
    const user = await db.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true, person: { select: { metadata: true } } } });
    if (!user?.emailVerifiedAt) throw new AccessError("Verified employee account required");
    const realm = accountPortalRealm(user?.person?.metadata);
    if (realm && realm !== "skillcity") throw new AccessError("Gateway unavailable");
    const ctx = await createAccessContext(userId, db, undefined, { organizationId: company.id });
    const divisions = await db.organization.findMany({ where: { parentId: company.id, type: "DIVISION", status: "ACTIVE", slug: { in: ["aira-labs", "aira-startup-school", "aira-skill-studio", "aira-career-hub"] } }, select: { id: true } });
    const staffScopes = [company.id, ...divisions.map(division => division.id)];
    let authorized = false;
    for (const scopeId of staffScopes) {
      if (ctx.grants.some(grant => grant.key === "organization.read" && skillCityStaffRoles.has(grant.roleName ?? "") && (grant.organizationId === scopeId || grant.includeDescendants && grant.organizationId === company.id)) && (await ctx.decide("organization.read", { organizationId: scopeId })).allowed) { authorized = true; break; }
    }
    if (!authorized) throw new AccessError("Gateway unavailable");
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
  if (id === "labs") {
    const user = await db.user.findUnique({ where: { id: userId }, select: { personId: true, emailVerifiedAt: true, person: { select: { metadata: true } } } });
    const metadata = JSON.parse(user?.person?.metadata ?? "{}");
    if (metadata.credentialKind === "STAFF_PASSWORD") {
      if (accountPortalRealm(user?.person?.metadata) !== "labs" || !user?.emailVerifiedAt || !user.personId ||
        !(await db.membership.findFirst({ where: { personId: user.personId, organizationId: division.id, status: "ACTIVE", roles: { some: { role: { status: "ACTIVE", principalType: "HUMAN", key: { in: ["labs-full-stack-developer", "labs-junior-developer", "labs-business-development-manager"] } } } } } }))) throw new AccessError("Verified Labs employee appointment required");
    }
  }
  if (id === "labs" && !credentialSetup) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { person: { select: { metadata: true } } } });
    if (JSON.parse(user?.person?.metadata ?? "{}").labsPinChangeRequired === true) throw new AccessError("Change the initial PIN before entering the workspace");
  }
  return { site, divisionId: division.id, companyId: division.parent.id, ctx };
}
