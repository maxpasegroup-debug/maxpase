import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeGroupStructure } from "@/server/group/structure";
import { workforcePermissions } from "@/server/authorization/registry";
import { createFinanceService } from "@/server/nicejobs/finance";
import { financeCommand, incentivePolicy, calculateAmount, type IncentivePolicy } from "@/server/nicejobs/finance-input";
import { MAX_MINOR, toMinor, formatMinor, roundRatio, compareDecimal } from "@/server/nicejobs/money";
import { createOperationsService } from "@/server/domain/operations-service";
import { measureMetric } from "@/server/nicejobs/performance-evidence";
import { createAccessContext } from "@/server/authorization/engine";
import { createEmployeeService } from "@/server/nicejobs/employee";
import { workerQuestion } from "@/server/sia/worker-context";

const directory = mkdtempSync(join(tmpdir(), "nicejobs-phase09-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/"), log: [{ level: "query", emit: "event" }] });
let captured: string[] | null = null;
db.$on("query", e => captured?.push(e.query));
let clock = new Date("2026-10-09T12:00:00Z"), company: string, division: string, product: string, manager: string, reviewer: string, worker: string, outsider: string;
const finance = createFinanceService(db, () => clock), operations = createOperationsService(db);
const input = (operation: string, data = {}) => ({ operation, confirmed: true, idempotencyKey: crypto.randomUUID(), ...(!["POLICY_CREATE", "POLICY_EDIT"].includes(operation) ? { reason: "Isolated financial test" } : {}), ...data });
async function human(org: string, keys: string[], descendants = false) {
  const person = await db.person.create({ data: { displayName: "Synthetic financial tester " + crypto.randomUUID() } });
  const user = await db.user.create({ data: { personId: person.id, email: crypto.randomUUID() + "@phase09.invalid" } });
  const role = await db.role.create({ data: { key: person.id, name: "Explicit isolated test authority", organizationId: org, permissions: { create: [...new Set(keys)].map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { personId: person.id, organizationId: org, scope: descendants ? "DESCENDANTS" : "ORGANIZATION", roles: { create: { roleId: role.id } } } }); return user.id;
}
beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  sql.close(); await db.$transaction(initializeGroupStructure);
  for (const p of workforcePermissions) await db.permission.upsert({ where: { key: p.key }, update: {}, create: p });
  const org = async (slug: string) => (await db.organization.findUniqueOrThrow({ where: { slug } })).id;
  company = await org("aira-skill-city"); division = await org("aira-labs"); product = (await db.product.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: company, slug: "nice-jobs" } } })).id;
  const all = workforcePermissions.map(p => p.key);
  manager = await human(company, all, true); reviewer = await human(division, all);
  worker = await human(division, ["nicejobs.finance.self.read", "notification.read", "nicejobs.workspace.self"]);
  outsider = await human(await org("pearn"), all, true);
}, 30000);
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); });

async function fixture(extra: Partial<IncentivePolicy> = {}) {
  clock = new Date("2026-10-09T12:00:00Z");
  const t = await db.niceJobsTemplate.create({ data: { companyId: company, productId: product, code: crypto.randomUUID() } });
  const job = await db.niceJobsVersion.create({ data: { templateId: t.id, number: 1, title: "Synthetic financial fixture job", status: "PUBLISHED", publishedAt: clock, areas: { create: { divisionId: division } } } });
  const profile = await db.niceJobsWorkerProfile.upsert({ where: { companyId_personId: { companyId: company, personId: (await db.user.findUniqueOrThrow({ where: { id: worker } })).personId! } }, update: {}, create: { companyId: company, personId: (await db.user.findUniqueOrThrow({ where: { id: worker } })).personId! } });
  // Prepared history is intentional: the explicit test policy does not require active employment.
  const a = await db.niceJobsAssignment.create({ data: { profileId: profile.id, versionId: job.id, divisionId: division } });
  const metric = { key: "DONE", name: "Synthetic count", description: "Isolated test evidence", unit: "count", category: "COMPLETION" as const, direction: "HIGHER" as const, source: "TASK_COMPLETED" as const, method: "COUNT" as const, visibility: "WORKER" as const, active: true, target: { min: 1 } };
  const f = await db.niceJobsPerformanceFramework.create({ data: { companyId: company, divisionId: division, jobVersionId: job.id, name: "Synthetic framework" } });
  const fv = await db.niceJobsPerformanceVersion.create({ data: { frameworkId: f.id, number: 1, ownerUserId: manager, period: "DAILY", timezone: "UTC", effectiveAt: new Date("2026-10-01T00:00:00Z"), definition: JSON.stringify({ metrics: [metric] }), status: "PUBLISHED", publishedAt: clock } });
  await db.task.create({ data: { title: "Isolated evidence completion", organizationId: division, niceJobsAssignmentId: a.id, assigneePersonId: profile.personId, status: "COMPLETED", createdAt: new Date("2026-10-08T01:00:00Z"), completionDate: new Date("2026-10-08T02:00:00Z") } });
  const loaded = await db.niceJobsAssignment.findUniqueOrThrow({ where: { id: a.id }, include: createEmployeeService(db).internal.assignmentInclude });
  const start = new Date("2026-10-08T00:00:00Z"), end = new Date("2026-10-09T00:00:00Z");
  const result = await measureMetric(db, await createAccessContext(manager, db), loaded, company, metric, start, end, clock);
  const snapshot = await db.niceJobsPerformanceSnapshot.create({ data: { assignmentId: a.id, frameworkVersionId: fv.id, periodStart: start, periodEnd: end, results: JSON.stringify([result]), status: result.status, generatedByUserId: manager } });
  const control = async (key: string) => (await operations.saveControl(manager, { organizationId: division, name: "Synthetic independent financial approval", kind: "HUMAN_DECISION", requiredPermission: key, stages: [[{ approverUserId: reviewer, requiredPermission: key }]] })).id;
  const payload: IncentivePolicy = { name: "Synthetic policy, not actual compensation", divisionId: division, jobVersionId: job.id, frameworkVersionId: fv.id, currency: "INR", effectiveAt: "2026-10-01T00:00:00Z", metricKey: "DONE", eligibility: { requireActive: false, minimumActual: "1", allowedStatuses: ["ON_TRACK"], excludedPipStatuses: [] }, rule: { type: "PER_UNIT", rateMinor: "12345" }, rounding: "HALF_UP", approvalControlPointId: await control("nicejobs.finance.incentive.approve"), settlementControlPointId: await control("nicejobs.finance.settlement.approve"), adjustmentControlPointId: await control("nicejobs.finance.adjustment.approve"), settlement: { minimumMinor: "1", allowAdjustments: true }, ...extra };
  const created = await finance.mutate(manager, input("POLICY_CREATE", { payload }));
  return { assignmentId: a.id, versionId: created.id, snapshotId: snapshot.id, payload };
}
async function publish(f: Awaited<ReturnType<typeof fixture>>) {
  await finance.mutate(manager, input("POLICY_SUBMIT", { versionId: f.versionId, revision: 0 }));
  await finance.mutate(reviewer, input("POLICY_REVIEW", { versionId: f.versionId, revision: 1 }));
  await finance.mutate(manager, input("POLICY_PUBLISH", { versionId: f.versionId, revision: 2 }));
  return f;
}
async function calculated(extra: Partial<IncentivePolicy> = {}) {
  const f = await publish(await fixture(extra));
  const e = await finance.mutate(manager, input("CALCULATE", { snapshotId: f.snapshotId, policyVersionId: f.versionId }));
  // Historical wallet fixture; WALLET_OPEN separately enforces readiness.
  const w = await db.niceJobsWallet.create({ data: { assignmentId: f.assignmentId, currency: f.payload.currency, creatorUserId: manager } });
  return { ...f, earningId: e.id, walletId: w.id };
}
async function decide(requestId: string, decision = "APPROVED", actor = reviewer) {
  const a = await db.siaApproval.findFirstOrThrow({ where: { requestId, status: "PENDING" } });
  return operations.decide(actor, { approvalId: a.id, decision, comment: "Independent isolated human decision" });
}
async function credited() {
  const f = await calculated(); await finance.mutate(manager, input("EARNING_SUBMIT", { earningId: f.earningId, revision: 0 }));
  await decide((await db.niceJobsIncentiveEarning.findUniqueOrThrow({ where: { id: f.earningId } })).requestId!);
  await finance.mutate(manager, input("EARNING_POST", { earningId: f.earningId, revision: 2 })); return f;
}

describe("Nice Jobs exact money and strict financial contracts", () => {
  it("preserves precision, currency digits, zero, bounds and explicit rounding", () => {
    expect(toMinor("0.10", "INR")).toBe("10"); expect(toMinor("0.001", "KWD")).toBe("1"); expect(toMinor("1", "JPY")).toBe("1"); expect(formatMinor("-12345", "INR")).toBe("-INR 123.45");
    expect(toMinor("0", "INR")).toBe("0"); expect(() => toMinor("0.001", "INR")).toThrow(); expect(() => toMinor("1.1", "JPY")).toThrow(); expect(() => toMinor("-1", "INR")).toThrow(); expect(() => toMinor("90000000001", "INR")).toThrow();
    expect(roundRatio(1n, 2n, "HALF_UP")).toBe(1n); expect(roundRatio(1n, 2n, "FLOOR")).toBe(0n); expect(roundRatio(1n, 3n, "CEILING")).toBe(1n); expect(compareDecimal("1.000000000001", "1")).toBe(1); expect(MAX_MINOR).toBe(9000000000000n);
  });
  it("rejects forged identity, arbitrary balance writes, unknown currency and autonomous actions", () => {
    expect(financeCommand.safeParse({ ...input("RECONCILE", { walletId: "test" }), actorUserId: "forged" }).success).toBe(false);
    expect(financeCommand.safeParse(input("WALLET_BALANCE", { amountMinor: "10" })).success).toBe(false);
    expect(workerQuestion("approve my incentive and transfer wallet funds")).toBe(false);
    expect(financeCommand.safeParse(input("MARK_PAID", { statementId: "x" })).success).toBe(false);
  });
});
describe("Nice Jobs approval-backed financial control", () => {
  it("requires independent review, preserves published policy and fails closed for missing configuration", async () => {
    const f = await fixture(); await finance.mutate(manager, input("POLICY_SUBMIT", { versionId: f.versionId, revision: 0 }));
    await expect(finance.mutate(manager, input("POLICY_REVIEW", { versionId: f.versionId, revision: 1 }))).rejects.toThrow("Independent");
    await expect(finance.mutate(manager, input("POLICY_PUBLISH", { versionId: f.versionId, revision: 1 }))).rejects.toThrow("Reviewed");
    await finance.mutate(reviewer, input("POLICY_REVIEW", { versionId: f.versionId, revision: 1 })); await finance.mutate(manager, input("POLICY_PUBLISH", { versionId: f.versionId, revision: 2 }));
    await expect(finance.mutate(manager, input("POLICY_EDIT", { versionId: f.versionId, revision: 3, payload: f.payload }))).rejects.toThrow("drafts");
    expect(incentivePolicy.safeParse({ ...f.payload, currency: "XYZ" }).success).toBe(false);
  });
  it("calculates exact immutable policy/evidence snapshots without crediting raw activity", async () => {
    const f = await calculated(); const e = await db.niceJobsIncentiveEarning.findUniqueOrThrow({ where: { id: f.earningId } });
    expect(e.amountMinor).toBe(12345n); expect(e.eligibility).toBe("ELIGIBLE"); expect(JSON.parse(e.calculation).snapshotId).toBe(f.snapshotId); expect((await finance.wallet(worker, f.walletId)).postedMinor).toBe("0");
    expect(calculateAmount({ ...f.payload, rule: { type: "PERCENTAGE", baseMinor: "101", basisPoints: "5000" } }, "1").amountMinor).toBe("51");
    expect(calculateAmount({ ...f.payload, rule: { type: "TIERED", tiers: [{ minimumActual: "1", amountMinor: "10" }, { minimumActual: "2", amountMinor: "20" }] } }, "2").amountMinor).toBe("20");
    expect(calculateAmount({ ...f.payload, rule: { type: "CUSTOM_POLICY", reference: "Unimplemented isolated custom policy" } }, "1").amountMinor).toBeNull();
    expect(() => calculateAmount({ ...f.payload, rule: { type: "PER_UNIT", rateMinor: MAX_MINOR.toString() } }, "2")).toThrow("bound");
  });
  it("deduplicates calculations and posting, enforces current authority, and blocks preapproval credit", async () => {
    const f = await calculated(); const c = input("CALCULATE", { snapshotId: f.snapshotId, policyVersionId: f.versionId });
    expect((await finance.mutate(manager, c)).id).toBe(f.earningId); expect((await finance.mutate(manager, c)).id).toBe(f.earningId);
    await expect(finance.mutate(manager, input("EARNING_POST", { earningId: f.earningId, revision: 0 }))).rejects.toThrow();
    await finance.mutate(manager, input("EARNING_SUBMIT", { earningId: f.earningId, revision: 0 })); const e = await db.niceJobsIncentiveEarning.findUniqueOrThrow({ where: { id: f.earningId } }); await decide(e.requestId!);
    const post = input("EARNING_POST", { earningId: e.id, revision: 2 }); await finance.mutate(manager, post); await finance.mutate(manager, post); expect(await db.niceJobsWalletLedger.count({ where: { earningId: e.id } })).toBe(1);
    await expect(finance.mutate(manager, { ...post, reason: "Replay forgery" })).rejects.toThrow("replay");
    const approval = await db.siaApproval.findFirstOrThrow({ where: { requestId: e.requestId } }); await expect(operations.decide(reviewer, { approvalId: approval.id, decision: "APPROVED", comment: "Replay" })).rejects.toThrow();
  });
  it("isolates companies, workers and recipients and keeps historical own wallet visible", async () => {
    const f = await credited(); await expect(finance.wallet(outsider, f.walletId)).rejects.toThrow(); await expect(finance.list(outsider, { management: true, companyId: company })).rejects.toThrow();
    const other = await human(division, ["nicejobs.finance.self.read"]); await expect(finance.wallet(other, f.walletId)).rejects.toThrow();
    expect((await finance.wallet(worker, f.walletId)).postedMinor).toBe("12345"); await db.niceJobsAssignment.update({ where: { id: f.assignmentId }, data: { lifecycle: "INACTIVE", status: "INACTIVE" } }); expect((await finance.wallet(worker, f.walletId)).postedMinor).toBe("12345");
    expect(await db.notification.count({ where: { recipientUserId: worker, resourceId: f.walletId } })).toBeGreaterThan(0);
  });
  it("enforces append-only ledger and atomic audit rollback", async () => {
    const f = await credited(), l = await db.niceJobsWalletLedger.findFirstOrThrow({ where: { walletId: f.walletId } });
    await expect(db.niceJobsWalletLedger.update({ where: { id: l.id }, data: { amountMinor: 1n } })).rejects.toThrow(); await expect(db.niceJobsWalletLedger.delete({ where: { id: l.id } })).rejects.toThrow();
    const before = await db.auditEvent.count(); await expect(db.$transaction(async tx => { await tx.niceJobsWallet.update({ where: { id: f.walletId }, data: { revision: { increment: 1 } } }); await tx.auditEvent.create({ data: { action: "isolated.rollback", entityType: "Wallet", entityId: f.walletId, result: "SUCCESS" } }); throw new Error("Injected failure"); })).rejects.toThrow("Injected");
    expect(await db.auditEvent.count()).toBe(before); expect((await db.niceJobsWallet.findUniqueOrThrow({ where: { id: f.walletId } })).revision).toBe(1);
  });
  it("requires approved reversal and never edits original historical money", async () => {
    const f = await credited(), l = await db.niceJobsWalletLedger.findFirstOrThrow({ where: { walletId: f.walletId } });
    const p = await finance.mutate(manager, input("REVERSAL_CREATE", { ledgerId: l.id, policyVersionId: f.versionId }));
    expect((await finance.wallet(worker, f.walletId)).postedMinor).toBe("12345"); await expect(finance.mutate(manager, input("ADJUSTMENT_POST", { adjustmentId: p.id, revision: 0 }))).rejects.toThrow();
    await finance.mutate(manager, input("ADJUSTMENT_SUBMIT", { adjustmentId: p.id, revision: 0 })); await decide((await db.niceJobsWalletAdjustment.findUniqueOrThrow({ where: { id: p.id } })).requestId!);
    await finance.mutate(manager, input("ADJUSTMENT_POST", { adjustmentId: p.id, revision: 2 })); expect((await finance.wallet(worker, f.walletId)).postedMinor).toBe("0"); expect((await db.niceJobsWalletLedger.findUniqueOrThrow({ where: { id: l.id } })).amountMinor).toBe(12345n);
    await expect(finance.mutate(manager, input("REVERSAL_CREATE", { ledgerId: l.id, policyVersionId: f.versionId }))).rejects.toThrow("reversed");
  });
  it("reserves immutable statements, posts settlement once and leaves payout provider unconfigured", async () => {
    const f = await credited(); clock = new Date("2026-10-10T12:00:00Z");
    const p = await finance.mutate(manager, input("SETTLEMENT_CREATE", { policyVersionId: f.versionId, from: "2026-10-09T00:00:00Z", until: "2026-10-10T00:00:00Z" }));
    const s = await finance.mutate(manager, input("STATEMENT_GENERATE", { periodId: p.id, revision: 0, walletId: f.walletId })); expect((await finance.wallet(worker, f.walletId)).availableMinor).toBe("0");
    await finance.mutate(manager, input("SETTLEMENT_SUBMIT", { periodId: p.id, revision: 1 })); await decide((await db.niceJobsSettlementPeriod.findUniqueOrThrow({ where: { id: p.id } })).requestId!);
    const post = input("SETTLEMENT_POST", { periodId: p.id, revision: 3 }); await finance.mutate(manager, post); await finance.mutate(manager, post);
    const payout = await finance.mutate(manager, input("PAYOUT_REQUEST", { statementId: s.id })); const intent = await db.niceJobsPayoutIntent.findUniqueOrThrow({ where: { id: payout.id } }); expect(intent.status).toBe("PROVIDER_NOT_CONFIGURED"); expect(intent.providerReference).toBeNull(); expect(intent.amountMinor).toBe(12345n);
    expect((await finance.wallet(worker, f.walletId)).transferredMinor).toBeNull(); await finance.mutate(manager, input("RECONCILE", { walletId: f.walletId }));
  });
  it("requires readiness when opening a wallet and rejects beneficiary self approval across aliases", async () => {
    const f = await calculated(); await expect(finance.mutate(manager, input("WALLET_OPEN", { assignmentId: f.assignmentId, policyVersionId: f.versionId }))).rejects.toThrow("readiness");
    const alias = await db.user.create({ data: { email: crypto.randomUUID() + "@phase09.invalid", personId: (await db.user.findUniqueOrThrow({ where: { id: worker } })).personId } });
    const membership = await db.membership.findFirstOrThrow({ where: { organizationId: division, person: { users: { some: { id: worker } } } }, include: { roles: true } });
    for (const p of workforcePermissions) await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: membership.roles[0].roleId, permissionId: (await db.permission.findUniqueOrThrow({ where: { key: p.key } })).id } }, update: {}, create: { roleId: membership.roles[0].roleId, permissionId: (await db.permission.findUniqueOrThrow({ where: { key: p.key } })).id } });
    await db.approvalRule.updateMany({ where: { controlPointId: f.payload.approvalControlPointId }, data: { approverUserId: alias.id } });
    await expect(finance.mutate(manager, input("EARNING_SUBMIT", { earningId: f.earningId, revision: 0 }))).rejects.toThrow("Beneficiary"); expect((await db.niceJobsIncentiveEarning.findUniqueOrThrow({ where: { id: f.earningId } })).status).toBe("CALCULATED");
    await db.rolePermission.deleteMany({ where: { roleId: membership.roles[0].roleId, permission: { key: { notIn: ["nicejobs.finance.self.read", "notification.read", "nicejobs.workspace.self"] } } } });
  });
  it("reauthorizes approved posting after approver capability revocation", async () => {
    const f = await calculated(); await finance.mutate(manager, input("EARNING_SUBMIT", { earningId: f.earningId, revision: 0 })); await decide((await db.niceJobsIncentiveEarning.findUniqueOrThrow({ where: { id: f.earningId } })).requestId!);
    const membership = await db.membership.findFirstOrThrow({ where: { organizationId: division, person: { users: { some: { id: reviewer } } } }, include: { roles: true } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "nicejobs.finance.incentive.approve" } });
    await db.rolePermission.deleteMany({ where: { roleId: membership.roles[0].roleId, permissionId: permission.id } });
    try { await expect(finance.mutate(manager, input("EARNING_POST", { earningId: f.earningId, revision: 2 }))).rejects.toThrow("approval"); expect((await finance.wallet(worker, f.walletId)).postedMinor).toBe("0"); }
    finally { await db.rolePermission.create({ data: { roleId: membership.roles[0].roleId, permissionId: permission.id } }); }
  });
  it("enforces sequential and parallel human chains and keeps rejection auditable", async () => {
    const f = await calculated(), second = await human(division, workforcePermissions.map(p => p.key));
    await db.approvalRule.create({ data: { controlPointId: f.payload.approvalControlPointId, stageIndex: 1, approverUserId: second, requiredPermission: "nicejobs.finance.incentive.approve" } });
    await finance.mutate(manager, input("EARNING_SUBMIT", { earningId: f.earningId, revision: 0 })); const requestId = (await db.niceJobsIncentiveEarning.findUniqueOrThrow({ where: { id: f.earningId } })).requestId!;
    const next = await db.siaApproval.findFirstOrThrow({ where: { requestId, stageIndex: 1 } }); await expect(operations.decide(second, { approvalId: next.id, decision: "APPROVED", comment: "Too early" })).rejects.toThrow();
    await decide(requestId); expect((await db.niceJobsIncentiveEarning.findUniqueOrThrow({ where: { id: f.earningId } })).status).toBe("UNDER_REVIEW");
    await decide(requestId, "REJECTED", second); expect((await db.niceJobsIncentiveEarning.findUniqueOrThrow({ where: { id: f.earningId } })).status).toBe("REJECTED"); expect((await finance.wallet(worker, f.walletId)).pendingMinor).toBe("0");
    const parallel = await calculated(); await db.approvalRule.create({ data: { controlPointId: parallel.payload.approvalControlPointId, stageIndex: 0, approverUserId: second, requiredPermission: "nicejobs.finance.incentive.approve" } });
    await finance.mutate(manager, input("EARNING_SUBMIT", { earningId: parallel.earningId, revision: 0 })); const p = await db.niceJobsIncentiveEarning.findUniqueOrThrow({ where: { id: parallel.earningId } });
    const secondApproval = await db.siaApproval.findFirstOrThrow({ where: { requestId: p.requestId, approverUserId: second } }); await operations.decide(second, { approvalId: secondApproval.id, decision: "APPROVED", comment: "Parallel independent review" }); expect((await db.niceJobsIncentiveEarning.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("UNDER_REVIEW"); await decide(p.requestId!); expect((await db.niceJobsIncentiveEarning.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("APPROVED");
  });
  it("releases rejected settlement reservations while preserving immutable statements", async () => {
    const f = await credited(); clock = new Date("2026-10-10T12:00:00Z"); const p = await finance.mutate(manager, input("SETTLEMENT_CREATE", { policyVersionId: f.versionId, from: "2026-10-09T00:00:00Z", until: "2026-10-10T00:00:00Z" })); const s = await finance.mutate(manager, input("STATEMENT_GENERATE", { periodId: p.id, revision: 0, walletId: f.walletId }));
    await finance.mutate(manager, input("SETTLEMENT_SUBMIT", { periodId: p.id, revision: 1 })); await decide((await db.niceJobsSettlementPeriod.findUniqueOrThrow({ where: { id: p.id } })).requestId!, "REJECTED");
    expect((await finance.wallet(worker, f.walletId)).availableMinor).toBe("12345"); expect((await db.niceJobsSettlementStatement.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("VOIDED"); expect(await db.niceJobsSettlementLine.count({ where: { statementId: s.id } })).toBe(1);
  });
  it("prevents immutable money tampering and unapproved or insufficient adjustments", async () => {
    const f = await credited(); await expect(db.niceJobsIncentiveEarning.update({ where: { id: f.earningId }, data: { amountMinor: 1n } })).rejects.toThrow(); await expect(db.niceJobsIncentiveVersion.update({ where: { id: f.versionId }, data: { definition: "{}" } })).rejects.toThrow();
    const a = await finance.mutate(manager, input("ADJUSTMENT_CREATE", { walletId: f.walletId, policyVersionId: f.versionId, direction: "DEBIT", amountMinor: "12346", description: "Synthetic excessive debit", privateNote: "PRIVATE-FINANCE-CANARY" })); await finance.mutate(manager, input("ADJUSTMENT_SUBMIT", { adjustmentId: a.id, revision: 0 })); await decide((await db.niceJobsWalletAdjustment.findUniqueOrThrow({ where: { id: a.id } })).requestId!);
    const before = await db.auditEvent.count(); await expect(finance.mutate(manager, input("ADJUSTMENT_POST", { adjustmentId: a.id, revision: 2 }))).rejects.toThrow("Insufficient"); expect(await db.auditEvent.count()).toBe(before); expect((await finance.wallet(worker, f.walletId)).postedMinor).toBe("12345"); expect(JSON.stringify(await finance.wallet(worker, f.walletId))).not.toContain("PRIVATE-FINANCE"); await expect(finance.records(worker, "adjustments")).rejects.toThrow();
  });
  it("surfaces reconciliation mismatches without changing recorded money", async () => {
    const f = await calculated(); await db.niceJobsIncentiveEarning.update({ where: { id: f.earningId }, data: { status: "POSTED" } }); await finance.mutate(manager, input("RECONCILE", { walletId: f.walletId }));
    expect(await db.niceJobsFinanceException.count({ where: { walletId: f.walletId, code: "RECONCILIATION_FAILED" } })).toBe(1); expect((await finance.wallet(worker, f.walletId)).postedMinor).toBe("0");
  });
  it("intersects human and agent financial authority and exposes no management-private financial context", async () => {
    const f = await credited(), identity = await db.siaIdentity.create({ data: { name: "Isolated financial read assistant", title: "Read-only test" } });
    const role = await db.role.create({ data: { key: identity.id, name: "Agent test boundary", principalType: "AGENT", organizationId: division, permissions: { create: { permission: { connect: { key: "nicejobs.finance.self.read" } } } } } }); await db.siaRoleAssignment.create({ data: { siaId: identity.id, roleId: role.id, organizationId: division } });
    const constrained = { siaId: identity.id, organizationId: division };
    const result = await finance.list(worker, { limit: 3 }, constrained); expect(result.records.length).toBeLessThanOrEqual(3); expect(JSON.stringify(result)).not.toContain("PRIVATE-"); await expect(finance.list(outsider, { limit: 3 }, constrained)).rejects.toThrow();
    await db.rolePermission.deleteMany({ where: { roleId: role.id } }); await expect(finance.wallet(worker, f.walletId, {}, constrained)).rejects.toThrow();
  });
  it("bounds management reads against a larger isolated workforce fixture", async () => {
    const f = await calculated(); const a = await db.niceJobsAssignment.findUniqueOrThrow({ where: { id: f.assignmentId } });
    for (let i = 0; i < 300; i++) { const p = await db.person.create({ data: { displayName: "Synthetic scale worker " + i } }); const profile = await db.niceJobsWorkerProfile.create({ data: { personId: p.id, companyId: company } }); const assignment = await db.niceJobsAssignment.create({ data: { profileId: profile.id, versionId: a.versionId, divisionId: division } }); await db.niceJobsWallet.create({ data: { assignmentId: assignment.id, currency: "INR", creatorUserId: manager } }); }
    captured = []; const start = performance.now(); const result = await finance.list(manager, { management: true, limit: 25 }); const queries = captured; captured = null;
    const milliseconds = Math.round(performance.now() - start);
    expect(result.records).toHaveLength(25); expect(result.nextCursor).not.toBeNull(); expect(queries.filter(q => q.includes("GROUP BY"))).toHaveLength(3); expect(queries.length).toBeLessThan(35); process.stdout.write(JSON.stringify({ financialScaleWallets: await db.niceJobsWallet.count(), returned: result.records.length, queries: queries.length, milliseconds }) + "\n");
  });
  it("keeps concurrent same-key financial posting exactly once and permits safe retry", async () => {
    const f = await calculated(); await finance.mutate(manager, input("EARNING_SUBMIT", { earningId: f.earningId, revision: 0 })); await decide((await db.niceJobsIncentiveEarning.findUniqueOrThrow({ where: { id: f.earningId } })).requestId!);
    const command = input("EARNING_POST", { earningId: f.earningId, revision: 2 });
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => finance.mutate(manager, command)));
    expect(results.some(r => r.status === "fulfilled")).toBe(true); await finance.mutate(manager, command); expect(await db.niceJobsWalletLedger.count({ where: { earningId: f.earningId } })).toBe(1); expect((await finance.wallet(worker, f.walletId)).postedMinor).toBe("12345");
  });
  it("rejects stale and forged financial commands without revealing private source evidence", async () => {
    const f = await calculated(); await expect(finance.mutate(outsider, input("EARNING_SUBMIT", { earningId: f.earningId, revision: 0 }))).rejects.toThrow(); await expect(finance.mutate(manager, input("EARNING_SUBMIT", { earningId: f.earningId, revision: 99 }))).rejects.toThrow("refresh");
    await expect(finance.mutate(worker, input("ADJUSTMENT_CREATE", { walletId: "forged", policyVersionId: f.versionId, direction: "CREDIT", amountMinor: "1", description: "forged" }))).rejects.toThrow(); await expect(finance.explanation(worker, f.earningId)).rejects.toThrow(); expect(JSON.stringify(await finance.records(worker, "incentives"))).not.toContain('"actual"');
    expect(financeCommand.safeParse({ ...input("PAYOUT_REQUEST", { statementId: "x" }), amountMinor: "999", currency: "USD", workerId: "forged" }).success).toBe(false);
  });
  it("preserves statement details and prevents payout success or amount forgery", async () => {
    const f = await credited(); clock = new Date("2026-10-10T12:00:00Z"); const p = await finance.mutate(manager, input("SETTLEMENT_CREATE", { policyVersionId: f.versionId, from: "2026-10-09T00:00:00Z", until: "2026-10-10T00:00:00Z" })); const s = await finance.mutate(manager, input("STATEMENT_GENERATE", { periodId: p.id, revision: 0, walletId: f.walletId }));
    await expect(db.niceJobsSettlementStatement.update({ where: { id: s.id }, data: { amountMinor: 1n } })).rejects.toThrow(); await finance.mutate(manager, input("SETTLEMENT_SUBMIT", { periodId: p.id, revision: 1 })); await decide((await db.niceJobsSettlementPeriod.findUniqueOrThrow({ where: { id: p.id } })).requestId!); await finance.mutate(manager, input("SETTLEMENT_POST", { periodId: p.id, revision: 3 }));
    const intent = await finance.mutate(manager, input("PAYOUT_REQUEST", { statementId: s.id })); await finance.mutate(manager, input("PAYOUT_REQUEST", { statementId: s.id })); expect(await db.niceJobsPayoutIntent.count({ where: { statementId: s.id } })).toBe(1);
    await expect(db.niceJobsPayoutIntent.update({ where: { id: intent.id }, data: { status: "PAID", providerReference: "fake" } })).rejects.toThrow(); const detail = await finance.statementDetail(worker, s.id); expect(detail.lines).toHaveLength(1); expect(detail.amountMinor).toBe("12345"); expect(detail.transferredMinor).toBeNull(); await expect(finance.statementDetail(outsider, s.id)).rejects.toThrow();
  });
});
