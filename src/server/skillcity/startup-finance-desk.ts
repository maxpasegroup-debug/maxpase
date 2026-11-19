import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { operationalEvent } from "@/server/domain/operational-events";
import { privateContentStorage } from "@/server/nicejobs/content-storage";
import { validateContentFile } from "@/server/nicejobs/content-validation";

const json = (value: string) => { try { const data: unknown = JSON.parse(value); return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {}; } catch { return {}; } };
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const requestTypes = ["PURCHASE", "EXPENSE", "BILL", "REIMBURSEMENT"] as const;
const periods = z.string().regex(/^20\d{2}-\d{2}$/, "Use a financial year such as 2026-27.").refine(value => Number(value.slice(5)) === (Number(value.slice(0, 4)) + 1) % 100, "The financial period must cover one year.");
const paise = (raw: unknown, allowZero = false) => {
  const value = z.string().trim().regex(/^\d{1,11}(?:\.\d{1,2})?$/, "Enter a positive amount with up to two decimal places.").parse(String(raw ?? ""));
  const [rupees, cents = ""] = value.split(".");
  const amount = BigInt(rupees) * 100n + BigInt(cents.padEnd(2, "0"));
  if ((!allowZero && amount <= 0n) || allowZero && amount < 0n || amount > 99_999_999_999_999n) throw new Error("Amount must be within the supported range.");
  return amount.toString();
};
const moneySchema = z.string().regex(/^\d+$/);
const withPayload = <T extends { payload: string }>(row: T) => ({ ...row, payload: json(row.payload) });

export function createStartupFinanceDesk(client: PrismaClient = prisma) {
  const storage = privateContentStorage();
  async function scope(userId: string) {
    const { ctx, companyId } = await requirePortalAccess(client, userId, "skillcity");
    const [company, division] = await Promise.all([
      client.organization.findUnique({ where: { id: companyId }, select: { slug: true, type: true, status: true } }),
      client.organization.findFirst({ where: { slug: "aira-startup-school", parentId: companyId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } }),
    ]);
    if (!company || company.slug !== "aira-skill-city" || company.type !== "COMPANY" || company.status !== "ACTIVE" || !division || !ctx.user?.personId) throw new AccessError("Startup Skool finance workspace unavailable");
    const keys = ["startup.finance.read", "startup.finance.submit", "startup.finance.manage", "startup.finance.approve.routine", "startup.finance.approve.all", "startup.finance.policy.manage", "startup.finance.payment.record"];
    const grants = await Promise.all(keys.map(key => ctx.decide(key, { organizationId: division.id })));
    const has = (key: string) => grants[keys.indexOf(key)]?.allowed ?? false;
    return { userId, personId: ctx.user.personId, companyId, divisionId: division.id, canRead: has("startup.finance.read") || has("startup.finance.manage") || has("startup.finance.approve.all"), canSubmit: has("startup.finance.submit") || has("startup.finance.manage"), canManage: has("startup.finance.manage"), canApproveRoutine: has("startup.finance.approve.routine"), canApproveAll: has("startup.finance.approve.all"), canSetPolicy: has("startup.finance.policy.manage"), canRecordPayment: has("startup.finance.payment.record") };
  }

  async function workspace(userId: string) {
    const s = await scope(userId);
    if (!s.canRead && !s.canSubmit) return { ...s, budgets: [], requests: [], centres: [], policyLimitPaise: "0", metrics: { pending: 0, duePayments: 0, missingBills: 0, overspentBudgets: 0 } };
    const [budgetRows, requestRows, policy, centres] = await Promise.all([
      client.executiveRecord.findMany({ where: { organizationId: s.divisionId, kind: "STARTUP_FINANCE_BUDGET", ...(s.canManage || s.canApproveAll ? {} : { OR: [{ status: "APPROVED" }, { ownerPersonId: s.personId }] }) }, select: { id: true, title: true, status: true, payload: true, version: true, createdAt: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 500 }),
      client.executiveRecord.findMany({ where: { organizationId: s.divisionId, kind: "STARTUP_FINANCE_REQUEST", ...(s.canManage || s.canApproveAll || s.canApproveRoutine || s.canRecordPayment ? {} : { ownerPersonId: s.personId }) }, select: { id: true, ownerPersonId: true, title: true, status: true, payload: true, dueAt: true, version: true, createdAt: true, updatedAt: true, owner: { select: { displayName: true } } }, orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }], take: 600 }),
      client.executiveRecord.findUnique({ where: { sourceKey: `startup:finance-policy:${s.divisionId}` }, select: { payload: true } }),
      client.executiveRecord.findMany({ where: { organizationId: s.divisionId, kind: "STARTUP_CENTRE", status: { not: "CLOSED" } }, select: { id: true, title: true, payload: true }, orderBy: { title: "asc" }, take: 500 }),
    ]);
    const requests = requestRows.map(row => ({ ...withPayload(row), ownerName: row.owner.displayName }));
    const commitments = requests.filter(row => row.status === "APPROVED").reduce((map, row) => { const budgetId = String(row.payload.budgetId ?? ""); map.set(budgetId, (map.get(budgetId) ?? 0n) + BigInt(String(row.payload.amountPaise ?? "0"))); return map; }, new Map<string, bigint>());
    const actuals = requests.filter(row => row.status === "APPROVED" && row.payload.paymentStatus === "PAID").reduce((map, row) => { const budgetId = String(row.payload.budgetId ?? ""); map.set(budgetId, (map.get(budgetId) ?? 0n) + BigInt(String(row.payload.amountPaise ?? "0"))); return map; }, new Map<string, bigint>());
    const budgets = budgetRows.map(row => {
      const item = withPayload(row), amount = BigInt(moneySchema.parse(String(item.payload.amountPaise ?? "0"))), spent = commitments.get(row.id) ?? 0n;
      return { id: row.id, title: row.title, status: row.status, centreId: String(item.payload.centreId ?? ""), centreName: String(item.payload.centreName ?? ""), district: String(item.payload.district ?? ""), department: String(item.payload.department ?? ""), period: String(item.payload.period ?? ""), amountPaise: amount.toString(), committedPaise: spent.toString(), actualPaise: (actuals.get(row.id) ?? 0n).toString(), remainingPaise: (amount > spent ? amount - spent : 0n).toString(), version: row.version, createdAt: row.createdAt };
    });
    const normalizedRequests = requests.map(row => ({ id: row.id, title: row.title, status: row.status, requestType: String(row.payload.requestType ?? "EXPENSE"), centreId: String(row.payload.centreId ?? ""), centreName: String(row.payload.centreName ?? ""), district: String(row.payload.district ?? ""), department: String(row.payload.department ?? ""), period: String(row.payload.period ?? ""), budgetId: String(row.payload.budgetId ?? ""), amountPaise: String(row.payload.amountPaise ?? "0"), vendor: String(row.payload.vendor ?? ""), description: String(row.payload.description ?? ""), billFileId: String(row.payload.billFileId ?? ""), billFilename: String(row.payload.billFilename ?? ""), missingBill: ["APPROVED", "PAID"].includes(row.status) && !row.payload.billFileId, paymentStatus: String(row.payload.paymentStatus ?? "NOT_PAID"), paidAt: String(row.payload.paidAt ?? ""), paymentReference: String(row.payload.paymentReference ?? ""), dueAt: row.dueAt, version: row.version, createdAt: row.createdAt, ownerName: row.ownerName }));
    const policyLimitPaise = String(json(policy?.payload ?? "{}").aoRoutineApprovalLimitPaise ?? "0");
    const budgetKeys = new Set(budgets.filter(b => b.status === "APPROVED").map(b => `${b.centreId}|${b.department.toLowerCase()}|${b.period}`));
    const overspentBudgets = budgets.filter(b => b.status === "APPROVED" && BigInt(b.committedPaise) > BigInt(b.amountPaise)).length;
    return { ...s, budgets, requests: normalizedRequests, centres: centres.map(row => ({ id: row.id, name: row.title, district: String(json(row.payload).district ?? "") })), policyLimitPaise, metrics: { pending: normalizedRequests.filter(row => ["SUBMITTED", "PENDING_DIRECTOR"].includes(row.status)).length, duePayments: normalizedRequests.filter(row => row.status === "APPROVED" && row.paymentStatus !== "PAID" && !!row.dueAt && row.dueAt <= new Date()).length, missingBills: normalizedRequests.filter(row => row.missingBill).length, overspentBudgets } , budgetKeys: [...budgetKeys] };
  }

  async function savePolicy(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canSetPolicy) throw new AccessError("Only an authorized Startup Skool Director can set routine approval limits");
    const amountPaise = paise(z.object({ amount: z.unknown() }).parse(raw).amount, true);
    const actor = await client.user.findUnique({ where: { id: userId }, select: { personId: true } }); if (actor?.personId !== s.personId) throw new AccessError("Authority changed; sign in again");
    const sourceKey = `startup:finance-policy:${s.divisionId}`, existing = await client.executiveRecord.findUnique({ where: { sourceKey }, select: { id: true, version: true, status: true } });
    return client.$transaction(async db => {
      const payload = JSON.stringify({ schemaVersion: 1, aoRoutineApprovalLimitPaise: amountPaise, updatedAt: new Date().toISOString(), updatedByUserId: userId });
      if (existing) await db.executiveRecord.update({ where: { id: existing.id }, data: { payload, status: "ACTIVE", version: { increment: 1 } } });
      else await db.executiveRecord.create({ data: { kind: "STARTUP_FINANCE_POLICY", organizationId: s.divisionId, ownerPersonId: s.personId, title: "Startup Skool finance approval policy", status: "ACTIVE", sourceKey, payload } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.finance.policy_updated", entityType: "ExecutiveRecord", entityId: existing?.id ?? sourceKey, result: "SUCCESS", metadata: { aoRoutineApprovalLimitPaise: amountPaise } });
      return amountPaise;
    });
  }

  async function saveBudget(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canManage) throw new AccessError("Only the Startup Skool AO can prepare budget proposals");
    const input = z.object({ centreId: z.string().min(10).max(100), department: z.string().trim().min(2).max(100), period: periods, amount: z.unknown(), note: z.string().trim().min(8).max(1000) }).strict().parse(raw);
    const amountPaise = paise(input.amount), centre = await client.executiveRecord.findFirst({ where: { id: input.centreId, organizationId: s.divisionId, kind: "STARTUP_CENTRE", status: { not: "CLOSED" } }, select: { id: true, title: true, payload: true } });
    if (!centre) throw new AccessError("Choose an active Startup Skool centre");
    const centrePayload = json(centre.payload), scopeKey = `${centre.id}|${input.department.toLowerCase()}|${input.period}`;
    const record = await client.$transaction(async db => {
      const row = await db.executiveRecord.create({ data: { kind: "STARTUP_FINANCE_BUDGET", organizationId: s.divisionId, ownerPersonId: s.personId, title: `${input.department} budget · ${centre.title} · ${input.period}`, status: "PENDING_DIRECTOR", sourceKey: `startup:finance:budget:${randomUUID()}`, payload: JSON.stringify({ schemaVersion: 1, scopeKey, centreId: centre.id, centreName: centre.title, district: String(centrePayload.district ?? ""), department: input.department, period: input.period, amountPaise, note: input.note }) } });
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, toStatus: "PENDING_DIRECTOR", reason: "Budget proposal sent for Director approval" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.finance.budget_proposed", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { scopeKey, amountPaise } });
      return row.id;
    });
    return record;
  }

  async function submitRequest(userId: string, raw: unknown, file?: { name: string; type: string; bytes: Uint8Array }) {
    const s = await scope(userId); if (!s.canSubmit) throw new AccessError("You cannot submit Startup Skool finance requests");
    const input = z.object({ requestType: z.enum(requestTypes), centreId: z.string().min(10).max(100), department: z.string().trim().min(2).max(100), period: periods, budgetId: z.string().min(10).max(100), amount: z.unknown(), title: z.string().trim().min(3).max(160), vendor: z.string().trim().max(160).optional().default(""), description: z.string().trim().min(8).max(2000), dueAt: z.string().datetime().optional().or(z.literal("")) }).strict().parse(raw);
    if ((input.requestType === "BILL" || input.requestType === "REIMBURSEMENT") && !file) throw new Error("Attach the bill or reimbursement proof before submitting.");
    const amountPaise = paise(input.amount), budget = await client.executiveRecord.findFirst({ where: { id: input.budgetId, organizationId: s.divisionId, kind: "STARTUP_FINANCE_BUDGET", status: "APPROVED" }, select: { id: true, title: true, payload: true } });
    if (!budget) throw new AccessError("Choose an approved budget before submitting this request");
    const bp = json(budget.payload);
    if (bp.centreId !== input.centreId || String(bp.department).toLowerCase() !== input.department.toLowerCase() || bp.period !== input.period) throw new AccessError("The selected budget does not match this centre, department, and financial period");
    let saved: { id: string; checked: Awaited<ReturnType<typeof validateContentFile>>; hash: string } | null = null;
    if (file) {
      const checked = await validateContentFile(file.name, file.type || "application/octet-stream", file.bytes);
      if (!(checked.mediaType === "PDF" || checked.mediaType === "IMAGE") || checked.bytes > 20 * 1024 * 1024) throw new Error("Attach a PDF or image up to 20 MB.");
      const id = randomUUID(); await storage.write(id, file.bytes); saved = { id, checked, hash: digest(file.bytes) };
    }
    try {
      return await client.$transaction(async db => {
        const actor = await db.user.findUnique({ where: { id: userId }, select: { personId: true, status: true } }); if (!actor?.personId || actor.status !== "ACTIVE" || actor.personId !== s.personId) throw new AccessError("Employee identity changed; sign in again");
        if (saved) await db.niceJobsContentFile.create({ data: { id: saved.id, companyId: s.companyId, organizationId: s.divisionId, uploaderUserId: userId, idempotencyKey: randomUUID(), fingerprint: digest(new TextEncoder().encode(`${saved.checked.filename}:${s.divisionId}:${saved.hash}`)), digest: saved.hash, ...saved.checked } });
        const row = await db.executiveRecord.create({ data: { kind: "STARTUP_FINANCE_REQUEST", organizationId: s.divisionId, ownerPersonId: s.personId, title: input.title, status: "SUBMITTED", sourceKey: `startup:finance:request:${randomUUID()}`, dueAt: input.dueAt ? new Date(input.dueAt) : null, payload: JSON.stringify({ schemaVersion: 1, requestType: input.requestType, centreId: input.centreId, centreName: String(bp.centreName), district: String(bp.district ?? ""), department: input.department, period: input.period, budgetId: budget.id, amountPaise, vendor: input.vendor, description: input.description, billFileId: saved?.id ?? "", billFilename: saved?.checked.filename ?? "", paymentStatus: "NOT_PAID", paidAt: "", paymentReference: "" }) } });
        await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, toStatus: "SUBMITTED", reason: `${input.requestType.toLowerCase()} request submitted to the AO` } });
        await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.finance.request_submitted", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { requestType: input.requestType, amountPaise, budgetId: budget.id } });
        return row.id;
      }, { timeout: 25000 });
    } catch (error) { if (saved) { const exists = await client.niceJobsContentFile.findUnique({ where: { id: saved.id }, select: { id: true } }).catch(() => null); if (!exists) await storage.rollback(saved.id).catch(() => undefined); } throw error; }
  }

  async function decideRequest(userId: string, raw: unknown) {
    const s = await scope(userId); const input = z.object({ id: z.string().min(10).max(100), version: z.coerce.number().int().nonnegative(), decision: z.enum(["APPROVE_ROUTINE", "FORWARD", "APPROVE_DIRECTOR", "REJECT"]), reason: z.string().trim().min(8).max(1000) }).strict().parse(raw);
    const row = await client.executiveRecord.findFirst({ where: { id: input.id, organizationId: s.divisionId, kind: { in: ["STARTUP_FINANCE_REQUEST", "STARTUP_FINANCE_BUDGET"] } }, select: { id: true, kind: true, ownerPersonId: true, status: true, payload: true, version: true, dueAt: true } });
    if (!row || row.version !== input.version) throw new AccessError("This finance record changed; refresh and try again");
    if (!["SUBMITTED", "PENDING_DIRECTOR"].includes(row.status)) throw new AccessError("This record is no longer awaiting approval");
    const payload = json(row.payload), budgetRecord = row.kind === "STARTUP_FINANCE_BUDGET";
    let next = row.status;
    if (input.decision === "FORWARD") { if (!s.canManage) throw new AccessError("Only the AO can route a request to the Director"); next = "PENDING_DIRECTOR"; }
    if (input.decision === "APPROVE_ROUTINE") {
      if (budgetRecord || !s.canApproveRoutine || !s.canManage) throw new AccessError("Only the authorized AO can approve routine requests");
      const policy = await client.executiveRecord.findUnique({ where: { sourceKey: `startup:finance-policy:${s.divisionId}` }, select: { payload: true } });
      const limit = BigInt(String(json(policy?.payload ?? "{}").aoRoutineApprovalLimitPaise ?? "0")), amount = BigInt(moneySchema.parse(String(payload.amountPaise ?? "0")));
      if (amount > limit || limit <= 0n) throw new AccessError("This amount is above the AO approval limit; send it to the Director");
      next = "APPROVED";
    }
    if (input.decision === "APPROVE_DIRECTOR" || input.decision === "REJECT") {
      if (!s.canApproveAll) throw new AccessError("A Startup Skool Director decision is required");
      if (!budgetRecord && row.status !== "PENDING_DIRECTOR") throw new AccessError("The AO must check completeness and route this request to the Director first");
      next = input.decision === "APPROVE_DIRECTOR" ? "APPROVED" : "REJECTED";
    }
    const historyReason = input.decision === "FORWARD" ? `Routed to Director: ${input.reason}` : input.reason;
    await client.$transaction(async db => {
      if (next === "APPROVED" && !budgetRecord) {
        const budget = await db.executiveRecord.findFirst({ where: { id: String(payload.budgetId), organizationId: s.divisionId, kind: "STARTUP_FINANCE_BUDGET", status: "APPROVED" }, select: { payload: true } });
        if (!budget) throw new AccessError("The approved budget is no longer available");
        const bp = json(budget.payload), available = BigInt(moneySchema.parse(String(bp.amountPaise ?? "0")));
        const commitments = await db.executiveRecord.findMany({ where: { organizationId: s.divisionId, kind: "STARTUP_FINANCE_REQUEST", status: { in: ["APPROVED"] }, payload: { contains: `"budgetId":"${String(payload.budgetId)}"` } }, select: { payload: true }, take: 2000 });
        const committed = commitments.reduce((sum, item) => sum + BigInt(moneySchema.parse(String(json(item.payload).amountPaise ?? "0"))), 0n);
        const requestedAmount = BigInt(moneySchema.parse(String(payload.amountPaise ?? "0")));
        if (requestedAmount > available - committed) throw new AccessError("This request would exceed the remaining approved budget");
      }
      const changed = await db.executiveRecord.updateMany({ where: { id: row.id, organizationId: s.divisionId, kind: row.kind, status: row.status, version: row.version }, data: { status: next, version: { increment: 1 } } });
      if (changed.count !== 1) throw new AccessError("This finance record changed; refresh and try again");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: next, reason: historyReason } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: `startup.finance.${input.decision.toLowerCase()}`, entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { previousStatus: row.status, status: next, amountPaise: String(payload.amountPaise ?? "0") } });
    }, { isolationLevel: "Serializable", timeout: 20000 });
    return row.id;
  }

  async function recordPayment(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canRecordPayment) throw new AccessError("Payment recording is not authorized for this account");
    const input = z.object({ id: z.string().min(10).max(100), version: z.coerce.number().int().nonnegative(), paymentReference: z.string().trim().min(2).max(120), paidAt: z.string().datetime() }).strict().parse(raw);
    const row = await client.executiveRecord.findFirst({ where: { id: input.id, organizationId: s.divisionId, kind: "STARTUP_FINANCE_REQUEST", status: "APPROVED", version: input.version }, select: { id: true, payload: true, version: true } });
    if (!row) throw new AccessError("Only an approved, unpaid finance request can be marked paid");
    const payload = json(row.payload); if (payload.paymentStatus === "PAID") throw new AccessError("This request is already marked paid");
    payload.paymentStatus = "PAID"; payload.paymentReference = input.paymentReference; payload.paidAt = input.paidAt; payload.paymentRecordedByUserId = userId;
    await client.$transaction(async db => {
      const changed = await db.executiveRecord.updateMany({ where: { id: row.id, organizationId: s.divisionId, status: "APPROVED", version: row.version }, data: { payload: JSON.stringify(payload), version: { increment: 1 } } });
      if (changed.count !== 1) throw new AccessError("This payment record changed; refresh and try again");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: "APPROVED", toStatus: "APPROVED", reason: `Payment recorded with reference ${input.paymentReference}` } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.finance.payment_recorded", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { paymentReference: input.paymentReference } });
    });
    return row.id;
  }

  async function addBill(userId: string, recordId: string, file: { name: string; type: string; bytes: Uint8Array }) {
    const s = await scope(userId); if (!s.canManage && !s.canRecordPayment) throw new AccessError("You cannot attach bills to Startup Skool finance requests");
    const checked = await validateContentFile(file.name, file.type || "application/octet-stream", file.bytes);
    if (!(checked.mediaType === "PDF" || checked.mediaType === "IMAGE") || checked.bytes > 20 * 1024 * 1024) throw new Error("Attach a PDF or image up to 20 MB.");
    const fileId = randomUUID(); await storage.write(fileId, file.bytes);
    try {
      return await client.$transaction(async db => {
        const row = await db.executiveRecord.findFirst({ where: { id: recordId, organizationId: s.divisionId, kind: "STARTUP_FINANCE_REQUEST", status: { in: ["APPROVED", "PAID"] } }, select: { payload: true, version: true } });
        if (!row) throw new AccessError("Only an approved finance request can receive a bill");
        const payload = json(row.payload); if (payload.billFileId) throw new AccessError("A bill is already attached");
        await db.niceJobsContentFile.create({ data: { id: fileId, companyId: s.companyId, organizationId: s.divisionId, uploaderUserId: userId, idempotencyKey: randomUUID(), fingerprint: digest(new TextEncoder().encode(`${checked.filename}:${s.divisionId}:${digest(file.bytes)}`)), digest: digest(file.bytes), ...checked } });
        payload.billFileId = fileId; payload.billFilename = checked.filename;
        const changed = await db.executiveRecord.updateMany({ where: { id: recordId, organizationId: s.divisionId, kind: "STARTUP_FINANCE_REQUEST", version: row.version }, data: { payload: JSON.stringify(payload), version: { increment: 1 } } });
        if (changed.count !== 1) throw new AccessError("This finance record changed; refresh and try again");
        await db.executiveHistory.create({ data: { recordId, actorUserId: userId, fromStatus: "APPROVED", toStatus: "APPROVED", reason: `Supporting bill attached: ${checked.filename}` } });
        await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.finance.bill_attached", entityType: "ExecutiveRecord", entityId: recordId, result: "SUCCESS", metadata: { fileId } });
        return fileId;
      });
    } catch (error) { const exists = await client.niceJobsContentFile.findUnique({ where: { id: fileId }, select: { id: true } }).catch(() => null); if (!exists) await storage.rollback(fileId).catch(() => undefined); throw error; }
  }

  async function downloadBill(userId: string, recordId: string, fileId: string) {
    const s = await scope(userId);
    const row = await client.executiveRecord.findFirst({ where: { id: recordId, organizationId: s.divisionId, kind: "STARTUP_FINANCE_REQUEST", ...(s.canManage || s.canApproveAll || s.canApproveRoutine || s.canRecordPayment ? {} : { ownerPersonId: s.personId }) }, select: { payload: true } });
    if (!row || !s.canRead && !s.canManage && !s.canApproveAll && !s.canApproveRoutine && !s.canRecordPayment || json(row.payload).billFileId !== fileId) throw new AccessError("Bill unavailable");
    const file = await client.niceJobsContentFile.findFirst({ where: { id: fileId, companyId: s.companyId, organizationId: s.divisionId } }); if (!file) throw new AccessError("Bill unavailable");
    const bytes = await storage.read(file.id); if (bytes.length !== file.bytes || digest(bytes) !== file.digest) throw new Error("Bill integrity check failed");
    await operationalEvent(client, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.finance.bill_accessed", entityType: "ExecutiveRecord", entityId: recordId, result: "SUCCESS", metadata: { fileId } });
    return { file, bytes };
  }

  return { scope, workspace, savePolicy, saveBudget, submitRequest, decideRequest, recordPayment, addBill, downloadBill };
}

export const startupFinanceDesk = createStartupFinanceDesk();
