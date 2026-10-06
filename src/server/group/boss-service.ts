import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { ancestry } from "@/server/authorization/business-scope";
import { createExecutiveService } from "@/server/domain/executive-service";
import { createBusinessService } from "@/server/domain/business-service";
import { createWorkforceService } from "@/server/domain/workforce-service";
import { boundedRead } from "@/server/domain/query-bounds";
import { toolAuthority } from "@/server/sia/context";
import { verifyDatabaseReadiness } from "@/server/security/readiness";
import { BOSS_EMAIL, groupIdentity } from "./identity";

export function createBossService(client: PrismaClient = prisma) {
  async function authority(userId: string, db: Prisma.TransactionClient = client) {
    const root = await db.organization.findUnique({ where: { slug: groupIdentity.slug }, select: { id: true, type: true, parentId: true } });
    if (!root || root.type !== "GROUP" || root.parentId) throw new AccessError("Group unavailable");
    const ctx = await createAccessContext(userId, db, undefined, { organizationId: root.id });
    if (ctx.user?.id !== userId || (await db.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email !== BOSS_EMAIL) throw new AccessError("Boss Panel access denied");
    await ctx.requireAccess("boss.access", { organizationId: root.id });
    await ctx.requireAccess("executive.read", { organizationId: root.id });
    return { ctx, root };
  }
  async function dashboard(userId: string, companyId?: string) {
    const { ctx, root } = await authority(userId);
    const companies = await boundedRead(take => client.companyProfile.findMany({ take, where: { organization: { parentId: root.id, type: "COMPANY", id: { in: ctx.organizationIds("company.read").filter(id => ctx.organizationIds("executive.read").includes(id) && ctx.organizationIds("organization.read").includes(id)) } } }, select: { organizationId: true, legalName: true, displayName: true, status: true }, orderBy: { displayName: "asc" } }));
    if (companyId && !companies.some(c => c.organizationId === companyId)) throw new AccessError("Company context unavailable");
    const scope = { organizationId: companyId ?? root.id };
    const access = (id: string, db?: Prisma.TransactionClient) => createAccessContext(id, db ?? client, undefined, scope);
    const scoped = await access(userId);
    const business = createBusinessService(client, access);
    const executive = await createExecutiveService(client, access).dashboard(userId, scope, new Date(), { tasks: true });
    const brands = await business.list(userId, "brands");
    const products = await business.list(userId, "products");
    const organizations = await business.list(userId, "organizations");
    const memberships = await createWorkforceService(client, access).list(userId, "memberships", { status: "ACTIVE" });
    const people = [];
    for (const m of memberships) if ("organizationId" in m && (await scoped.decide("person.read", { organizationId: String(m.organizationId), projectId: "projectId" in m ? m.projectId as string | null : null })).allowed) people.push(m);
    const ownership = await business.list(userId, "ownership");
    const relationships = await business.list(userId, "relationships");
    const siaIdentities = await createWorkforceService(client, access).list(userId, "sia", { status: "ACTIVE" });
    let siaStatus = "NOT CONFIGURED", siaHref = "/app/sia";
    for (const sia of siaIdentities) {
      try { await toolAuthority(client, userId, { organizationId: scope.organizationId, siaId: sia.id }, "get_group_overview"); siaStatus = "DETERMINISTIC / AUTHORIZED"; siaHref = `/app/sia?siaId=${encodeURIComponent(sia.id)}&organizationId=${encodeURIComponent(scope.organizationId)}`; break; } catch (e) { if (!(e instanceof AccessError)) throw e; }
    }
    const ids = (key: string) => scoped.organizationIds(key);
    const integrations = await boundedRead(take => client.integration.findMany({ take, where: { organizationId: { in: ids("integration.read") } }, select: { id: true, name: true, channel: true, status: true }, orderBy: { name: "asc" } }));
    const jobs = await boundedRead(take => client.scheduledJob.findMany({ take, where: { organizationId: { in: ids("automation.read") } }, select: { id: true, status: true, nextRunAt: true }, orderBy: { nextRunAt: "asc" } }));
    const audit = await client.auditEvent.findMany({ where: { OR: [{ organizationId: { in: ids("audit.read") } }, ...(ids("audit.read").includes(root.id) ? [{ actorUserId: userId, organizationId: null }] : [])] }, select: { id: true, action: true, entityType: true, result: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 });
    let database = "UNAVAILABLE";
    try { await verifyDatabaseReadiness(client); database = "LOCAL SCHEMA READY"; } catch { /* The status is explicit; internal database errors never enter the DTO. */ }
    const belongs = (organizationId: string, company: string) => ancestry(scoped.nodes, organizationId).find(n => n.type === "COMPANY")?.id === company;
    const cards = companies.filter(c => !companyId || c.organizationId === companyId).map(c => ({ ...c,
      brands: brands.filter(b => "organizationId" in b && b.organizationId === c.organizationId),
      divisions: organizations.filter(o => "type" in o && o.type === "DIVISION" && belongs(o.id, c.organizationId)),
      projects: executive.projects.filter(p => belongs(p.organizationId, c.organizationId)), goals: executive.goals.filter(g => belongs(g.organizationId, c.organizationId)), tasks: executive.tasks.filter(t => belongs(t.organizationId, c.organizationId)),
      attention: executive.attention.filter(a => belongs(a.organizationId, c.organizationId) && !["RESOLVED", "DISMISSED"].includes(a.handlingStatus)),
      decisions: executive.decisions.filter(d => belongs(d.organizationId, c.organizationId)), changes: executive.changes.filter(a => belongs(a.organizationId, c.organizationId)),
      health: executive.companies.find(e => e.id === c.organizationId)?.health ?? "NO DATA" }));
    await authority(userId);
    return { companies, cards, selectedCompanyId: companyId, groupId: root.id, executive, brands, products,
      graph: { organizations: organizations.map(o => ({ id: o.id, name: "name" in o ? String(o.name) : "NO DATA", type: "type" in o ? String(o.type) : "", parentId: "parentId" in o ? o.parentId : null })), brands, products, ownership, relationships },
      members: people.map(m => ({ id: m.id, name: "person" in m ? (m.person as { displayName: string }).displayName : "NO DATA", organizationId: "organizationId" in m ? String(m.organizationId) : "", projectId: "projectId" in m ? m.projectId : null })),
      sia: { status: siaStatus, href: siaHref }, integrations, jobs, audit,
      system: { database, application: "LOCAL REQUEST SERVED", authentication: "ACTIVE SESSION", backup: "NOT VERIFIED", monitoring: "NOT VERIFIED", production: "NOT VERIFIED" } };
  }
  return { authority, dashboard };
}
export const bossService = createBossService();
