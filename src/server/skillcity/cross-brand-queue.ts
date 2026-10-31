import { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { leadPayload } from "@/server/labs/input";
import { crmLeadPayload } from "./crm";

const sources = [
  { key: "labs", divisionSlug: "aira-labs", label: "AIRA Labs enquiries", kind: "LABS_LEAD", selfPermission: "labs.sales.self", teamPermission: "labs.sales.read", product: null },
  { key: "pba", divisionSlug: "aira-startup-school", label: "PBA / Startup Skool", kind: "AIRA_CRM_LEAD", selfPermission: "aira.crm.self", teamPermission: "aira.crm.manage", product: "pba" },
  { key: "genz-builder", divisionSlug: "aira-skill-studio", label: "GenZ Builder / Skill Studio", kind: "AIRA_CRM_LEAD", selfPermission: "aira.crm.self", teamPermission: "aira.crm.manage", product: "genz-builder" }
] as const;
const advisorRoles = new Set(["Senior Academic Advisor", "Junior Academic Advisor"]);
type Mode = "SELF" | "TEAM";

export function createCrossBrandQueue(client: PrismaClient = prisma, now = () => new Date()) {
  async function list(userId: string, mode: Mode) {
    const gateway = await requirePortalAccess(client, userId, "skillcity");
    const actor = await client.user.findUnique({ where: { id: userId }, select: { personId: true, status: true, emailVerifiedAt: true, person: { select: { status: true } } } });
    if (!actor?.personId || actor.status !== "ACTIVE" || actor.person?.status !== "ACTIVE" || !actor.emailVerifiedAt) throw new AccessError("Verified employee required");
    const divisions = await client.organization.findMany({ where: { parentId: gateway.companyId, slug: { in: sources.map(source => source.divisionSlug) }, type: "DIVISION", status: "ACTIVE" }, select: { id: true, slug: true }, take: 3 });
    const pipelines = [];
    for (const source of sources) {
      const division = divisions.find(item => item.slug === source.divisionSlug);
      if (!division) { pipelines.push({ key: source.key, label: source.label, state: "NOT_CONFIGURED" as const, items: [], limited: false, unavailableRecords: 0, productStatus: null }); continue; }
      const ctx = await createAccessContext(userId, client, undefined, { organizationId: division.id });
      const scope = { organizationId: division.id };
      const hasRead = (await ctx.decide("organization.read", scope)).allowed && (await ctx.decide(mode === "SELF" ? source.selfPermission : source.teamPermission, scope)).allowed;
      const hasRole = mode === "TEAM" || ctx.grants.some(grant => advisorRoles.has(grant.roleName ?? "") && (grant.organizationId === division.id || grant.organizationId === gateway.companyId && grant.includeDescendants));
      const hasTeamScope = mode === "SELF" || (await ctx.decide("reporting.read", scope)).allowed && (await ctx.decide("person.read", scope)).allowed;
      if (!hasRead || !hasRole || !hasTeamScope) { pipelines.push({ key: source.key, label: source.label, state: "UNAUTHORIZED" as const, items: [], limited: false, unavailableRecords: 0, productStatus: null }); continue; }
      const reports = mode === "TEAM" ? await client.reportingRelationship.findMany({ where: { organizationId: division.id, managerPersonId: actor.personId, status: "ACTIVE", AND: [{ OR: [{ startDate: null }, { startDate: { lte: now() } }] }, { OR: [{ endDate: null }, { endDate: { gte: now() } }] }], person: { status: "ACTIVE", memberships: { some: { status: "ACTIVE", OR: [{ organizationId: division.id }, { organizationId: gateway.companyId, scope: "DESCENDANTS" }] } } } }, select: { personId: true }, take: 50 }) : [];
      const ownerIds = mode === "SELF" ? [actor.personId] : reports.map(row => row.personId);
      const product = source.product ? await client.product.findUnique({ where: { organizationId_slug: { organizationId: gateway.companyId, slug: source.product } }, select: { divisionId: true, status: true, lifecycle: true } }) : null;
      const productStatus = source.product ? product?.divisionId === division.id ? `${product.lifecycle} / ${product.status}` : "Not configured" : null;
      if (!ownerIds.length) { pipelines.push({ key: source.key, label: source.label, state: "AVAILABLE" as const, items: [], limited: false, unavailableRecords: 0, productStatus }); continue; }
      const where = { organizationId: division.id, kind: source.kind, ownerPersonId: { in: ownerIds }, status: { notIn: ["WON", "LOST"] } };
      const dated = await client.executiveRecord.findMany({ where: { ...where, dueAt: { not: null } }, select: { id: true, title: true, status: true, dueAt: true, payload: true, owner: { select: { displayName: true } } }, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: 31 });
      const undated = dated.length < 31 ? await client.executiveRecord.findMany({ where: { ...where, dueAt: null }, select: { id: true, title: true, status: true, dueAt: true, payload: true, owner: { select: { displayName: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 31 - dated.length }) : [];
      const rows = [...dated, ...undated];
      let unavailableRecords = 0;
      const items = rows.slice(0, 30).flatMap(row => {
        let parsed: { outcome: string; nextFollowUp: string | null } | null = null;
        try {
          const raw = JSON.parse(row.payload);
          if (source.product) {
            const result = crmLeadPayload.safeParse(raw);
            if (result.success && result.data.product === source.product) parsed = result.data;
          } else {
            const result = leadPayload.safeParse(raw);
            if (result.success) parsed = result.data;
          }
        } catch { /* Invalid stored payload is reported as unavailable. */ }
        if (!parsed) { unavailableRecords++; return []; }
        return [{ id: row.id, title: row.title, status: row.status, dueAt: row.dueAt, nextFollowUp: parsed.nextFollowUp, outcome: parsed.outcome, ownerName: mode === "TEAM" ? row.owner.displayName : null, source: source.key }];
      });
      pipelines.push({ key: source.key, label: source.label, state: "AVAILABLE" as const, items, limited: rows.length > 30, unavailableRecords, productStatus });
    }
    return { mode, pipelines, shown: pipelines.reduce((sum, pipeline) => sum + pipeline.items.length, 0) };
  }
  return { list };
}

export const crossBrandQueue = createCrossBrandQueue();
