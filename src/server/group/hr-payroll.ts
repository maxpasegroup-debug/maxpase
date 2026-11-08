import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { buildHrPayslipPdf, type PayslipComponent } from "./hr-payslip-pdf";
import { createBossService } from "./boss-service";
import { hrDocuments } from "./hr-documents";

const id = z.string().min(1).max(200);
const reference = z.string().trim().min(8).max(200);
const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const componentInput = z.array(z.object({ label: z.string().trim().min(2).max(80), kind: z.enum(["EARNING", "DEDUCTION"]), basis: z.enum(["FIXED_MONTHLY", "PERCENT_OF_BASE"]), value: z.string().trim().min(1).max(30) }).strict()).max(30);
type PayrollComponent = { label: string; kind: "EARNING" | "DEDUCTION"; basis: "FIXED_MONTHLY" | "PERCENT_OF_BASE"; amountPaise?: string; basisPoints?: number };
type PayrollRunRow = Prisma.HrPayrollRunGetPayload<{ include: { ruleSet: { select: { id: true; name: true; status: true; accountantName: true; accountantReviewReference: true } }; lines: { include: { payment: true; payslipDocument: { select: { id: true } } } } } }>;

function moneyToPaise(raw: string) {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(raw.trim());
  if (!match) throw new AccessError("Enter an amount in rupees with up to two decimal places");
  const paise = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  if (paise > 9000000000000000n) throw new AccessError("Amount is outside the supported range");
  return paise;
}
function normalizeComponents(raw: unknown): PayrollComponent[] {
  return componentInput.parse(raw).map(row => {
    if (row.basis === "FIXED_MONTHLY") return { label: row.label, kind: row.kind, basis: row.basis, amountPaise: moneyToPaise(row.value).toString() };
    const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(row.value);
    if (!match) throw new AccessError("Enter a percentage between 0 and 1000 with up to two decimal places");
    const basisPoints = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
    if (basisPoints > 100000) throw new AccessError("Enter a percentage between 0 and 1000");
    return { label: row.label, kind: row.kind, basis: row.basis, basisPoints };
  });
}
function amountFor(component: PayrollComponent, basePaise: bigint) {
  return component.basis === "FIXED_MONTHLY" ? BigInt(component.amountPaise ?? "0") : (basePaise * BigInt(component.basisPoints ?? 0) + 5000n) / 10000n;
}
function periodDates(period: string) {
  const match = periodSchema.safeParse(period);
  if (!match.success) throw new AccessError("Choose a valid payroll month");
  const [year, month] = period.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, lastDay, end };
}
function serializeRun(run: PayrollRunRow) {
  return {
    ...run,
    totalGrossPaise: String(run.totalGrossPaise), totalDeductionsPaise: String(run.totalDeductionsPaise), totalNetPaise: String(run.totalNetPaise),
    lines: run.lines.map(line => ({ ...line, monthlyBasePaise: String(line.monthlyBasePaise), monthlyVariablePaise: String(line.monthlyVariablePaise), ruleEarningsPaise: String(line.ruleEarningsPaise), grossPaise: String(line.grossPaise), deductionsPaise: String(line.deductionsPaise), netPaise: String(line.netPaise), payment: line.payment ? { ...line.payment, amountPaise: String(line.payment.amountPaise) } : null })),
  };
}

export function createHrPayrollService(client: PrismaClient = prisma, now: () => Date = () => new Date()) {
  const boss = createBossService(client);
  async function scope(db: Prisma.TransactionClient | PrismaClient, userId: string, companyId: string, permission: string) {
    const { ctx, root } = await boss.authority(userId, db as Prisma.TransactionClient);
    const company = await db.organization.findFirst({ where: { id: companyId, parentId: root.id, type: "COMPANY", status: "ACTIVE" }, select: { id: true, name: true, slug: true } });
    if (!company) throw new AccessError("Company unavailable");
    await ctx.requireAccess(permission, { organizationId: companyId });
    return { ctx, company };
  }
  async function list(userId: string, companyId: string) {
    await scope(client, userId, companyId, "person.update");
    const [company, rules, compensation, runs] = await Promise.all([
      client.organization.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, name: true, slug: true } }),
      client.hrPayrollRuleSet.findMany({ where: { companyId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 30 }),
      client.hrCompensation.findMany({ where: { companyId }, include: { employment: { include: { person: { select: { displayName: true } } } } }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }], take: 300 }),
      client.hrPayrollRun.findMany({ where: { companyId }, include: { ruleSet: { select: { id: true, name: true, status: true, accountantName: true, accountantReviewReference: true } }, lines: { include: { payment: true, payslipDocument: { select: { id: true } } }, orderBy: { employeeName: "asc" }, take: 1000 } }, orderBy: [{ period: "desc" }, { createdAt: "desc" }], take: 24 }),
    ]);
    return {
      company,
      rules: rules.map(row => ({ ...row, components: JSON.parse(row.componentsSnapshot) as PayrollComponent[] })),
      compensation: compensation.map(row => ({ ...row, monthlyBasePaise: String(row.monthlyBasePaise), monthlyVariablePaise: String(row.monthlyVariablePaise) })),
      runs: runs.map(serializeRun),
      employees: await client.employment.findMany({ where: { companyId, status: { in: ["ACTIVE", "DRAFT"] } }, include: { person: { select: { displayName: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 500 }),
      payslipStorageReady: hrDocuments.configured(),
    };
  }
  async function createRuleSet(userId: string, raw: unknown) {
    const input = z.object({ companyId: id, name: z.string().trim().min(2).max(100), components: componentInput }).strict().parse(raw);
    const components = normalizeComponents(input.components);
    return client.$transaction(async db => {
      const { ctx } = await scope(db, userId, input.companyId, "person.update");
      const row = await db.hrPayrollRuleSet.create({ data: { companyId: input.companyId, name: input.name, currency: "INR", componentsSnapshot: JSON.stringify(components), recordedByUserId: userId } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: "hr.payroll_rules_drafted", entityType: "HrPayrollRuleSet", entityId: row.id, result: "SUCCESS", metadata: { name: row.name, componentCount: components.length } });
      return row.id;
    });
  }
  async function activateRuleSet(userId: string, raw: unknown) {
    const input = z.object({ companyId: id, ruleSetId: id, accountantName: z.string().trim().min(3).max(120), accountantReviewReference: reference }).strict().parse(raw);
    return client.$transaction(async db => {
      const { ctx } = await scope(db, userId, input.companyId, "person.update");
      const target = await db.hrPayrollRuleSet.findFirst({ where: { id: input.ruleSetId, companyId: input.companyId, status: "DRAFT" } });
      if (!target) throw new AccessError("Draft payroll rules unavailable");
      await db.hrPayrollRuleSet.updateMany({ where: { companyId: input.companyId, status: "ACTIVE" }, data: { status: "RETIRED" } });
      const updated = await db.hrPayrollRuleSet.update({ where: { id: target.id }, data: { status: "ACTIVE", accountantName: input.accountantName, accountantReviewReference: input.accountantReviewReference, accountantReviewedAt: now() } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: "hr.payroll_rules_accountant_review_recorded", entityType: "HrPayrollRuleSet", entityId: updated.id, result: "SUCCESS", metadata: { accountantName: updated.accountantName, accountantReviewReference: updated.accountantReviewReference } });
      return updated.id;
    });
  }
  async function addCompensation(userId: string, raw: unknown) {
    const input = z.object({ companyId: id, employmentId: id, effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), monthlyBase: z.string().max(20), monthlyVariable: z.string().max(20).default("0"), decisionReference: reference }).strict().parse(raw);
    const effectiveDate = new Date(`${input.effectiveFrom}T00:00:00.000Z`);
    if (Number.isNaN(effectiveDate.getTime()) || effectiveDate.toISOString().slice(0, 10) !== input.effectiveFrom) throw new AccessError("Enter a valid effective date");
    const base = moneyToPaise(input.monthlyBase), variable = moneyToPaise(input.monthlyVariable);
    if (base <= 0n) throw new AccessError("Monthly base pay must be greater than zero");
    return client.$transaction(async db => {
      const { ctx } = await scope(db, userId, input.companyId, "person.update");
      const employment = await db.employment.findFirst({ where: { id: input.employmentId, companyId: input.companyId, status: { in: ["ACTIVE", "DRAFT"] } }, select: { id: true } });
      if (!employment) throw new AccessError("Employee is unavailable in this company");
      const period = input.effectiveFrom.slice(0, 7);
      if (await db.hrPayrollRun.findFirst({ where: { companyId: input.companyId, period: { gte: period }, status: { not: "VOID" } }, select: { id: true } })) throw new AccessError("A payroll register already exists for this or a later month. Use an accountant-reviewed correction process instead of backdating compensation.");
      const row = await db.hrCompensation.create({ data: { companyId: input.companyId, employmentId: input.employmentId, effectiveFrom: effectiveDate, currency: "INR", monthlyBasePaise: base, monthlyVariablePaise: variable, decisionReference: input.decisionReference, createdByUserId: userId } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: "hr.compensation_record_created", entityType: "HrCompensation", entityId: row.id, result: "SUCCESS", metadata: { employmentId: input.employmentId, effectiveFrom: input.effectiveFrom, decisionReference: input.decisionReference } });
      return row.id;
    });
  }
  async function createRun(userId: string, raw: unknown) {
    const input = z.object({ companyId: id, period: periodSchema }).strict().parse(raw);
    const dates = periodDates(input.period);
    if (input.period > now().toISOString().slice(0, 7)) throw new AccessError("A payroll register cannot be created for a future month");
    try {
      return await client.$transaction(async db => {
        const { ctx } = await scope(db, userId, input.companyId, "person.update");
        const existing = await db.hrPayrollRun.findFirst({ where: { companyId: input.companyId, period: input.period, status: { not: "VOID" } }, select: { id: true } });
        if (existing) return { runId: existing.id, existing: true };
        const rules = await db.hrPayrollRuleSet.findFirst({ where: { companyId: input.companyId, status: "ACTIVE" }, orderBy: { accountantReviewedAt: "desc" } });
        if (!rules || !rules.accountantName || !rules.accountantReviewReference || !rules.accountantReviewedAt) throw new AccessError("Record the accountant's written review of payroll rules before preparing a register");
        const components = JSON.parse(rules.componentsSnapshot) as PayrollComponent[];
        const employments = await db.employment.findMany({ where: { companyId: input.companyId, status: { in: ["ACTIVE", "ENDED"] } }, include: { person: { select: { displayName: true } }, compensationRecords: { where: { effectiveFrom: { lte: dates.end } }, orderBy: { effectiveFrom: "desc" }, take: 1 } }, orderBy: { createdAt: "asc" }, take: 1001 });
        if (employments.length > 1000) throw new AccessError("This monthly register is limited to 1,000 employees; use the accountant's approved process for larger payrolls");
        const excluded: { employee: string; reason: string }[] = [];
        const lines: { employmentId: string; employeeName: string; employeeEmail: null; designation: string; currency: "INR"; monthlyBasePaise: bigint; monthlyVariablePaise: bigint; ruleEarningsPaise: bigint; grossPaise: bigint; deductionsPaise: bigint; netPaise: bigint; componentsSnapshot: string }[] = [];
        const missingCompensation: string[] = [];
        for (const employee of employments) {
          const start = employee.startDate, end = employee.endDate;
          if (!start) { excluded.push({ employee: employee.person.displayName, reason: "Employment start date is missing" }); continue; }
          if (employee.status === "ENDED" && !end) { excluded.push({ employee: employee.person.displayName, reason: "Ended employment has no end date" }); continue; }
          if (start > dates.end || end && end < dates.start) continue;
          if (start > dates.start || end && end < dates.lastDay) { excluded.push({ employee: employee.person.displayName, reason: "Partial-month employment needs accountant-reviewed proration or final-settlement handling" }); continue; }
          const compensation = employee.compensationRecords[0];
          if (!compensation) { missingCompensation.push(employee.person.displayName); continue; }
          const base = compensation.monthlyBasePaise, variable = compensation.monthlyVariablePaise;
          const componentRows: PayslipComponent[] = [
            { label: "Monthly base pay", kind: "EARNING", amountPaise: base.toString() },
            ...(variable > 0n ? [{ label: "Recurring monthly variable pay", kind: "EARNING" as const, amountPaise: variable.toString() }] : []),
          ];
          let earnings = 0n, deductions = 0n;
          for (const component of components) {
            const amount = amountFor(component, base);
            componentRows.push({ label: component.label, kind: component.kind, amountPaise: amount.toString() });
            if (component.kind === "EARNING") earnings += amount; else deductions += amount;
          }
          const gross = base + variable + earnings;
          if (gross > 9000000000000000n) throw new AccessError(`Calculated gross pay is outside the supported range for ${employee.person.displayName}`);
          if (deductions > gross) throw new AccessError(`Configured deductions exceed gross pay for ${employee.person.displayName}`);
          lines.push({ employmentId: employee.id, employeeName: employee.person.displayName, employeeEmail: null, designation: employee.designation ?? "Employee", currency: "INR", monthlyBasePaise: base, monthlyVariablePaise: variable, ruleEarningsPaise: earnings, grossPaise: gross, deductionsPaise: deductions, netPaise: gross - deductions, componentsSnapshot: JSON.stringify(componentRows) });
        }
        if (missingCompensation.length) throw new AccessError(`Add effective-dated compensation before preparing this register: ${missingCompensation.slice(0, 10).join(", ")}`);
        if (!lines.length) throw new AccessError("No full-month employee rows are eligible. Resolve missing dates or partial-month cases with the accountant first.");
        const totalGross = lines.reduce((sum, line) => sum + line.grossPaise, 0n), totalDeductions = lines.reduce((sum, line) => sum + line.deductionsPaise, 0n), totalNet = lines.reduce((sum, line) => sum + line.netPaise, 0n);
        const run = await db.hrPayrollRun.create({ data: { companyId: input.companyId, period: input.period, ruleSetId: rules.id, ruleSnapshot: rules.componentsSnapshot, excludedEmployeesSnapshot: JSON.stringify(excluded), totalGrossPaise: totalGross, totalDeductionsPaise: totalDeductions, totalNetPaise: totalNet, createdByUserId: userId, lines: { create: lines } } });
        await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: "hr.payroll_register_created", entityType: "HrPayrollRun", entityId: run.id, result: "SUCCESS", metadata: { period: input.period, headcount: lines.length, totalNetPaise: totalNet.toString(), ruleSetId: rules.id, excludedCount: excluded.length } });
        return { runId: run.id, existing: false };
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        const existing = await client.hrPayrollRun.findFirst({ where: { companyId: input.companyId, period: input.period, status: { not: "VOID" } }, select: { id: true } });
        if (existing) return { runId: existing.id, existing: true };
      }
      throw error;
    }
  }
  async function reviewRun(userId: string, raw: unknown) {
    const input = z.object({ companyId: id, runId: id, reviewReference: reference }).strict().parse(raw);
    return client.$transaction(async db => {
      const { ctx } = await scope(db, userId, input.companyId, "person.update");
      const changed = await db.hrPayrollRun.updateMany({ where: { id: input.runId, companyId: input.companyId, status: "DRAFT" }, data: { status: "REVIEWED", reviewReference: input.reviewReference, reviewedByUserId: userId, reviewedAt: now() } });
      if (changed.count !== 1) throw new AccessError("Draft payroll register unavailable");
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: "hr.payroll_register_reviewed", entityType: "HrPayrollRun", entityId: input.runId, result: "SUCCESS", metadata: { reviewReference: input.reviewReference } });
      return "REVIEWED";
    });
  }
  async function voidRun(userId: string, raw: unknown) {
    const input = z.object({ companyId: id, runId: id, voidReference: reference }).strict().parse(raw);
    return client.$transaction(async db => {
      const { ctx } = await scope(db, userId, input.companyId, "person.update");
      const changed = await db.hrPayrollRun.updateMany({ where: { id: input.runId, companyId: input.companyId, status: "DRAFT" }, data: { status: "VOID", voidReference: input.voidReference, voidedAt: now(), voidedByUserId: userId } });
      if (changed.count !== 1) throw new AccessError("Only an unreleased draft register can be voided");
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: "hr.payroll_draft_voided", entityType: "HrPayrollRun", entityId: input.runId, result: "SUCCESS", metadata: { voidReference: input.voidReference } });
      return "VOID";
    });
  }
  async function recordPayment(userId: string, raw: unknown) {
    const input = z.object({ companyId: id, lineId: id, amount: z.string().max(20), paymentReference: reference, evidenceReference: reference, paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().parse(raw);
    const amount = moneyToPaise(input.amount);
    if (amount <= 0n) throw new AccessError("Payment amount must be greater than zero");
    const paidAt = new Date(`${input.paidAt}T00:00:00.000Z`);
    if (Number.isNaN(paidAt.getTime()) || paidAt.toISOString().slice(0, 10) !== input.paidAt) throw new AccessError("Enter a valid payment date");
    if (paidAt > now()) throw new AccessError("Payment date cannot be in the future");
    return client.$transaction(async db => {
      const { ctx } = await scope(db, userId, input.companyId, "person.update");
      const line = await db.hrPayrollLine.findFirst({ where: { id: input.lineId, run: { companyId: input.companyId, status: "REVIEWED" } }, include: { payment: true } });
      if (!line) throw new AccessError("Reviewed payroll row unavailable");
      const runLock = await db.hrPayrollRun.updateMany({ where: { id: line.runId, companyId: input.companyId, status: "REVIEWED" }, data: { updatedAt: now() } });
      if (runLock.count !== 1) throw new AccessError("Payroll register has already been reconciled");
      const payment = await db.hrPayrollPayment.upsert({ where: { lineId: line.id }, create: { lineId: line.id, amountPaise: amount, paymentReference: input.paymentReference, evidenceReference: input.evidenceReference, paidAt, recordedByUserId: userId }, update: { amountPaise: amount, paymentReference: input.paymentReference, evidenceReference: input.evidenceReference, paidAt, status: "RECORDED", reconciledAt: null, recordedByUserId: userId } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: "hr.payroll_payment_recorded", entityType: "HrPayrollPayment", entityId: payment.id, result: "SUCCESS", metadata: { lineId: line.id, paymentReference: input.paymentReference, amountPaise: amount.toString() } });
      return payment.id;
    });
  }
  async function reconcileRun(userId: string, raw: unknown) {
    const input = z.object({ companyId: id, runId: id, reconciliationReference: reference }).strict().parse(raw);
    return client.$transaction(async db => {
      const { ctx } = await scope(db, userId, input.companyId, "person.update");
      const run = await db.hrPayrollRun.findFirst({ where: { id: input.runId, companyId: input.companyId, status: "REVIEWED" }, select: { id: true, companyId: true, totalNetPaise: true, period: true } });
      if (!run) throw new AccessError("Reviewed payroll register unavailable");
      const changed = await db.hrPayrollRun.updateMany({ where: { id: run.id, status: "REVIEWED" }, data: { status: "RECONCILED", reconciliationReference: input.reconciliationReference, reconciledAt: now(), reconciledByUserId: userId } });
      if (changed.count !== 1) throw new AccessError("Payroll register changed during reconciliation");
      const lines = await db.hrPayrollLine.findMany({ where: { runId: run.id }, include: { payment: true } });
      const missing = lines.filter(line => !line.payment);
      const mismatched = lines.filter(line => line.payment && line.payment.amountPaise !== line.netPaise);
      const paidTotal = lines.reduce((total, line) => total + (line.payment?.amountPaise ?? 0n), 0n);
      if (missing.length || mismatched.length || paidTotal !== run.totalNetPaise) throw new AccessError(`Cannot reconcile yet: ${missing.length} employee payment(s) missing, ${mismatched.length} amount(s) differ from net pay`);
      await db.hrPayrollPayment.updateMany({ where: { lineId: { in: lines.map(line => line.id) } }, data: { status: "RECONCILED", reconciledAt: now() } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: "hr.payroll_register_reconciled", entityType: "HrPayrollRun", entityId: run.id, result: "SUCCESS", metadata: { reconciliationReference: input.reconciliationReference, paymentTotalPaise: paidTotal.toString(), headcount: lines.length } });
      return "RECONCILED";
    });
  }
  async function payslip(actorId: string, lineId: string) {
    const line = await client.hrPayrollLine.findUnique({ where: { id: lineId }, include: { run: { include: { company: { select: { name: true } } } } } });
    if (!line || !["REVIEWED", "RECONCILED"].includes(line.run.status) || !line.run.reviewReference) throw new AccessError("Reviewed payslip unavailable");
    await scope(client, actorId, line.run.companyId, "person.update");
    const components = JSON.parse(line.componentsSnapshot) as PayslipComponent[];
    return { bytes: buildHrPayslipPdf({ companyName: line.run.company.name, period: line.run.period, employeeName: line.employeeName, designation: line.designation, components, grossPaise: line.grossPaise.toString(), deductionsPaise: line.deductionsPaise.toString(), netPaise: line.netPaise.toString(), reviewReference: line.run.reviewReference }), filename: `payslip-${line.run.period}-${line.id}.pdf` };
  }
  async function storePayslip(actorId: string, lineId: string) {
    const line = await client.hrPayrollLine.findUnique({ where: { id: lineId }, include: { run: true } });
    if (!line || !["REVIEWED", "RECONCILED"].includes(line.run.status)) throw new AccessError("Reviewed payslip unavailable");
    await scope(client, actorId, line.run.companyId, "person.update");
    if (line.payslipDocumentId) return true;
    const pdf = await payslip(actorId, lineId);
    const documentId = await hrDocuments.upload(actorId, { employmentId: line.employmentId, categoryKey: "PAYSLIP", title: `Payslip ${line.run.period} - ${line.employeeName}`.slice(0, 160), filename: pdf.filename }, pdf.bytes, { allowEnded: true });
    await client.hrPayrollLine.update({ where: { id: line.id }, data: { payslipDocumentId: documentId } });
    return true;
  }
  return { list, createRuleSet, activateRuleSet, addCompensation, createRun, reviewRun, voidRun, recordPayment, reconcileRun, payslip, storePayslip };
}

export const hrPayrollService = createHrPayrollService();
