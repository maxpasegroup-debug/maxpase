import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { operationalEvent } from "@/server/domain/operational-events";
import { buildHrPayslipPdf, type PayslipComponent } from "@/server/group/hr-payslip-pdf";

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const json = (value: string) => { try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; } };
type Component = { label: string; kind: "EARNING" | "DEDUCTION"; basis: "FIXED_MONTHLY" | "PERCENT_OF_BASE"; amountPaise?: string; basisPoints?: number };
const amountFor = (item: Component, base: bigint) => item.basis === "FIXED_MONTHLY" ? BigInt(item.amountPaise ?? "0") : (base * BigInt(item.basisPoints ?? 0) + 5000n) / 10000n;

export function createStartupHrDesk(client: PrismaClient = prisma) {
  async function scope(userId: string) {
    const { ctx, companyId } = await requirePortalAccess(client, userId, "skillcity");
    const [company, division, brand] = await Promise.all([
      client.organization.findUnique({ where: { id: companyId }, select: { slug: true, type: true, status: true } }),
      client.organization.findFirst({ where: { slug: "aira-startup-school", parentId: companyId, type: "DIVISION", status: "ACTIVE" }, select: { id: true, name: true } }),
      client.brand.findFirst({ where: { slug: "startup-school", parentBrandId: null, organization: { slug: "aira-skill-city" }, status: "ACTIVE" }, select: { id: true, name: true } }),
    ]);
    if (!company || company.slug !== "aira-skill-city" || company.type !== "COMPANY" || company.status !== "ACTIVE" || !division || !brand || !ctx.user?.personId) throw new AccessError("Startup Skool HR workspace unavailable");
    const keys = ["startup.hr.people.read", "startup.hr.people.manage", "startup.hr.input.submit", "startup.hr.input.review", "startup.hr.payroll.read", "startup.hr.payroll.detail", "startup.hr.payroll.prepare", "startup.hr.payroll.review", "startup.hr.payroll.release", "startup.hr.payroll.rules.manage", "startup.hr.payroll.rules.approve"];
    const results = await Promise.all(keys.map(key => ctx.decide(key, { organizationId: division.id })));
    const can = (key: string) => results[keys.indexOf(key)]?.allowed ?? false;
    if (!results.some(result => result.allowed)) throw new AccessError("Startup Skool HR access is not authorized");
    return { userId, personId: ctx.user.personId, companyId, divisionId: division.id, divisionName: division.name, brandId: brand.id, brandName: brand.name,
      canReadPeople: can("startup.hr.people.read") || can("startup.hr.people.manage"), canManagePeople: can("startup.hr.people.manage"), canSubmit: can("startup.hr.input.submit"), canCheck: can("startup.hr.input.review"), canReadPayroll: can("startup.hr.payroll.read") || can("startup.hr.payroll.prepare") || can("startup.hr.payroll.review"), canReadPayrollDetails: can("startup.hr.payroll.detail") || can("startup.hr.payroll.prepare"), canPrepare: can("startup.hr.payroll.prepare"), canReview: can("startup.hr.payroll.review"), canRelease: can("startup.hr.payroll.release"), canManageRules: can("startup.hr.payroll.rules.manage"), canApproveRules: can("startup.hr.payroll.rules.approve") };
  }

  async function workspace(userId: string, periodRaw = new Date().toISOString().slice(0, 7)) {
    const s = await scope(userId), period = periodSchema.parse(periodRaw);
    const [periodYear, periodMonth] = period.split("-").map(Number);
    const compensationCutoff = new Date(Date.UTC(periodYear, periodMonth, 0, 23, 59, 59, 999));
    const [assignments, centreRows, inputRows, rules, runs] = await Promise.all([
      s.canReadPeople ? client.hrAssignment.findMany({ where: { brandId: s.brandId }, select: { id: true, employmentId: true, designation: true, departmentId: true, operatingCentreId: true, status: true, startDate: true, endDate: true, employment: { select: { status: true, employmentType: true, person: { select: { displayName: true } }, compensationRecords: { where: { effectiveFrom: { lte: compensationCutoff } }, orderBy: { effectiveFrom: "desc" }, take: 1, select: { id: true } } } } }, orderBy: [{ status: "asc" }, { designation: "asc" }], take: 1000 }) : [],
      client.executiveRecord.findMany({ where: { organizationId: s.divisionId, kind: "STARTUP_CENTRE", status: "ACTIVE", ...(s.canCheck || s.canReadPayroll ? {} : { payload: { contains: '"centreManagerPersonId":"' + s.personId + '"' } }) }, select: { id: true, title: true, status: true, payload: true }, orderBy: { title: "asc" }, take: 500 }),
      client.executiveRecord.findMany({ where: { organizationId: s.divisionId, kind: "STARTUP_HR_INPUT", payload: { contains: '"period":"' + period + '"' }, ...(s.canCheck || s.canReadPayroll ? {} : { ownerPersonId: s.personId }) }, select: { id: true, title: true, status: true, payload: true, version: true, owner: { select: { displayName: true } }, createdAt: true }, orderBy: { updatedAt: "desc" }, take: 1000 }),
      s.canManageRules || s.canApproveRules ? client.hrPayrollRuleSet.findMany({ where: { companyId: s.companyId, brandId: s.brandId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, name: true, status: true, accountantName: true, accountantReviewReference: true, accountantReviewedAt: true, componentsSnapshot: true } }) : [],
      s.canReadPayroll ? client.hrPayrollRun.findMany({ where: { companyId: s.companyId, brandId: s.brandId, period }, include: { lines: { select: { id: true, employeeName: true, designation: true, grossPaise: true, deductionsPaise: true, netPaise: true }, orderBy: { employeeName: "asc" }, take: 1000 } }, orderBy: { createdAt: "desc" }, take: 3 }) : [],
    ]);
    const centres = centreRows.map(row => ({ id: row.id, name: row.title, status: row.status, district: String(json(row.payload).district ?? ""), state: String(json(row.payload).state ?? "") }));
    const inputs = inputRows.map(row => { const p = json(row.payload); return { id: row.id, type: String(p.type ?? ""), centreId: String(p.centreId ?? ""), centreName: String(p.centreName ?? ""), department: String(p.department ?? ""), period: String(p.period ?? ""), present: Number(p.present ?? 0), leaveDays: Number(p.leaveDays ?? 0), openPositions: Number(p.openPositions ?? 0), exceptions: String(p.exceptions ?? ""), status: row.status, version: row.version, owner: row.owner.displayName, createdAt: row.createdAt }; });
    const missingCentres = centres.filter(centre => !inputs.some(input => input.centreId === centre.id && input.type === "ATTENDANCE" && input.status === "CHECKED"));
    const employeesWithoutCentre = assignments.filter(row => row.status === "ACTIVE" && !row.operatingCentreId).length;
    return { ...s, period, centres, staff: assignments.map(row => ({ assignmentId: row.id, employmentId: row.employmentId, name: row.employment.person.displayName, designation: row.designation, centreId: row.operatingCentreId ?? "", assignmentStatus: row.status, employmentType: row.employment.employmentType ?? "", employmentStatus: row.employment.status, startDate: row.startDate, endDate: row.endDate, compensationConfigured: row.employment.compensationRecords.length > 0 })), inputs, missingCentres,
      rules: rules.map(row => ({ id: row.id, name: row.name, status: row.status, reviewed: !!(row.accountantName && row.accountantReviewReference && row.accountantReviewedAt), accountantName: row.accountantName, accountantReviewReference: row.accountantReviewReference, componentsSnapshot: row.componentsSnapshot })),
      runs: runs.map(run => ({ id: run.id, period: run.period, status: run.status, totalGrossPaise: run.totalGrossPaise.toString(), totalDeductionsPaise: run.totalDeductionsPaise.toString(), totalNetPaise: run.totalNetPaise.toString(), reviewReference: run.reviewReference, lines: s.canReadPayrollDetails ? run.lines.map(line => ({ ...line, grossPaise: line.grossPaise.toString(), deductionsPaise: line.deductionsPaise.toString(), netPaise: line.netPaise.toString() })) : [] })),
      summary: { headcount: assignments.filter(row => row.status === "ACTIVE").length, reportsReceived: inputs.length, reportsChecked: inputs.filter(row => row.status === "CHECKED").length, centresAwaitingCheck: missingCentres.length, employeesWithoutCentre } };
  }

  async function assignCentre(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canManagePeople) throw new AccessError("Only Startup Skool HR can change centre assignments");
    const input = z.object({ assignmentId: z.string().min(8).max(200), centreId: z.string().min(8).max(200).or(z.literal("")) }).strict().parse(raw);
    if (input.centreId && !await client.executiveRecord.findFirst({ where: { id: input.centreId, organizationId: s.divisionId, kind: "STARTUP_CENTRE", status: "ACTIVE" }, select: { id: true } })) throw new AccessError("Choose an active Startup Skool centre");
    const assignment = await client.hrAssignment.findFirst({ where: { id: input.assignmentId, brandId: s.brandId, status: "ACTIVE", employment: { companyId: s.companyId } }, select: { id: true } }); if (!assignment) throw new AccessError("Startup Skool employee assignment unavailable");
    await client.$transaction(async db => { await db.hrAssignment.update({ where: { id: assignment.id }, data: { operatingCentreId: input.centreId || null } }); await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.hr.centre_assignment_updated", entityType: "HrAssignment", entityId: assignment.id, result: "SUCCESS", metadata: { centreId: input.centreId || null } }); });
  }

  async function updateAssignment(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canManagePeople) throw new AccessError("Only Startup Skool HR can update employee assignments");
    const input = z.object({ assignmentId: z.string().min(8).max(200), designation: z.string().trim().min(2).max(120), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(["ACTIVE", "ENDED"]), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")) }).strict().superRefine((value, ctx) => { if (value.status === "ENDED" && !value.endDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Enter the last working day before ending an assignment." }); if (value.endDate && value.endDate < value.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "The end date cannot be before the assignment start date." }); }).parse(raw);
    const assignment = await client.hrAssignment.findFirst({ where: { id: input.assignmentId, brandId: s.brandId, employment: { companyId: s.companyId } }, select: { id: true, status: true } }); if (!assignment) throw new AccessError("Startup Skool assignment unavailable");
    const startDate = new Date(input.startDate + "T00:00:00.000Z"), endDate = input.endDate ? new Date(input.endDate + "T00:00:00.000Z") : null;
    if (Number.isNaN(startDate.getTime()) || startDate.toISOString().slice(0, 10) !== input.startDate || endDate && (Number.isNaN(endDate.getTime()) || endDate.toISOString().slice(0, 10) !== input.endDate)) throw new AccessError("Enter valid assignment dates");
    await client.$transaction(async db => { const changed = await db.hrAssignment.updateMany({ where: { id: assignment.id, brandId: s.brandId }, data: { designation: input.designation, startDate, endDate, status: input.status } }); if (changed.count !== 1) throw new AccessError("Assignment changed; refresh and retry"); await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.hr.assignment_updated", entityType: "HrAssignment", entityId: assignment.id, result: "SUCCESS", metadata: { status: input.status, startDate: input.startDate, endDate: input.endDate || null, designation: input.designation } }); });
  }

  async function submitInput(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canSubmit) throw new AccessError("Your role cannot submit workforce reports");
    const input = z.object({ type: z.enum(["ATTENDANCE", "LEAVE", "STAFFING"]), centreId: z.string().min(8).max(200), department: z.string().trim().min(2).max(100), period: periodSchema, present: z.coerce.number().int().min(0).max(10000).default(0), leaveDays: z.coerce.number().int().min(0).max(10000).default(0), openPositions: z.coerce.number().int().min(0).max(1000).default(0), exceptions: z.string().trim().max(1500).default("") }).strict().parse(raw);
    const centre = await client.executiveRecord.findFirst({ where: { id: input.centreId, organizationId: s.divisionId, kind: "STARTUP_CENTRE", status: "ACTIVE" }, select: { id: true, title: true, payload: true } }); if (!centre) throw new AccessError("Choose an active Startup Skool centre");
    if (!s.canCheck && String(json(centre.payload).centreManagerPersonId ?? "") !== s.personId) throw new AccessError("Centre managers can submit only for their assigned centres");
    const sourceKey = "startup:hr:input:" + input.period + ":" + input.centreId + ":" + input.department.toLowerCase() + ":" + input.type;
    await client.$transaction(async db => {
      const existing = await db.executiveRecord.findUnique({ where: { sourceKey }, select: { id: true, status: true } }); if (existing?.status === "CHECKED") throw new AccessError("This checked report cannot be changed. Ask the AO to reopen it for correction.");
      const payload = JSON.stringify({ schemaVersion: 1, ...input, centreName: centre.title, submittedByPersonId: s.personId, submittedAt: new Date().toISOString() });
      const row = existing ? await db.executiveRecord.update({ where: { id: existing.id }, data: { payload, status: "SUBMITTED", version: { increment: 1 }, ownerPersonId: s.personId } }) : await db.executiveRecord.create({ data: { kind: "STARTUP_HR_INPUT", organizationId: s.divisionId, ownerPersonId: s.personId, title: input.type + " · " + centre.title + " · " + input.period, status: "SUBMITTED", sourceKey, payload } });
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, toStatus: "SUBMITTED", reason: input.type.toLowerCase() + " / staffing update submitted" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.hr.input_submitted", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { type: input.type, period: input.period, centreId: centre.id } });
    });
  }

  async function checkInput(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canCheck) throw new AccessError("Only the AO or authorized leadership can review workforce reports");
    const input = z.object({ id: z.string().min(8).max(200), version: z.coerce.number().int().nonnegative(), outcome: z.enum(["CHECKED", "NEEDS_INFO"]), note: z.string().trim().min(5).max(1000) }).strict().parse(raw);
    await client.$transaction(async db => { const row = await db.executiveRecord.findFirst({ where: { id: input.id, organizationId: s.divisionId, kind: "STARTUP_HR_INPUT", version: input.version, status: "SUBMITTED" }, select: { id: true, ownerPersonId: true } }); if (!row) throw new AccessError("Report changed or is no longer awaiting review"); if (row.ownerPersonId === s.personId) throw new AccessError("A different authorized AO or leader must check this report"); const updated = await db.executiveRecord.updateMany({ where: { id: row.id, version: input.version, status: "SUBMITTED" }, data: { status: input.outcome, version: { increment: 1 } } }); if (updated.count !== 1) throw new AccessError("Report changed; refresh and try again"); await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: "SUBMITTED", toStatus: input.outcome, reason: input.note } }); await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.hr.input_checked", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { outcome: input.outcome } }); });
  }

  async function saveRules(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canManageRules) throw new AccessError("Only Startup Skool HR can configure scoped payroll rules");
    const input = z.object({ name: z.string().trim().min(2).max(100), accountantName: z.string().trim().min(3).max(120), accountantReviewReference: z.string().trim().min(8).max(200), componentsJson: z.string().max(10000).default("[]") }).strict().parse(raw);
    let components: Component[]; try { components = z.array(z.object({ label: z.string().trim().min(2).max(80), kind: z.enum(["EARNING", "DEDUCTION"]), basis: z.enum(["FIXED_MONTHLY", "PERCENT_OF_BASE"]), amountPaise: z.string().regex(/^\d+$/).optional(), basisPoints: z.number().int().min(0).max(100000).optional() }).strict()).max(30).parse(JSON.parse(input.componentsJson)); } catch { throw new AccessError("Payroll components must be valid JSON"); }
    for (const item of components) {
      if (item.basis === "FIXED_MONTHLY" && (!item.amountPaise || BigInt(item.amountPaise) > 9_000_000_000_000_000n) || item.basis === "PERCENT_OF_BASE" && item.basisPoints === undefined) throw new AccessError("Every payroll rule needs an amount or percentage within the supported range");
    }
    await client.$transaction(async db => { const row = await db.hrPayrollRuleSet.create({ data: { companyId: s.companyId, brandId: s.brandId, name: input.name, currency: "INR", componentsSnapshot: JSON.stringify(components), status: "DRAFT", accountantName: input.accountantName, accountantReviewReference: input.accountantReviewReference, recordedByUserId: userId } }); await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.hr.payroll_rules_drafted", entityType: "HrPayrollRuleSet", entityId: row.id, result: "SUCCESS", metadata: { brandId: s.brandId, accountantReviewReference: input.accountantReviewReference } }); });
  }

  async function approveRules(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canApproveRules) throw new AccessError("A Startup Skool Director must verify the accountant's written review before activating payroll rules");
    const input = z.object({ ruleId: z.string().min(8).max(200), confirmation: z.string().trim().min(8).max(1000) }).strict().parse(raw);
    await client.$transaction(async db => {
      const rule = await db.hrPayrollRuleSet.findFirst({ where: { id: input.ruleId, companyId: s.companyId, brandId: s.brandId, status: "DRAFT", accountantName: { not: null }, accountantReviewReference: { not: null } }, select: { id: true, recordedByUserId: true, accountantReviewReference: true } });
      if (!rule) throw new AccessError("Draft Startup Skool payroll rules unavailable");
      if (rule.recordedByUserId === userId) throw new AccessError("A different authorized Director must verify payroll rules");
      await db.hrPayrollRuleSet.updateMany({ where: { companyId: s.companyId, brandId: s.brandId, status: "ACTIVE" }, data: { status: "RETIRED" } });
      const changed = await db.hrPayrollRuleSet.updateMany({ where: { id: rule.id, status: "DRAFT" }, data: { status: "ACTIVE", accountantReviewedAt: new Date() } });
      if (changed.count !== 1) throw new AccessError("Payroll rules changed; refresh before approval");
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.hr.payroll_rules_approved", entityType: "HrPayrollRuleSet", entityId: rule.id, result: "SUCCESS", metadata: { reviewReference: rule.accountantReviewReference, confirmation: input.confirmation } });
    });
  }

  async function preparePayroll(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canPrepare) throw new AccessError("Only authorized Startup Skool HR can prepare payroll");
    const input = z.object({ period: periodSchema }).strict().parse(raw), now = new Date(), [year, month] = input.period.split("-").map(Number);
    if (input.period > now.toISOString().slice(0, 7)) throw new AccessError("Payroll cannot be prepared for a future month");
    const start = new Date(Date.UTC(year, month - 1, 1)), lastDay = new Date(Date.UTC(year, month, 0)), end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const state = await workspace(userId, input.period); if (state.missingCentres.length) throw new AccessError("AO must check each active centre attendance report before payroll preparation"); if (state.summary.employeesWithoutCentre) throw new AccessError("Assign every Startup Skool employee to an active centre before payroll preparation");
    const rules = await client.hrPayrollRuleSet.findFirst({ where: { companyId: s.companyId, brandId: s.brandId, status: "ACTIVE", accountantReviewedAt: { not: null } }, orderBy: { accountantReviewedAt: "desc" } }); if (!rules?.accountantName || !rules.accountantReviewReference) throw new AccessError("Record accountant-reviewed Startup Skool payroll rules first");
    const assignmentRows = await client.hrAssignment.findMany({ where: { brandId: s.brandId, status: { in: ["ACTIVE", "ENDED", "TRANSFERRED"] }, startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] }, select: { employmentId: true, designation: true, startDate: true, endDate: true } });
    const assignmentsByEmployee = new Map<string, typeof assignmentRows>();
    for (const row of assignmentRows) assignmentsByEmployee.set(row.employmentId, [...(assignmentsByEmployee.get(row.employmentId) ?? []), row]);
    if ([...assignmentsByEmployee.values()].some(rows => rows.length > 1)) throw new AccessError("An employee has overlapping Startup Skool assignments for this month. HR must correct the assignments before payroll.");
    const ids = [...assignmentsByEmployee.keys()]; if (!ids.length) throw new AccessError("No Startup Skool employee assignments exist for this period");
    const employees = await client.employment.findMany({ where: { id: { in: ids }, companyId: s.companyId, status: { in: ["ACTIVE", "ENDED"] } }, include: { person: { select: { displayName: true } }, compensationRecords: { where: { effectiveFrom: { lte: end } }, orderBy: { effectiveFrom: "desc" }, take: 1 } } });
    const components = JSON.parse(rules.componentsSnapshot) as Component[], excluded: { employee: string; reason: string }[] = [], lines: Array<{ employmentId: string; employeeName: string; employeeEmail: null; designation: string; currency: "INR"; monthlyBasePaise: bigint; monthlyVariablePaise: bigint; ruleEarningsPaise: bigint; grossPaise: bigint; deductionsPaise: bigint; netPaise: bigint; componentsSnapshot: string }> = [];
    for (const employee of employees) {
      const assignment = assignmentsByEmployee.get(employee.id)?.[0];
      if (!assignment || !employee.startDate || employee.status === "ENDED" && !employee.endDate) { excluded.push({ employee: employee.person.displayName, reason: "Employment or Startup Skool assignment dates need review" }); continue; }
      const effectiveStart = assignment.startDate > employee.startDate ? assignment.startDate : employee.startDate;
      const effectiveEnd = assignment.endDate && employee.endDate ? (assignment.endDate < employee.endDate ? assignment.endDate : employee.endDate) : assignment.endDate ?? employee.endDate;
      if (effectiveStart > end || effectiveEnd && effectiveEnd < start) continue;
      if (effectiveStart > start || effectiveEnd && effectiveEnd < lastDay) { excluded.push({ employee: employee.person.displayName, reason: "Partial-month pay needs accountant-reviewed proration/final settlement" }); continue; }
      const compensation = employee.compensationRecords[0]; if (!compensation) throw new AccessError("Effective-dated compensation is missing for " + employee.person.displayName);
      const base = compensation.monthlyBasePaise, variable = compensation.monthlyVariablePaise; let earnings = 0n, deductions = 0n;
      const snapshots: Array<{ label: string; kind: "EARNING" | "DEDUCTION"; amountPaise: string }> = [{ label: "Monthly base pay", kind: "EARNING", amountPaise: base.toString() }, ...(variable > 0n ? [{ label: "Recurring variable pay", kind: "EARNING" as const, amountPaise: variable.toString() }] : [])];
      for (const component of components) { const amount = amountFor(component, base); snapshots.push({ label: component.label, kind: component.kind, amountPaise: amount.toString() }); if (component.kind === "EARNING") earnings += amount; else deductions += amount; }
      const gross = base + variable + earnings; if (gross > 9_000_000_000_000_000n) throw new AccessError("Calculated gross exceeds the supported limit for " + employee.person.displayName); if (deductions > gross) throw new AccessError("Configured deductions exceed gross pay for " + employee.person.displayName);
      lines.push({ employmentId: employee.id, employeeName: employee.person.displayName, employeeEmail: null, designation: assignment.designation || employee.designation || "Employee", currency: "INR", monthlyBasePaise: base, monthlyVariablePaise: variable, ruleEarningsPaise: earnings, grossPaise: gross, deductionsPaise: deductions, netPaise: gross - deductions, componentsSnapshot: JSON.stringify(snapshots) });
    }
    if (!lines.length) throw new AccessError("No full-month employees are eligible; resolve date exceptions with the accountant");
    const totalGross = lines.reduce((sum, line) => sum + line.grossPaise, 0n), totalDeductions = lines.reduce((sum, line) => sum + line.deductionsPaise, 0n), totalNet = lines.reduce((sum, line) => sum + line.netPaise, 0n);
    try { return await client.$transaction(async db => { const existing = await db.hrPayrollRun.findFirst({ where: { companyId: s.companyId, brandId: s.brandId, period: input.period, status: { not: "VOID" } }, select: { id: true } }); if (existing) throw new AccessError("A Startup Skool payroll run already exists for this period"); const run = await db.hrPayrollRun.create({ data: { companyId: s.companyId, brandId: s.brandId, period: input.period, ruleSetId: rules.id, ruleSnapshot: rules.componentsSnapshot, excludedEmployeesSnapshot: JSON.stringify(excluded), totalGrossPaise: totalGross, totalDeductionsPaise: totalDeductions, totalNetPaise: totalNet, createdByUserId: userId, lines: { create: lines } } }); await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.hr.payroll_prepared", entityType: "HrPayrollRun", entityId: run.id, result: "SUCCESS", metadata: { brandId: s.brandId, period: input.period, headcount: lines.length } }); return run.id; }); } catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new AccessError("A Startup Skool payroll run already exists for this period"); throw error; }
  }

  async function authorizeRelease(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canRelease) throw new AccessError("Only an authorized Startup Skool Director can authorize payroll release");
    const input = z.object({ runId: z.string().min(8).max(200), reference: z.string().trim().min(8).max(200), reason: z.string().trim().min(8).max(1000) }).strict().parse(raw);
    await client.$transaction(async db => { const run = await db.hrPayrollRun.findFirst({ where: { id: input.runId, companyId: s.companyId, brandId: s.brandId, status: "DRAFT" }, select: { id: true, period: true, createdByUserId: true } }); if (!run) throw new AccessError("Draft Startup Skool payroll run unavailable"); if (run.createdByUserId === userId) throw new AccessError("A different authorized Director must review and authorize payroll"); const changed = await db.hrPayrollRun.updateMany({ where: { id: run.id, brandId: s.brandId, status: "DRAFT" }, data: { status: "REVIEWED", reviewedAt: new Date(), reviewedByUserId: userId, reviewReference: input.reference } }); if (changed.count !== 1) throw new AccessError("Payroll changed; refresh and try again"); await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.hr.payroll_release_authorized", entityType: "HrPayrollRun", entityId: run.id, result: "SUCCESS", metadata: { period: run.period, reference: input.reference, reason: input.reason } }); });
  }

  async function payslip(userId: string, lineId: string) {
    const s = await scope(userId); if (!s.canReadPayrollDetails) throw new AccessError("Payslip access is limited to authorized Startup Skool HR");
    const line = await client.hrPayrollLine.findFirst({ where: { id: lineId, run: { companyId: s.companyId, brandId: s.brandId, status: "REVIEWED", reviewReference: { not: null } }, employment: { companyId: s.companyId } }, include: { run: { include: { company: { select: { name: true } } } } } });
    if (!line) throw new AccessError("Authorized Startup Skool payslip unavailable");
    const components = JSON.parse(line.componentsSnapshot) as PayslipComponent[];
    return { bytes: buildHrPayslipPdf({ companyName: line.run.company.name + " · AIRA Startup Skool", period: line.run.period, employeeName: line.employeeName, designation: line.designation, components, grossPaise: line.grossPaise.toString(), deductionsPaise: line.deductionsPaise.toString(), netPaise: line.netPaise.toString(), reviewReference: line.run.reviewReference! }), filename: "startup-skool-payslip-" + line.run.period + "-" + line.id + ".pdf" };
  }

  return { workspace, assignCentre, updateAssignment, submitInput, checkInput, saveRules, approveRules, preparePayroll, authorizeRelease, payslip };
}
export const startupHrDesk = createStartupHrDesk();
