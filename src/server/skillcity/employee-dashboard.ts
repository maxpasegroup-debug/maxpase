import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { leadPayload } from "@/server/labs/input";
import { staffOnboardingService } from "./staff-onboarding";
import { advisorCrm } from "./crm";
import { staffInvite } from "./staff-invite";
import { createSkillCityDeveloperDesk } from "./developer-desk";
import { skillCityLabsService } from "@/server/labs/service";

export const employeeViews = ["advisor", "director", "manager", "developer", "business-development"] as const;
export type EmployeeView = typeof employeeViews[number];

export function createSkillCityEmployeeDashboard(client: PrismaClient = prisma) {
  async function dashboard(userId: string, requested?: string) {
    const access = await requirePortalAccess(client, userId, "skillcity");
    const { ctx, companyId } = access;
    const personId = ctx.user?.personId;
    if (!personId) throw new AccessError("Employee identity unavailable");
    const divisions = await client.organization.findMany({ where: { parentId: companyId, type: "DIVISION", status: "ACTIVE", slug: { in: ["aira-labs", "aira-startup-school", "aira-skill-studio", "aira-career-hub"] } }, select: { id: true, slug: true, name: true }, take: 4 });
    const labs = divisions.find(d => d.slug === "aira-labs");
    const hasRole = (scopes: string[], ...names: string[]) => ctx.grants.some(grant => scopes.includes(grant.organizationId ?? "") && names.includes(grant.roleName ?? ""));
    const can = (key: string, organizationId: string) => ctx.decide(key, { organizationId }).then(result => result.allowed);
    const allowed = {
      director: hasRole([companyId], "Director") && await can("executive.read", companyId) && await can("decision.decide", companyId) || (await Promise.all(divisions.map(async division => hasRole([division.id], "Division Director") && await can("executive.read", division.id) && await can("decision.decide", division.id)))).some(Boolean),
      manager: hasRole([companyId, ...divisions.map(d => d.id)], "Director", "Division Director", "Business Development & Operations Manager") && (await Promise.all([companyId, ...divisions.map(d => d.id)].map(async id => await can("reporting.read", id) && await can("person.read", id) && await can("responsibility.read", id)))).some(Boolean),
      advisor: hasRole([companyId, ...divisions.map(d => d.id)], "Senior Academic Advisor", "Junior Academic Advisor") && (await Promise.all(divisions.map(async d => d.slug === "aira-labs" ? await can("labs.sales.self", d.id) : await can("aira.crm.self", d.id)))).some(Boolean),
      developer: !!labs && hasRole([companyId, labs.id], "Software Developer", "Full Stack Developer", "Junior Developer") && await can("labs.delivery.assignee", labs.id) && await can("organization.read", labs.id),
      "business-development": !!labs && hasRole([labs.id], "Business Development Manager") && await can("labs.sales.read", labs.id) && await can("organization.read", labs.id)
    };
    const available = employeeViews.filter(view => allowed[view]);
    if (requested && !employeeViews.includes(requested as EmployeeView)) throw new AccessError("Employee view unavailable");
    if (requested && !allowed[requested as EmployeeView]) throw new AccessError("Employee view unavailable");
    const view = (requested as EmployeeView | undefined) ?? (allowed.director ? "director" : available[0]);
    if (!view) return { view: null, available, companyId, name: ctx.user?.id ?? "", data: null };

    if (view === "manager") return { view, available, companyId, name: "Manager", data: {} };

    if (view === "advisor") {
      const labsAccess = !!labs && await can("labs.sales.self", labs.id) && await can("organization.read", labs.id);
      const base: Prisma.ExecutiveRecordWhereInput = { kind: "LABS_LEAD", organizationId: labs?.id ?? "", ownerPersonId: personId, status: { notIn: ["WON", "LOST"] } };
      const select = { id: true, title: true, status: true, dueAt: true, payload: true, version: true } as const;
      const scheduled = labsAccess ? await client.executiveRecord.findMany({ where: { ...base, dueAt: { not: null } }, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: 30, select }) : [];
      const undated = labsAccess && scheduled.length < 30 ? await client.executiveRecord.findMany({ where: { ...base, dueAt: null }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 30 - scheduled.length, select }) : [];
      const rows = [...scheduled, ...undated];
      const leads = rows.map(row => { let detail; try { detail = leadPayload.safeParse(JSON.parse(row.payload)); } catch { detail = null; } return { id: row.id, title: row.title, status: row.status, dueAt: row.dueAt, version: row.version, outcome: detail?.success ? detail.data.outcome : "", qualification: detail?.success ? detail.data.qualification : "", nextFollowUp: detail?.success ? detail.data.nextFollowUp : null }; });
      const pipelines = [];
      for (const target of [{ slug: "pba", divisionSlug: "aira-startup-school" }, { slug: "genz-builder", divisionSlug: "aira-skill-studio" }]) {
        const division = divisions.find(d => d.slug === target.divisionSlug);
        if (division && await can("aira.crm.self", division.id) && await can("organization.read", division.id)) pipelines.push({ slug: target.slug, ...(await advisorCrm.list(userId, target.slug)) });
      }
      const productReadable = await can("product.read", companyId);
      const products = productReadable ? await client.product.findMany({ where: { organizationId: companyId, slug: { in: ["bgos", "pba", "genz-builder"] } }, select: { slug: true, name: true, status: true, lifecycle: true, description: true }, take: 3 }) : [];
      return { view, available, companyId, name: "Academic Advisor", data: { leads, pipelines, products, productReadable, canUpdateLabs: labsAccess && await can("labs.sales.perform", labs!.id), labsId: labsAccess ? labs!.id : null } };
    }
    if (view === "developer") {
      const data = await createSkillCityDeveloperDesk(client).workspace(userId);
      return { view, available, companyId, name: "Labs Developer", data };
    }
    if (view === "business-development") return { view, available, companyId, name: "AIRA Labs Business Development", data: await skillCityLabsService.list(userId) };
    const divisionRows = [];
    for (const division of divisions) {
      divisionRows.push({ id: division.id, name: division.name,
        projects: await can("project.read", division.id) ? await client.project.count({ where: { organizationId: division.id, status: { in: ["PLANNED", "ACTIVE", "BLOCKED"] } } }) : null,
        tasks: await can("task.read", division.id) ? await client.task.count({ where: { organizationId: division.id, status: { notIn: ["COMPLETED", "CANCELLED"] } } }) : null,
        programs: await can("program.read", division.id) ? await client.program.count({ where: { organizationId: division.id, status: "ACTIVE" } }) : null,
        people: await can("membership.read", division.id) ? await client.membership.count({ where: { organizationId: division.id, projectId: null, status: "ACTIVE" } }) : null,
        blockers: await can("project.read", division.id) ? await client.project.count({ where: { organizationId: division.id, status: "BLOCKED" } }) : null,
        sales: division.slug === "aira-labs" && await can("labs.sales.read", division.id) ? await client.executiveRecord.count({ where: { organizationId: division.id, kind: "LABS_LEAD", status: { notIn: ["WON", "LOST"] } } }) : null });
    }
    const approvals = await client.siaApproval.findMany({ where: { approverUserId: userId, status: "PENDING", request: { organizationId: { in: divisions.map(d => d.id).concat(companyId) }, status: "SUBMITTED", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }, include: { request: { select: { id: true, title: true, organizationId: true, projectId: true, expiresAt: true } } }, orderBy: { createdAt: "asc" }, take: 25 });
    const decisions = [];
    for (const approval of approvals) if (approval.request && (await ctx.decide("approval.read", { organizationId: approval.request.organizationId, projectId: approval.request.projectId })).allowed && (await ctx.decide("approval.decide", { organizationId: approval.request.organizationId, projectId: approval.request.projectId })).allowed && (await ctx.decide(approval.requiredPermission, { organizationId: approval.request.organizationId, projectId: approval.request.projectId })).allowed) decisions.push({ id: approval.id, title: approval.request.title, organizationId: approval.request.organizationId, expiresAt: approval.request.expiresAt });
    const staff = [];
    for (const target of [{ id: companyId, name: "AIRA Skill City" }, ...divisions]) {
      const options = await staffOnboardingService.options(userId, target.id);
      if (options.canPrepare) staff.push({ organizationId: target.id, name: target.name, roles: options.roles, managers: options.managers, existingPeople: options.existingPeople, drafts: await staffInvite.drafts(userId, target.id) });
    }
    const crm = [];
    for (const target of [{ slug: "pba", divisionSlug: "aira-startup-school", label: "PBA" }, { slug: "genz-builder", divisionSlug: "aira-skill-studio", label: "GenZ Builder" }]) {
      const division = divisions.find(d => d.slug === target.divisionSlug);
      if (division && await can("aira.crm.manage", division.id)) crm.push({ slug: target.slug, label: target.label, owners: await advisorCrm.eligibleOwners(userId, target.slug), pipeline: await advisorCrm.list(userId, target.slug) });
    }
    return { view, available, companyId, name: "Director", data: { divisions: divisionRows, decisions, staff, crm, canManageLabsCustomers: !!labs && await can("labs.customer.manage", labs.id), inviteDeliveryReady: staffInvite.deliveryReady() } };
  }
  return { dashboard };
}

export const skillCityEmployeeDashboard = createSkillCityEmployeeDashboard();
