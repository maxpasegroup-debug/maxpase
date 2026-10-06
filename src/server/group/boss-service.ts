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
import { configuredProvider } from "@/server/sia/provider";
import { siaToolRegistry } from "@/server/sia/registry";
import { bossFilter, companyEvidence, filterBossExecutive } from "./boss-reliability";
import { buildBossOverview } from "./boss-overview";
import { createAccountPreferences } from "../account/preferences";

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
  async function dashboard(userId: string, companyId?: string, rawFilters: unknown = {}) {
    const { ctx, root } = await authority(userId);
    const filters = bossFilter.parse(rawFilters);
    const companies = await boundedRead(take => client.companyProfile.findMany({ take, where: { organization: { parentId: root.id, type: "COMPANY", id: { in: ctx.organizationIds("company.read").filter(id => ctx.organizationIds("executive.read").includes(id) && ctx.organizationIds("organization.read").includes(id)) } } }, select: { organizationId: true, legalName: true, displayName: true, status: true }, orderBy: { displayName: "asc" } }));
    if (companyId && !companies.some(c => c.organizationId === companyId)) throw new AccessError("Company context unavailable");
    const scope = { organizationId: companyId ?? root.id };
    const access = (id: string, db?: Prisma.TransactionClient) => createAccessContext(id, db ?? client, undefined, scope);
    const scoped = await access(userId);
    const business = createBusinessService(client, access);
    const sourceFilters = { projectId: filters.projectId, productId: filters.productId, from: filters.from, until: filters.until };
    const executiveService = createExecutiveService(client, access), now = new Date();
    const snapshot = await executiveService.dashboard(userId, scope, now, { tasks: true });
    const selected = Object.values(sourceFilters).some(v => v !== undefined) ? await executiveService.dashboard(userId, { ...scope, ...sourceFilters }, now, { tasks: true }) : snapshot;
    const executive = { ...filterBossExecutive(selected, filters), options: snapshot.options };
    const brands = await business.list(userId, "brands");
    const products = await business.list(userId, "products");
    const organizations = await business.list(userId, "organizations");
    const memberships = await createWorkforceService(client, access).list(userId, "memberships", { status: "ACTIVE" });
    const people = [];
    for (const m of memberships) if ("organizationId" in m && (await scoped.decide("person.read", { organizationId: String(m.organizationId), projectId: "projectId" in m ? m.projectId as string | null : null })).allowed) people.push(m);
    const ownership = await business.list(userId, "ownership");
    const relationships = await business.list(userId, "relationships");
    const siaIdentities = (await createWorkforceService(client, access).list(userId, "sia", { status: "ACTIVE" })).filter(s => "status" in s && s.status === "ACTIVE");
    const provider = configuredProvider();
    let siaStatus = siaIdentities.length ? "NOT AUTHORIZED" : idsForSia() ? "NOT CONFIGURED" : "NOT AUTHORIZED", siaHref = "/app/sia", canAsk = false;
    const capabilities: string[] = [];
    function idsForSia() { return scoped.organizationIds("sia.access.read").length > 0; }
    for (const sia of siaIdentities) {
      const tools = await boundedRead(take => client.siaTool.findMany({ take, where: { siaId: sia.id, enabled: true }, select: { key: true } }));
      for (const tool of tools) {
        const entry = siaToolRegistry.find(t => t.key === tool.key && t.risk === "READ_ONLY");
        if (!entry) continue;
        try { await toolAuthority(client, userId, { organizationId: scope.organizationId, siaId: sia.id }, tool.key); capabilities.push(entry.name); } catch (e) { if (!(e instanceof AccessError)) throw e; }
      }
      if (capabilities.length) { siaStatus = provider.name === "UNAVAILABLE" ? "UNAVAILABLE" : "DETERMINISTIC / AUTHORIZED"; canAsk = provider.name !== "UNAVAILABLE"; siaHref = `/app/sia?siaId=${encodeURIComponent(sia.id)}&organizationId=${encodeURIComponent(scope.organizationId)}`; break; }
    }
    const ids = (key: string) => scoped.organizationIds(key);
    const integrations = await boundedRead(take => client.integration.findMany({ take, where: { organizationId: { in: ids("integration.read") } }, select: { id: true, name: true, channel: true, status: true }, orderBy: { name: "asc" } }));
    const jobs = await boundedRead(take => client.scheduledJob.findMany({ take, where: { organizationId: { in: ids("automation.read") } }, select: { id: true, status: true, nextRunAt: true }, orderBy: { nextRunAt: "asc" } }));
    const audit = await client.auditEvent.findMany({ where: { OR: [{ organizationId: { in: ids("audit.read") } }, ...(ids("audit.read").includes(root.id) ? [{ actorUserId: userId, organizationId: null }] : [])] }, select: { id: true, action: true, entityType: true, result: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 });
    let database = "UNAVAILABLE";
    try { await verifyDatabaseReadiness(client); database = "SCHEMA READY"; } catch { /* Internal database errors never enter the DTO. */ }
    const belongs = (organizationId: string, company: string) => ancestry(scoped.nodes, organizationId).find(n => n.type === "COMPANY")?.id === company;
    const cards = companies.filter(c => !companyId || c.organizationId === companyId).map(c => {
      const company = snapshot.companies.find(e => e.id === c.organizationId);
      const metrics = company?.metrics ?? [];
      const evidence = companyEvidence(metrics, [...snapshot.projects, ...snapshot.goals, ...snapshot.tasks, ...snapshot.blockers, ...snapshot.milestones, ...snapshot.records, ...Object.values(snapshot.operations).flat()].filter(r => belongs(r.organizationId, c.organizationId)), snapshot.calculatedAt);
      const blocked = snapshot.blockers.some(r => r.status === "OPEN" && belongs(r.organizationId, c.organizationId));
      return { ...c, metrics, evidence, canReadDecisions: scoped.organizationIds("decision.read").some(id => belongs(id, c.organizationId)) || snapshot.records.some(r => r.kind === "DECISION" && belongs(r.organizationId, c.organizationId)),
      brands: brands.filter(b => "organizationId" in b && b.organizationId === c.organizationId),
      divisions: organizations.filter(o => "type" in o && o.type === "DIVISION" && belongs(o.id, c.organizationId)),
      projects: snapshot.projects.filter(p => belongs(p.organizationId, c.organizationId)), goals: snapshot.goals.filter(g => belongs(g.organizationId, c.organizationId)), tasks: snapshot.tasks.filter(t => belongs(t.organizationId, c.organizationId)),
      attention: snapshot.attention.filter(a => belongs(a.organizationId, c.organizationId) && !["RESOLVED", "DISMISSED"].includes(a.handlingStatus)),
      decisions: snapshot.decisions.filter(d => belongs(d.organizationId, c.organizationId)), changes: snapshot.changes.filter(a => belongs(a.organizationId, c.organizationId)),
      health: !evidence.readableMetrics ? "NOT_AUTHORIZED" : evidence.readableMetrics < evidence.totalMetrics ? company?.health === "AT_RISK" || blocked ? "AT_RISK_LIMITED_COVERAGE" : "LIMITED_COVERAGE" : !evidence.recordCount ? "NO_RECORDED_WORK" : blocked ? "AT_RISK" : company?.health ?? "UNAVAILABLE" };
    });
    const qualifiedExecutive = { ...executive, companies: executive.companies.map(company => {
      const card = cards.find(c => c.organizationId === company.id);
      if (!card) return { ...company, health: "UNAVAILABLE", reasons: ["Company evidence unavailable"] };
      return { ...company, metrics: card.metrics, health: card.health,
        reasons: card.health === "NO_RECORDED_WORK" ? ["Health not established: no recorded work"] : card.health === "NOT_AUTHORIZED" ? ["Not authorized to assess these sources"] : card.health.includes("LIMITED_COVERAGE") ? [...company.reasons, "Assessment limited by source access"] : [...company.reasons, ...(snapshot.blockers.some(r => r.status === "OPEN" && belongs(r.organizationId, company.id)) ? ["Open recorded blockers"] : [])],
        evidence: card.evidence,
        coverage: `${card.evidence.coverage}; ${card.evidence.readableMetrics}/${card.evidence.totalMetrics} readable metrics; ${card.evidence.freshness}` };
    }) };
    await authority(userId);
    const readable = Object.fromEntries(["brand", "product", "project", "goal", "task", "decision", "risk", "opportunity", "membership", "person", "ownership", "company", "integration", "automation", "audit", "organization"].map(key => [key, scoped.organizationIds(key + ".read").length > 0 || snapshot.metrics.some(m => m.source === key.toUpperCase() && m.value !== null)]));
    const account = await createAccountPreferences(client).account(userId);
    const overview = buildBossOverview(snapshot, account.timezone, readable.decision);
    const nextActions = [];
    for (const [permission, label, href] of [["project.manage", "Plan work", "/app/execution/projects"], ["decision.manage", "Record a decision request", "/app/executive/decisions"], ["brand.manage", "Review domain records", "/app/business/brands"]]) if ((await scoped.decide(permission, scope)).allowed) nextActions.push({ label, href });
    const shortcuts = [];
    for (const [permission, label, href] of [["project.manage", "New project", "/app/execution/projects?create=true"], ["task.manage", "New task", "/app/execution/tasks?create=true"], ["goal.manage", "New goal", "/app/execution/goals?create=true"], ["request.manage", "New request", "/app/operations/requests?create=true"], ["approval.read", "Approval inbox", "/app/operations/approvals?status=PENDING"], ["task.read", "My assignments", "/app/operations/my-tasks"], ["reminder.read", "Reminders", "/app/operations/reminders?status=PENDING"], ["escalation.read", "Open escalations", "/app/operations/escalations?status=OPEN"], ["activity.read", "Activity history", "/app/operations/activity?sort=newest"]]) if ((await scoped.decide(permission, scope)).allowed) shortcuts.push({ label, href });
    return { companies, cards, selectedCompanyId: companyId, groupId: root.id, executive: qualifiedExecutive, snapshot, overview, nextActions, shortcuts, readable, brands, products,
      graph: { organizations: organizations.map(o => ({ id: o.id, name: "name" in o ? String(o.name) : "NO DATA", type: "type" in o ? String(o.type) : "", parentId: "parentId" in o ? o.parentId : null })), brands, products, ownership, relationships },
      members: people.map(m => ({ id: m.id, name: "person" in m ? (m.person as { displayName: string }).displayName : "NO DATA", organizationId: "organizationId" in m ? String(m.organizationId) : "", projectId: "projectId" in m ? m.projectId : null })),
      sia: { status: siaStatus, href: siaHref, canAsk, provider: provider.name, capabilities, autonomousExecution: false }, integrations, jobs, audit,
      system: { database, application: "REQUEST SERVED", authentication: "ACTIVE SESSION", backup: "NOT VERIFIED", monitoring: "NOT VERIFIED", production: "NOT VERIFIED" } };
  }
  return { authority, dashboard };
}
export const bossService = createBossService();
