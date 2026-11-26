import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { leadPayload } from "@/server/labs/input";
import { createStaffOnboardingService } from "./staff-onboarding";
import { createAdvisorCrm } from "./crm";
import { createStaffInvite } from "./staff-invite";
import { createSkillCityDeveloperDesk } from "./developer-desk";
import { createLabsService } from "@/server/labs/service";
import { createSkillCityAdministrativeDesk } from "./administrative-desk";
import { startupOperationsDesk } from "./startup-operations-desk";
import { startupCentreDesk } from "./startup-centre-desk";
import { startupAdmissionsDesk } from "./startup-admissions-desk";
import { startupLeadsDesk } from "./startup-leads-desk";
import { startupRecordsGrievancesDesk } from "./startup-records-grievances-desk";
import { startupFinanceDesk } from "./startup-finance-desk";
import { startupHrDesk } from "./startup-hr-desk";
import { startupReportsDesk } from "./startup-reports-desk";

export const employeeViews = ["advisor", "director", "manager", "administrative-officer", "startup-operations", "startup-leads", "startup-admissions", "startup-hr", "startup-reports", "developer", "business-development", "media"] as const;
export type EmployeeView = typeof employeeViews[number];

export function createSkillCityEmployeeDashboard(client: PrismaClient = prisma) {
  const staffOnboardingService = createStaffOnboardingService(client);
  const advisorCrm = createAdvisorCrm(client);
  const staffInvite = createStaffInvite(client);
  const skillCityLabsService = createLabsService(client, () => new Date(), "skillcity");
  const administrativeDesk = createSkillCityAdministrativeDesk(client);
  async function dashboard(userId: string, requested?: string, reportFilters?: unknown) {
    const access = await requirePortalAccess(client, userId, "skillcity");
    const { ctx, companyId } = access;
    const personId = ctx.user?.personId;
    if (!personId) throw new AccessError("Employee identity unavailable");
    const divisions = await client.organization.findMany({ where: { parentId: companyId, type: "DIVISION", status: "ACTIVE", slug: { in: ["aira-labs", "aira-startup-school", "aira-skill-studio", "aira-career-hub", "aira-media-company"] } }, select: { id: true, slug: true, name: true }, take: 5 });
    const labs = divisions.find(d => d.slug === "aira-labs");
    const hasRole = (scopes: string[], ...names: string[]) => ctx.grants.some(grant => scopes.includes(grant.organizationId ?? "") && names.includes(grant.roleName ?? ""));
    const can = (key: string, organizationId: string) => ctx.decide(key, { organizationId }).then(result => result.allowed);
    const allowed = {
      director: hasRole([companyId], "Director") && await can("executive.read", companyId) && await can("decision.decide", companyId) || (await Promise.all(divisions.map(async division => hasRole([division.id], "Division Director") && await can("executive.read", division.id) && await can("decision.decide", division.id)))).some(Boolean),
      manager: hasRole([companyId, ...divisions.map(d => d.id)], "Director", "Division Director", "Business Development & Operations Manager", "Administrative Officer", "Digital Marketing Manager") && (await Promise.all([companyId, ...divisions.map(d => d.id)].map(async id => await can("reporting.read", id) && await can("person.read", id) && await can("responsibility.read", id)))).some(Boolean),
      "administrative-officer": hasRole([companyId], "Administrative Officer") && await can("organization.read", companyId) && await can("company.read", companyId) && await can("skillcity.administrative.read", companyId) && await can("skillcity.administrative.task.perform", companyId) && await can("task.read", companyId) && !!labs && await can("labs.billing.status.read", labs.id) && await can("labs.billing.customer.read", labs.id) && await can("labs.billing.customer.manage", labs.id),
      "startup-admissions": !!divisions.find(d => d.slug === "aira-startup-school") && hasRole([divisions.find(d => d.slug === "aira-startup-school")!.id], "Startup Skool Administrative Officer") && await can("startup.application.read", divisions.find(d => d.slug === "aira-startup-school")!.id) && await can("startup.application.triage", divisions.find(d => d.slug === "aira-startup-school")!.id),
      "startup-operations": !!divisions.find(d => d.slug === "aira-startup-school") && (await can("startup.operations.read", divisions.find(d => d.slug === "aira-startup-school")!.id) || await can("startup.operations.submit", divisions.find(d => d.slug === "aira-startup-school")!.id) || await can("startup.operations.manage", divisions.find(d => d.slug === "aira-startup-school")!.id)),
      "startup-leads": !!divisions.find(d => d.slug === "aira-startup-school") && (await can("startup.lead.read", divisions.find(d => d.slug === "aira-startup-school")!.id) || await can("startup.lead.manage", divisions.find(d => d.slug === "aira-startup-school")!.id)),
      "startup-hr": !!divisions.find(d => d.slug === "aira-startup-school") && (await can("startup.hr.people.read", divisions.find(d => d.slug === "aira-startup-school")!.id) || await can("startup.hr.people.manage", divisions.find(d => d.slug === "aira-startup-school")!.id) || await can("startup.hr.input.submit", divisions.find(d => d.slug === "aira-startup-school")!.id) || await can("startup.hr.input.review", divisions.find(d => d.slug === "aira-startup-school")!.id) || await can("startup.hr.payroll.read", divisions.find(d => d.slug === "aira-startup-school")!.id) || await can("startup.hr.payroll.review", divisions.find(d => d.slug === "aira-startup-school")!.id)),
      "startup-reports": !!divisions.find(d => d.slug === "aira-startup-school") && await can("startup.reports.read", divisions.find(d => d.slug === "aira-startup-school")!.id),
      advisor: hasRole([companyId, ...divisions.map(d => d.id)], "Senior Academic Advisor", "Junior Academic Advisor") && (await Promise.all(divisions.map(async d => d.slug === "aira-labs" ? await can("labs.sales.self", d.id) : await can("aira.crm.self", d.id)))).some(Boolean),
      developer: !!labs && hasRole([companyId, labs.id], "Software Developer", "Full Stack Developer", "Junior Developer") && await can("labs.delivery.assignee", labs.id) && await can("organization.read", labs.id),
      "business-development": !!labs && hasRole([labs.id], "Business Development Manager") && await can("labs.sales.read", labs.id) && await can("organization.read", labs.id),
      media: !!divisions.find(d => d.slug === "aira-media-company") && hasRole([divisions.find(d => d.slug === "aira-media-company")!.id], "Digital Marketing Manager", "Graphic Designer", "Video and Audio Editor", "AI Video Expert") && await can("task.read", divisions.find(d => d.slug === "aira-media-company")!.id) && await can("organization.read", divisions.find(d => d.slug === "aira-media-company")!.id)
    };
    if (allowed["startup-admissions"]) allowed["administrative-officer"] = false;
    const available = employeeViews.filter(view => allowed[view] && !(view === "startup-admissions" && allowed["startup-operations"]));
    if (requested && !employeeViews.includes(requested as EmployeeView)) throw new AccessError("Employee view unavailable");
    if (requested && !allowed[requested as EmployeeView]) throw new AccessError("Employee view unavailable");
    const view = (requested as EmployeeView | undefined) ?? (allowed.director ? "director" : allowed["startup-operations"] ? "startup-operations" : allowed["startup-hr"] ? "startup-hr" : allowed["startup-leads"] ? "startup-leads" : allowed["startup-admissions"] ? "startup-admissions" : allowed["administrative-officer"] ? "administrative-officer" : available[0]);
    if (!view) return { view: null, available, companyId, name: ctx.user?.id ?? "", data: null };

    if (view === "manager") return { view, available, companyId, name: "Manager", data: {} };
    if (view === "administrative-officer") return { view, available, companyId, name: "Administrative Officer", data: await administrativeDesk.workspace(userId) };
    if (view === "startup-operations") {
      const data = await startupOperationsDesk.workspace(userId);
      const centres = await startupCentreDesk.workspace(userId);
      const governance = await startupRecordsGrievancesDesk.workspace(userId);
      const finance = await startupFinanceDesk.workspace(userId);
      const startup = divisions.find(d => d.slug === "aira-startup-school");
      const admissionsAccess = !!startup && await can("startup.application.read", startup.id) && await can("startup.application.triage", startup.id);
      return { view, available, companyId, name: data.canManage ? "Startup Skool Administrative Officer" : "Startup Skool Centre Manager", data: { ...data, centres, governance, finance, admissions: admissionsAccess ? await startupAdmissionsDesk.page(userId) : null, admissionsHref: "/sites/skillcity/admissions" } };
    }
    if (view === "startup-leads") {
      const data = await startupLeadsDesk.page(userId);
      return { view, available, companyId, name: data.canManage ? "Startup Skool AO" : "Admissions Caller", data };
    }
    if (view === "startup-hr") return { view, available, companyId, name: "Startup Skool HR & Payroll", data: await startupHrDesk.workspace(userId) };
    if (view === "startup-reports") return { view, available, companyId, name: "Startup Skool Director Reports", data: await startupReportsDesk.workspace(userId, reportFilters) };
    if (view === "startup-admissions") return { view, available, companyId, name: "Startup Skool Administrative Officer", data: { divisionId: divisions.find(d => d.slug === "aira-startup-school")!.id } };
    if (view === "media") {
      const media = divisions.find(d => d.slug === "aira-media-company");
      if (!media) throw new AccessError("AIRA Media workspace unavailable");
      const mediaRoles = ctx.grants.filter(grant => grant.organizationId === media.id).map(grant => grant.roleName ?? "");
      const manager = mediaRoles.includes("Digital Marketing Manager");
      const tasks = await client.task.findMany({ where: { organizationId: media.id, ...(manager ? {} : { assigneePersonId: personId }), status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true, title: true, description: true, status: true, priority: true, dueDate: true, assigneePersonId: true }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 100 });
      return { view, available, companyId, name: manager ? "Digital Marketing Manager" : mediaRoles.find(role => ["Graphic Designer", "Video and Audio Editor", "AI Video Expert"].includes(role)) ?? "AIRA Media", data: { tasks, manager } };
    }

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
    const startupDivision = divisions.find(d => d.slug === "aira-startup-school");
    const startupAdmissions = startupDivision && await can("startup.application.read", startupDivision.id) && await can("program.manage", startupDivision.id) ? {
      pending: (await client.startupPublicApplicant.count({ where: { organizationId: companyId, submittedAt: { not: null }, status: { in: ["SUBMITTED", "IN_REVIEW"] } } })) +
        (await client.executiveRecord.count({ where: { organizationId: startupDivision.id, kind: "STARTUP_APPLICATION", sourceKey: { startsWith: "startup:application:" }, status: { in: ["SUBMITTED", "IN_REVIEW"] } } })),
    } : null;
    return { view, available, companyId, name: "Director", data: { divisions: divisionRows, decisions, staff, crm, startupAdmissions, canManageLabsCustomers: !!labs && await can("labs.customer.manage", labs.id), inviteDeliveryReady: staffInvite.deliveryReady() } };
  }
  return { dashboard };
}

export const skillCityEmployeeDashboard = createSkillCityEmployeeDashboard();
