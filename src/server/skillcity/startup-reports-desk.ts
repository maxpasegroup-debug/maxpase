import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { operationalEvent } from "@/server/domain/operational-events";

const filterSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).or(z.literal("ALL")).optional(),
  state: z.string().trim().max(100).optional(), district: z.string().trim().max(100).optional(),
  centre: z.string().trim().max(160).optional(), department: z.string().trim().max(100).optional(),
}).strict();
const object = (raw: string | null | undefined): Record<string, unknown> => { try { const parsed: unknown = JSON.parse(raw ?? "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; } };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const matches = (value: unknown, selected: string | undefined) => !selected || text(value).toLocaleLowerCase() === selected.toLocaleLowerCase();

export function createStartupReportsDesk(client: PrismaClient = prisma) {
  async function workspace(userId: string, rawFilters: unknown = {}) {
    const filters = filterSchema.parse(rawFilters);
    const { ctx, companyId } = await requirePortalAccess(client, userId, "skillcity");
    const [company, division, brand] = await Promise.all([
      client.organization.findUnique({ where: { id: companyId }, select: { slug: true, type: true, status: true } }),
      client.organization.findFirst({ where: { slug: "aira-startup-school", parentId: companyId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } }),
      client.brand.findFirst({ where: { slug: "startup-school", parentBrandId: null, organization: { slug: "aira-skill-city" }, status: "ACTIVE" }, select: { id: true } }),
    ]);
    if (!company || company.slug !== "aira-skill-city" || company.type !== "COMPANY" || company.status !== "ACTIVE" || !division || !brand || !ctx.user?.personId) throw new AccessError("Startup Skool reports are unavailable");
    await ctx.requireAccess("startup.reports.read", { organizationId: division.id });

    const period = filters.period ?? new Date().toISOString().slice(0, 7);
    const periodStart = period === "ALL" ? undefined : new Date(`${period}-01T00:00:00.000Z`);
    const periodEnd = period === "ALL" ? undefined : new Date(Date.UTC(periodStart!.getUTCFullYear(), periodStart!.getUTCMonth() + 1, 1));
    const inPeriod = (createdAt: Date, payload: Record<string, unknown>) => period === "ALL" || (text(payload.period) ? text(payload.period) === period : !!periodStart && !!periodEnd && createdAt >= periodStart && createdAt < periodEnd);
    const inLocation = (payload: Record<string, unknown>, centreName = "") => matches(payload.state, filters.state) && matches(payload.district, filters.district) && (!filters.centre || [centreName, payload.centre, payload.centreName, payload.preferredCentre].some(value => text(value).toLocaleLowerCase() === filters.centre!.toLocaleLowerCase() || text(value).toLocaleLowerCase().includes(filters.centre!.toLocaleLowerCase())));
    const [leadRows, activityRows, linkRows, centreRows, financeRows, grievanceRows, documentRows, publicApplicants, legacyApplications, payrollRuns, assignments, hrInputs, operationsRows] = await Promise.all([
      client.executiveRecord.findMany({ where: { organizationId: division.id, kind: "STARTUP_PROSPECT_LEAD" }, select: { id: true, status: true, payload: true, createdAt: true, dueAt: true }, take: 3000 }),
      client.executiveRecord.findMany({ where: { organizationId: division.id, kind: "STARTUP_LEAD_ACTIVITY" }, select: { status: true, payload: true, createdAt: true, dueAt: true }, take: 5000 }),
      client.executiveRecord.findMany({ where: { organizationId: division.id, kind: "STARTUP_LEAD_APPLICATION_LINK", status: "LINKED" }, select: { payload: true, createdAt: true }, take: 3000 }),
      client.executiveRecord.findMany({ where: { organizationId: division.id, kind: "STARTUP_CENTRE" }, select: { id: true, title: true, status: true, payload: true, createdAt: true, dueAt: true }, take: 2000 }),
      client.executiveRecord.findMany({ where: { organizationId: division.id, kind: { in: ["STARTUP_FINANCE_BUDGET", "STARTUP_FINANCE_REQUEST"] } }, select: { kind: true, status: true, payload: true, createdAt: true, dueAt: true }, take: 5000 }),
      client.executiveRecord.findMany({ where: { organizationId: division.id, kind: "STARTUP_GRIEVANCE" }, select: { status: true, payload: true, createdAt: true, dueAt: true }, take: 2000 }),
      client.executiveRecord.findMany({ where: { organizationId: division.id, kind: "STARTUP_RECORD_DOCUMENT" }, select: { payload: true, createdAt: true }, take: 3000 }),
      client.startupPublicApplicant.findMany({ where: { organizationId: companyId, status: { in: ["SUBMITTED", "IN_REVIEW", "CLARIFICATION_REQUIRED", "RETURNED_TO_AO", "APPROVED", "REJECTED"] }, submittedAt: { not: null } }, select: { id: true, status: true, state: true, district: true, preferredCentre: true, programPreference: true, submittedAt: true }, take: 3000 }),
      client.executiveRecord.findMany({ where: { organizationId: division.id, kind: "STARTUP_APPLICATION", sourceKey: { startsWith: "startup:application:" }, status: { in: ["SUBMITTED", "IN_REVIEW", "CLARIFICATION_REQUIRED", "RETURNED_TO_AO", "APPROVED", "REJECTED"] } }, select: { status: true, payload: true, createdAt: true }, take: 3000 }),
      client.hrPayrollRun.findMany({ where: { companyId, brandId: brand.id, ...(period === "ALL" ? {} : { period }) }, select: { status: true, period: true, createdAt: true }, orderBy: { period: "desc" }, take: 60 }),
      client.hrAssignment.findMany({ where: { brandId: brand.id, status: "ACTIVE", employment: { companyId, status: "ACTIVE" } }, select: { operatingCentreId: true, department: { select: { name: true } } }, take: 3000 }),
      client.executiveRecord.findMany({ where: { organizationId: division.id, kind: "STARTUP_HR_INPUT", ...(period === "ALL" ? {} : { payload: { contains: `"period":"${period}"` } }) }, select: { status: true, payload: true, createdAt: true }, take: 3000 }),
      client.executiveRecord.findMany({ where: { organizationId: division.id, kind: "STARTUP_OPS_ITEM" }, select: { status: true, payload: true, createdAt: true }, take: 3000 }),
    ]);

    const leads = leadRows.filter(row => inPeriod(row.createdAt, object(row.payload)) && inLocation(object(row.payload)));
    const leadIds = new Set(leads.map(row => row.id));
    const activities = activityRows.filter(row => { const p = object(row.payload); return leadIds.has(text(p.leadId)) && inPeriod(row.createdAt, p); });
    const linked = new Set(linkRows.flatMap(row => { const p = object(row.payload); return leadIds.has(text(p.linkedLeadId)) && inPeriod(row.createdAt, p) ? [text(p.linkedLeadId)] : []; }));
    const apps = [
      ...publicApplicants.flatMap(row => {
        const p = { state: row.state, district: row.district, centre: row.preferredCentre, department: "" };
        return row.submittedAt && inPeriod(row.submittedAt, { period: "" }) && inLocation(p) ? [{ status: row.status, program: row.programPreference ?? "" }] : [];
      }),
      ...legacyApplications.flatMap(row => { const p = object(row.payload); return inPeriod(row.createdAt, p) && inLocation({ state: p.state ?? p.location, district: p.district, centre: p.preferredCentre, department: "" }) ? [{ status: row.status, program: text(p.tier) }] : []; }),
    ];
    const counts = (items: { status: string }[]) => Object.fromEntries(["SUBMITTED", "IN_REVIEW", "CLARIFICATION_REQUIRED", "RETURNED_TO_AO", "APPROVED", "REJECTED"].map(status => [status, items.filter(item => item.status === status).length]));
    const centres = centreRows.filter(row => inPeriod(row.createdAt, object(row.payload)) && inLocation(object(row.payload), row.title));
    const centrePayloads = centres.map(row => ({ row, payload: object(row.payload) }));
    const overdueSetupTasks = centrePayloads.reduce((total, { payload }) => total + (Array.isArray(payload.setupTasks) ? payload.setupTasks.filter(task => !!task && typeof task === "object" && !!(task as Record<string, unknown>).dueAt && new Date(String((task as Record<string, unknown>).dueAt)).getTime() < Date.now() && !(task as Record<string, unknown>).completedAt).length : 0), 0);
    const finance = financeRows.filter(row => inPeriod(row.createdAt, object(row.payload)) && inLocation(object(row.payload)) && matches(object(row.payload).department, filters.department));
    const budgets = finance.filter(row => row.kind === "STARTUP_FINANCE_BUDGET");
    const expenses = finance.filter(row => row.kind === "STARTUP_FINANCE_REQUEST");
    const grievances = grievanceRows.filter(row => inPeriod(row.createdAt, object(row.payload)) && inLocation(object(row.payload)));
    const overdueGrievances = grievances.filter(row => !!row.dueAt && row.dueAt < new Date() && !["RESOLVED", "CLOSED"].includes(row.status)).length;
    const missingCentreDocuments = centrePayloads.filter(({ payload }) => !Array.isArray(payload.attachments) || payload.attachments.length === 0).length;
    const missingDocumentFiles = documentRows.filter(row => inPeriod(row.createdAt, object(row.payload)) && inLocation(object(row.payload)) && (!Array.isArray(object(row.payload).files) || (object(row.payload).files as unknown[]).length === 0)).length;
    const renewals = centrePayloads.filter(({ payload }) => { const date = text(payload.propertyEndDate); if (!date) return false; const days = (new Date(`${date}T00:00:00.000Z`).getTime() - Date.now()) / 86_400_000; return days >= 0 && days <= 90; }).length;
    const centreMap = new Map<string, Record<string, unknown>>(centreRows.map(row => [row.id, { ...object(row.payload), name: row.title }]));
    const activeHeadcount = assignments.filter(row => (!filters.centre && !filters.state && !filters.district || !!row.operatingCentreId && (!filters.centre || (text(centreMap.get(row.operatingCentreId)?.name) || text(centreMap.get(row.operatingCentreId)?.centreName)).toLocaleLowerCase().includes(filters.centre.toLocaleLowerCase())) && (!filters.state || matches(centreMap.get(row.operatingCentreId)?.state, filters.state)) && (!filters.district || matches(centreMap.get(row.operatingCentreId)?.district, filters.district))) && matches(row.department?.name, filters.department)).length;
    const staffingGaps = hrInputs.filter(row => { const p = object(row.payload); return inPeriod(row.createdAt, p) && inLocation(p) && matches(p.department, filters.department) && Number(p.openPositions ?? 0) > 0; }).reduce((total, row) => total + Math.max(0, Number(object(row.payload).openPositions ?? 0)), 0);
    const operationsReports = operationsRows.filter(row => { const p = object(row.payload); return text(p.kind) === "REPORT" && inPeriod(row.createdAt, p) && inLocation(p) && matches(p.department, filters.department); });
    const payrollStatus = (filters.state || filters.district || filters.centre || filters.department) ? [] : payrollRuns;
    const options = {
      periods: [...new Set([...leadRows, ...activityRows, ...centreRows, ...financeRows, ...grievanceRows, ...documentRows, ...legacyApplications, ...operationsRows].map(row => text(object(row.payload).period) || row.createdAt.toISOString().slice(0, 7)).concat(payrollRuns.map(row => row.period)).filter(Boolean))].sort().reverse(),
      states: [...new Set([...leadRows, ...centreRows, ...financeRows, ...grievanceRows, ...documentRows, ...hrInputs, ...operationsRows].map(row => text(object(row.payload).state)).concat(publicApplicants.map(row => text(row.state))).filter(Boolean))].sort(),
      districts: [...new Set([...leadRows, ...centreRows, ...financeRows, ...grievanceRows, ...documentRows, ...hrInputs, ...operationsRows].map(row => text(object(row.payload).district)).concat(publicApplicants.map(row => text(row.district))).filter(Boolean))].sort(),
      centres: [...new Set([...leadRows, ...financeRows, ...grievanceRows, ...documentRows, ...hrInputs, ...operationsRows].map(row => text(object(row.payload).centreName ?? object(row.payload).centre)).concat(centreRows.map(row => row.title), publicApplicants.map(row => text(row.preferredCentre))).filter(Boolean))].sort(),
      departments: [...new Set([...financeRows, ...hrInputs, ...operationsRows].map(row => text(object(row.payload).department)).filter(Boolean))].sort(),
    };
    await client.$transaction(async db => {
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: division.id, action: "startup.reports.viewed", entityType: "Organization", entityId: division.id, result: "SUCCESS", metadata: { period, filtersApplied: [filters.state && "state", filters.district && "district", filters.centre && "centre", filters.department && "department"].filter((value): value is string => !!value) } });
    });
    return {
      period, filters: { state: filters.state ?? "", district: filters.district ?? "", centre: filters.centre ?? "", department: filters.department ?? "" }, options,
      partial: leadRows.length === 3000 || activityRows.length === 5000 || linkRows.length === 3000 || centreRows.length === 2000 || financeRows.length === 5000 || grievanceRows.length === 2000 || documentRows.length === 3000 || publicApplicants.length === 3000 || legacyApplications.length === 3000 || payrollRuns.length === 60 || assignments.length === 3000 || hrInputs.length === 3000 || operationsRows.length === 3000,
      leads: { total: leads.length, calls: activities.length, callbacksDue: leads.filter(row => row.dueAt && row.dueAt <= new Date() && !["DO_NOT_CONTACT", "NOT_INTERESTED", "WRONG_NUMBER", "APPLICATION_SUBMITTED"].includes(row.status)).length, linkedApplications: linked.size, conversionPercent: leads.length ? Math.round(linked.size * 1000 / leads.length) / 10 : 0 },
      admissions: { total: apps.length, statuses: counts(apps), awaitingLeadership: apps.filter(row => row.status === "IN_REVIEW").length },
      centres: { total: centres.length, proposals: centres.filter(row => ["PROPOSED", "UNDER_REVIEW"].includes(row.status)).length, active: centres.filter(row => row.status === "ACTIVE").length, readyForOpening: centrePayloads.filter(({ row, payload }) => row.status === "SETUP" && Array.isArray(payload.setupTasks) && payload.setupTasks.length > 0 && (payload.setupTasks as Record<string, unknown>[]).every(task => !!task.completedAt)).length, overdueSetupTasks },
      finance: { budgetRecords: budgets.length, expenses: expenses.length, awaitingReview: expenses.filter(row => ["SUBMITTED", "PENDING_DIRECTOR", "PENDING_REVIEW"].includes(row.status)).length, missingBills: expenses.filter(row => ["APPROVED", "PAID"].includes(row.status) && !text(object(row.payload).billFileId)).length, payrollRuns: payrollStatus.map(row => ({ period: row.period, status: row.status })) },
      people: { activeHeadcount, staffingGaps },
      verifiedReports: { total: operationsReports.length, checked: operationsReports.filter(row => ["CHECKED", "FORWARDED_TO_LEADERSHIP", "COMPLETED"].includes(row.status)).length, awaitingReview: operationsReports.filter(row => ["SUBMITTED", "IN_REVIEW", "NEEDS_INFO"].includes(row.status)).length, forwarded: operationsReports.filter(row => row.status === "FORWARDED_TO_LEADERSHIP").length },
      grievances: { open: grievances.filter(row => !["RESOLVED", "CLOSED"].includes(row.status)).length, overdue: overdueGrievances },
      records: { missingDocuments: missingCentreDocuments + missingDocumentFiles, renewalsDueWithin90Days: renewals, note: "Missing documents count centres without attachments plus document-register entries without files. Document expiry dates are not yet structured; renewals count uses centre property-end dates only." },
      generatedAt: new Date(),
    };
  }
  return { workspace };
}

export const startupReportsDesk = createStartupReportsDesk();
