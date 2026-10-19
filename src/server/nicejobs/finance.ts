import { createHash } from "node:crypto";
import { z } from "zod";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext, type AgentConstraint } from "@/server/authorization/engine";
import { createOperationsService } from "@/server/domain/operations-service";
import { operationalEvent, notify } from "@/server/domain/operational-events";
import { createEmployeeService } from "./employee";
import { NiceJobsError } from "./input";
import { financeCommand, financeQuery, financeKinds, incentivePolicy, calculateAmount, type IncentivePolicy } from "./finance-input";
import { boundedMoney, compareDecimal } from "./money";
import { financialRead, financialResource, type FinancialResource } from "./finance-access";
import { metricResult, sourceAuthorized, authorizedEvidence } from "./performance-evidence";

type DB = Prisma.TransactionClient;
const versionInclude = { policy: true } satisfies Prisma.NiceJobsIncentiveVersionInclude;
type Version = Prisma.NiceJobsIncentiveVersionGetPayload<{ include: typeof versionInclude }>;
export type FinanceRecord = { id: string; name: string; status: string; revision: number; currency?: string; amountMinor?: string | null; assignmentId?: string; walletId?: string; versionId?: string; snapshotId?: string; requestId?: string | null; periodStart?: Date; periodEnd?: Date; definition?: IncentivePolicy; detail?: string; privateNote?: string | null; approvals?: { id: string; status: string; name: string; comment: string | null; canDecide: boolean }[]; capabilities: string[] };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fail(message: string): never { throw new NiceJobsError(message); }

export function createFinanceService(client: PrismaClient = prisma, now: () => Date = () => new Date()) {
  const employee = createEmployeeService(client, now).internal, operations = createOperationsService(client);
  type Boundary = Awaited<ReturnType<typeof employee.boundary>>;
  async function requireScope(b: Boundary, divisionId: string, capability: string) {
    if (!b.ctx.nodes.some(n => n.id === divisionId && n.parentId === b.company.id && n.type === "DIVISION" && n.status === "ACTIVE")) throw new AccessError("Financial scope unavailable");
    await b.ctx.requireAccess(capability, { organizationId: divisionId });
  }
  async function version(db: DB, b: Boundary, id: string, capability: string) {
    const v = await db.niceJobsIncentiveVersion.findFirst({ where: { id, policy: { companyId: b.company.id, jobVersion: { template: { productId: b.product.id } } } }, include: versionInclude });
    if (!v) throw new AccessError("Incentive policy unavailable");
    await requireScope(b, v.policy.divisionId, "nicejobs.finance.policy.read");
    await requireScope(b, v.policy.divisionId, capability);
    return v;
  }
  async function validatePolicy(db: DB, b: Boundary, p: IncentivePolicy) {
    await requireScope(b, p.divisionId, "nicejobs.finance.policy.manage");
    const f = await db.niceJobsPerformanceVersion.findFirst({ where: { id: p.frameworkVersionId, status: "PUBLISHED", publishedAt: { not: null }, framework: { companyId: b.company.id, divisionId: p.divisionId, jobVersionId: p.jobVersionId } }, include: { framework: true } });
    if (!f || !await db.niceJobsVersion.findFirst({ where: { id: p.jobVersionId, publishedAt: { not: null }, template: { companyId: b.company.id, productId: b.product.id }, areas: { some: { divisionId: p.divisionId } } } })) throw new AccessError("Published scoped job and performance framework required");
    const metrics = z.object({ metrics: z.array(metricResult.shape.metric) }).passthrough().parse(JSON.parse(f.definition)).metrics;
    const m = metrics.find(m => m.key === p.metricKey && m.active);
    if (!m || p.rule.type === "PER_UNIT" && m.method !== "COUNT") fail("An active compatible canonical metric is required");
    for (const [id, permission] of [[p.approvalControlPointId, "nicejobs.finance.incentive.approve"], [p.settlementControlPointId, "nicejobs.finance.settlement.approve"], ...(p.adjustmentControlPointId ? [[p.adjustmentControlPointId, "nicejobs.finance.adjustment.approve"]] : [])]) {
      const point = await db.controlPoint.findFirst({ where: { id, organizationId: p.divisionId, projectId: null, status: "ACTIVE", allowSelfApproval: false, kind: { in: ["APPROVAL", "HUMAN_DECISION"] }, requiredPermission: permission }, include: { rules: true } });
      if (!point?.rules.length || point.rules.some(r => r.requiredPermission !== permission)) fail("Configure an independent scoped financial approval chain");
    }
  }
  async function assignment(db: DB, b: Boundary, id: string, capability: string, active = false) {
    const a = await db.niceJobsAssignment.findUnique({ where: { id }, include: employee.assignmentInclude });
    if (!a || a.profile.companyId !== b.company.id || a.version.template.productId !== b.product.id || a.division.parentId !== b.company.id) throw new AccessError("Financial assignment unavailable");
    for (const key of ["nicejobs.workspace.read", "person.read", capability]) await requireScope(b, a.divisionId, key);
    if (active) await employee.active(db, b, a);
    return a;
  }
  async function target(db: DB, b: Boundary, type: FinancialResource, id: string, capability: string) {
    const t = await financialRead(db, b.ctx, type, id);
    if (t.companyId !== b.company.id) throw new AccessError("Financial company unavailable");
    await requireScope(b, t.organizationId, capability);
    return t;
  }
  async function applicable(db: DB, v: Version, assignmentId: string, at?: Date) {
    const a = await db.niceJobsAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
    if (a.divisionId !== v.policy.divisionId || a.versionId !== v.policy.jobVersionId || !v.publishedAt || v.status !== "PUBLISHED" && v.status !== "ARCHIVED") fail("Published same-job policy required");
    if (at && (at < v.effectiveAt || v.expiresAt && at >= v.expiresAt || await db.niceJobsIncentiveVersion.count({ where: { policyId: v.policyId, publishedAt: { not: null }, number: { gt: v.number }, effectiveAt: { lte: at } } }))) fail("A different policy applies to this period");
    return incentivePolicy.parse(JSON.parse(v.definition));
  }
  async function sourceProof(db: DB, b: Boundary, snapshotId: string, p: IncentivePolicy, historical = false) {
    const s = await db.niceJobsPerformanceSnapshot.findUnique({ where: { id: snapshotId }, include: { assignment: { include: employee.assignmentInclude }, correction: true } });
    if (!s || s.frameworkVersionId !== p.frameworkVersionId || s.assignment.divisionId !== p.divisionId || s.assignment.versionId !== p.jobVersionId || s.assignment.profile.companyId !== b.company.id || s.assignment.version.template.productId !== b.product.id || !historical && s.correction) fail("Current compatible performance snapshot required");
    await requireScope(b, s.assignment.divisionId, historical && s.assignment.profile.personId === b.personId ? "nicejobs.performance.self.read" : "nicejobs.performance.read");
    const result = z.array(metricResult).max(30).parse(JSON.parse(s.results)).find(r => r.metric.key === p.metricKey);
    if (!result || historical && s.assignment.profile.personId === b.personId && result.metric.visibility !== "WORKER" || !sourceAuthorized(b.ctx, s.assignment, result.metric.source)) throw new AccessError("Financial source evidence unavailable");
    const visible = await authorizedEvidence(db, b.ctx, s.assignment, b.company.id, result.evidence, now());
    if (visible.length !== result.evidence.length) throw new AccessError("Financial supporting evidence unavailable");
    return { s, result };
  }
  async function balance(db: DB, walletId: string) {
    const [posted, reserved, pending] = await Promise.all([
      db.niceJobsWalletLedger.aggregate({ where: { walletId }, _sum: { amountMinor: true } }),
      db.niceJobsSettlementStatement.aggregate({ where: { walletId, status: "REVIEW", period: { status: { in: ["OPEN", "REVIEW", "APPROVAL_GRANTED"] } } }, _sum: { amountMinor: true } }),
      db.niceJobsIncentiveEarning.aggregate({ where: { assignment: { wallets: { some: { id: walletId } } }, currency: (await db.niceJobsWallet.findUniqueOrThrow({ where: { id: walletId }, select: { currency: true } })).currency, status: { in: ["CALCULATED", "UNDER_REVIEW", "APPROVED"] }, eligibility: "ELIGIBLE" }, _sum: { amountMinor: true } })
    ]);
    const postedMinor = boundedMoney(posted._sum.amountMinor ?? 0n), reservedMinor = boundedMoney(reserved._sum.amountMinor ?? 0n), pendingMinor = boundedMoney(pending._sum.amountMinor ?? 0n);
    const settlement = await db.niceJobsSettlementStatement.aggregate({ where: { walletId, status: "APPROVED" }, _sum: { amountMinor: true } });
    return { postedMinor: postedMinor.toString(), reservedMinor: reservedMinor.toString(), availableMinor: boundedMoney(postedMinor - reservedMinor).toString(), pendingMinor: pendingMinor.toString(), reservedForPayoutMinor: boundedMoney(settlement._sum.amountMinor ?? 0n).toString() };
  }
  async function post(db: DB, b: Boundary, walletId: string, data: Omit<Prisma.NiceJobsWalletLedgerUncheckedCreateInput, "walletId" | "actorUserId" | "currency">) {
    const w = await db.niceJobsWallet.findUniqueOrThrow({ where: { id: walletId } });
    if (w.status !== "OPEN") fail("Wallet is not open");
    const amount = BigInt(data.amountMinor);
    const totals = await balance(db, w.id);
    boundedMoney(BigInt(totals.postedMinor) + amount);
    if (!amount || BigInt(totals.availableMinor) + amount < 0n) fail("Insufficient unreserved wallet funds");
    await db.niceJobsWallet.update({ where: { id: w.id, revision: w.revision }, data: { revision: { increment: 1 } } });
    return db.niceJobsWalletLedger.create({ data: { ...data, walletId: w.id, currency: w.currency, actorUserId: b.userId, createdAt: now() } });
  }
  async function approval(db: DB, b: Boundary, type: FinancialResource, id: string, controlPointId: string, idempotencyKey: string, reason: string) {
    const t = await financialResource(db, type, id);
    return operations.createRequest(b.userId, { organizationId: t.organizationId, resourceType: type, resourceId: id, controlPointId, title: "Financial review", description: reason, idempotencyKey }, undefined, db);
  }
  async function authority(db: DB, id: string | null) {
    if (!id || !await operations.approvedAuthority(db, id)) throw new AccessError("Current independent human approval required");
    const r = await db.operationalRequest.findUniqueOrThrow({ where: { id } });
    if (r.siaId || r.status !== "APPROVED") throw new AccessError("Human financial approval required");
  }
  async function announce(db: DB, b: Boundary, walletId: string, reference: string) {
    const w = await db.niceJobsWallet.findUniqueOrThrow({ where: { id: walletId }, include: { assignment: { include: { profile: true } } } });
    const users = await db.user.findMany({ where: { personId: w.assignment.profile.personId, status: "ACTIVE" }, select: { id: true }, take: 26 });
    if (users.length > 25) fail("Financial notification recipient limit exceeded");
    for (const u of users) {
      const ctx = await createAccessContext(u.id, db, undefined, { organizationId: b.company.id });
      if (!ctx.organizationIds("nicejobs.finance.self.read").includes(w.assignment.divisionId) || !ctx.organizationIds("notification.read").includes(w.assignment.divisionId)) continue;
      await notify(db, b.userId, u.id, { organizationId: w.assignment.divisionId, resourceType: "NICE_JOBS_WALLET", resourceId: w.id }, "NICE_JOBS_FINANCE", "Wallet activity available", "Open your wallet to review the recorded change.", reference + ":" + u.id);
    }
  }
  async function recordException(db: DB, b: Boundary, divisionId: string, code: string, summary: string, reference: string, walletId?: string) {
    const existing = await db.niceJobsFinanceException.findUnique({ where: { reference } });
    if (existing) return existing;
    const exception = await db.niceJobsFinanceException.create({ data: { companyId: b.company.id, divisionId, code, summary, reference, walletId, actorUserId: b.userId } });
    await operationalEvent(db, { actorUserId: b.userId, organizationId: divisionId, action: "nicejobs.finance.exception_recorded", entityType: "NiceJobsFinanceException", entityId: exception.id, result: "FAILURE", reference: "finance-exception-event:" + exception.id, metadata: { code } });
    return exception;
  }
  async function mutate(userId: string, raw: unknown) {
    const c = financeCommand.parse(raw), fingerprint = hash(c), reference = "nicejobs.finance:" + userId + ":" + c.idempotencyKey;
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId);
      let scope: string, id = "", walletId: string | undefined, outcome: "SUCCESS" | "FAILURE" = "SUCCESS";
      const v = "versionId" in c ? await version(db, b, c.versionId, c.operation === "POLICY_REVIEW" ? "nicejobs.finance.policy.review" : c.operation === "POLICY_PUBLISH" ? "nicejobs.finance.policy.publish" : "nicejobs.finance.policy.manage") : "policyVersionId" in c ? await version(db, b, c.policyVersionId, c.operation === "CALCULATE" ? "nicejobs.finance.calculate" : c.operation === "SETTLEMENT_CREATE" ? "nicejobs.finance.settlement.create" : c.operation === "WALLET_OPEN" ? "nicejobs.finance.wallet.open" : "nicejobs.finance.wallet.adjust") : null;
      const earning = "earningId" in c ? await db.niceJobsIncentiveEarning.findUnique({ where: { id: c.earningId }, include: { policyVersion: { include: versionInclude } } }) : null;
      const adjustment = "adjustmentId" in c ? await db.niceJobsWalletAdjustment.findUnique({ where: { id: c.adjustmentId }, include: { policyVersion: { include: versionInclude }, reversalProposal: { include: { ledger: true } } } }) : null;
      const period = "periodId" in c ? await db.niceJobsSettlementPeriod.findUnique({ where: { id: c.periodId }, include: { policyVersion: { include: versionInclude } } }) : null;
      const statement = "statementId" in c ? await db.niceJobsSettlementStatement.findUnique({ where: { id: c.statementId }, include: { period: true, debit: true } }) : null;
      const original = "ledgerId" in c ? await db.niceJobsWalletLedger.findUnique({ where: { id: c.ledgerId } }) : null;
      if (c.operation === "POLICY_CREATE") { scope = c.payload.divisionId; await validatePolicy(db, b, c.payload); }
      else if (c.operation.startsWith("POLICY") || c.operation === "SETTLEMENT_CREATE") { if (!v) throw new AccessError("Policy unavailable"); scope = v.policy.divisionId; }
      else if (c.operation === "WALLET_OPEN") { const a = await assignment(db, b, c.assignmentId, "nicejobs.finance.wallet.open", true); scope = a.divisionId; await applicable(db, v!, a.id); }
      else if (c.operation === "CALCULATE") { const proof = await sourceProof(db, b, c.snapshotId, incentivePolicy.parse(JSON.parse(v!.definition))); scope = (await assignment(db, b, proof.s.assignmentId, "nicejobs.finance.calculate")).divisionId; }
      else if (earning) { scope = (await target(db, b, "NICE_JOBS_EARNING", earning.id, c.operation === "EARNING_POST" ? "nicejobs.finance.wallet.post" : "nicejobs.finance.calculate")).organizationId; id = earning.id; if (c.operation === "EARNING_POST") await authority(db, earning.requestId); }
      else if (adjustment) { scope = (await target(db, b, "NICE_JOBS_ADJUSTMENT", adjustment.id, c.operation === "ADJUSTMENT_POST" ? "nicejobs.finance.wallet.post" : "nicejobs.finance.wallet.adjust")).organizationId; id = adjustment.id; if (c.operation === "ADJUSTMENT_POST") { await authority(db, adjustment.requestId); if (adjustment.reversalProposal) await requireScope(b, scope, "nicejobs.finance.wallet.reverse"); } }
      else if (period) { scope = (await target(db, b, "NICE_JOBS_SETTLEMENT", period.id, "nicejobs.finance.settlement.create")).organizationId; id = period.id; if (c.operation === "SETTLEMENT_POST") await authority(db, period.requestId); }
      else if (statement) { scope = (await target(db, b, "NICE_JOBS_STATEMENT", statement.id, "nicejobs.finance.payout.request")).organizationId; await authority(db, statement.period.requestId); id = statement.id; }
      else if (original) { walletId = original.walletId; scope = (await target(db, b, "NICE_JOBS_WALLET", walletId, "nicejobs.finance.wallet.reverse")).organizationId; }
      else if ("walletId" in c && c.operation !== "STATEMENT_GENERATE") { walletId = c.walletId; scope = (await target(db, b, "NICE_JOBS_WALLET", c.walletId, c.operation === "RECONCILE" ? "nicejobs.finance.reconcile" : "nicejobs.finance.wallet.adjust")).organizationId; }
      else if (c.operation === "DECIDE") { const r = await db.operationalRequest.findUniqueOrThrow({ where: { id: c.requestId } }); if (!["NICE_JOBS_EARNING", "NICE_JOBS_ADJUSTMENT", "NICE_JOBS_SETTLEMENT"].includes(r.resourceType) || !await db.siaApproval.findFirst({ where: { id: c.approvalId, requestId: r.id, approverUserId: userId } })) throw new AccessError("Assigned financial approval required"); scope = (await target(db, b, r.resourceType as FinancialResource, r.resourceId, r.resourceType === "NICE_JOBS_EARNING" ? "nicejobs.finance.incentive.approve" : r.resourceType === "NICE_JOBS_SETTLEMENT" ? "nicejobs.finance.settlement.approve" : "nicejobs.finance.adjustment.approve")).organizationId; id = r.resourceId; }
      else throw new AccessError("Financial resource unavailable");
      if ("privateNote" in c && c.privateNote) await requireScope(b, scope, "nicejobs.finance.private");
      const previous = await db.operationalEvent.findUnique({ where: { reference } });
      if (previous) { const metadata = JSON.parse(previous.metadata ?? "{}"); if (metadata.fingerprint !== fingerprint) fail("Financial replay mismatch"); return { id: previous.entityId, status: metadata.outcome === "FAILURE" ? "FAILURE" as const : "SUCCESS" as const }; }
      if ("revision" in c && (earning ?? adjustment ?? period ?? v)?.revision !== c.revision) fail("Record changed; refresh before saving");
      if (c.operation === "POLICY_CREATE") {
        const p = await db.niceJobsIncentivePolicy.create({ data: { companyId: b.company.id, divisionId: c.payload.divisionId, jobVersionId: c.payload.jobVersionId, name: c.payload.name } });
        id = (await db.niceJobsIncentiveVersion.create({ data: { policyId: p.id, number: 1, ownerUserId: userId, currency: c.payload.currency, effectiveAt: new Date(c.payload.effectiveAt), expiresAt: c.payload.expiresAt ? new Date(c.payload.expiresAt) : null, definition: JSON.stringify(c.payload) } })).id;
      } else if (c.operation === "POLICY_EDIT") {
        if (v!.status !== "DRAFT" || c.payload.divisionId !== v!.policy.divisionId || c.payload.jobVersionId !== v!.policy.jobVersionId || c.payload.currency !== v!.currency) fail("Only same-scope same-currency drafts may be edited");
        await validatePolicy(db, b, c.payload); id = v!.id;
        await db.niceJobsIncentiveVersion.update({ where: { id, revision: c.revision }, data: { definition: JSON.stringify(c.payload), effectiveAt: new Date(c.payload.effectiveAt), expiresAt: c.payload.expiresAt ? new Date(c.payload.expiresAt) : null, reviewerUserId: null, reviewedAt: null, revision: { increment: 1 } } });
      } else if (c.operation === "POLICY_VERSION") {
        const last = await db.niceJobsIncentiveVersion.findFirst({ where: { policyId: v!.policyId }, orderBy: { number: "desc" } });
        if (!v!.publishedAt || last?.id !== v!.id) fail("Create a new version from the latest published policy");
        id = (await db.niceJobsIncentiveVersion.create({ data: { policyId: v!.policyId, number: v!.number + 1, ownerUserId: userId, currency: v!.currency, effectiveAt: v!.effectiveAt, expiresAt: v!.expiresAt, definition: v!.definition } })).id;
      } else if (["POLICY_SUBMIT", "POLICY_REVIEW", "POLICY_PUBLISH", "POLICY_ARCHIVE"].includes(c.operation) && "versionId" in c) {
        id = v!.id; const p = incentivePolicy.parse(JSON.parse(v!.definition));
        if (c.operation === "POLICY_SUBMIT") { if (v!.status !== "DRAFT") fail("Draft policy required"); await validatePolicy(db, b, p); }
        if (c.operation === "POLICY_REVIEW") { if (v!.status !== "REVIEW" || (await db.user.findUniqueOrThrow({ where: { id: v!.ownerUserId }, select: { personId: true } })).personId === b.personId) fail("Independent human policy review required"); }
        if (c.operation === "POLICY_PUBLISH") {
          if (v!.status !== "REVIEW" || !v!.reviewerUserId || !v!.reviewedAt) fail("Reviewed policy required");
          const reviewer = await createAccessContext(v!.reviewerUserId, db, undefined, { organizationId: b.company.id });
          await reviewer.requireAccess("nicejobs.finance.policy.review", { organizationId: scope });
          await validatePolicy(db, b, p);
          const last = await db.niceJobsIncentiveVersion.findFirst({ where: { policyId: v!.policyId, publishedAt: { not: null } }, orderBy: { number: "desc" } });
          if (last && v!.effectiveAt <= last.effectiveAt) fail("New policy versions require a later effective date");
        }
        if (c.operation === "POLICY_ARCHIVE" && v!.status !== "PUBLISHED") fail("Published policy required");
        await db.niceJobsIncentiveVersion.update({ where: { id, revision: c.revision }, data: { status: c.operation === "POLICY_PUBLISH" ? "PUBLISHED" : c.operation === "POLICY_ARCHIVE" ? "ARCHIVED" : "REVIEW", ...(c.operation === "POLICY_REVIEW" ? { reviewerUserId: userId, reviewedAt: now() } : {}), ...(c.operation === "POLICY_PUBLISH" ? { publishedAt: now() } : {}), revision: { increment: 1 } } });
      } else if (c.operation === "WALLET_OPEN") {
        id = (await db.niceJobsWallet.upsert({ where: { assignmentId_currency: { assignmentId: c.assignmentId, currency: v!.currency } }, update: {}, create: { assignmentId: c.assignmentId, currency: v!.currency, creatorUserId: userId } })).id;
      } else if (c.operation === "CALCULATE") {
        const p = incentivePolicy.parse(JSON.parse(v!.definition)), { s, result } = await sourceProof(db, b, c.snapshotId, p);
        await applicable(db, v!, s.assignmentId, s.periodStart);
        if (v!.status !== "PUBLISHED" || s.periodEnd > now() || p.expiresAt && s.periodEnd > new Date(p.expiresAt)) fail("Current published policy and closed compatible period required");
        let eligibility = "ELIGIBLE", reason = "Configured eligibility passed";
        if (p.eligibility.requireActive) { try { await employee.active(db, b, s.assignment); } catch (e) { if (!(e instanceof AccessError)) throw e; eligibility = "INELIGIBLE"; reason = "Assignment is not active and readiness-backed"; } }
        if (p.eligibility.excludedPipStatuses.length) { await requireScope(b, scope, "nicejobs.pip.read"); if (await db.niceJobsPip.count({ where: { assignmentId: s.assignmentId, status: { in: p.eligibility.excludedPipStatuses }, startAt: { lt: s.periodEnd }, reviewAt: { gte: s.periodStart } } })) { eligibility = "INELIGIBLE"; reason = "Configured eligibility exclusion applies"; } }
        const actual = result.actual === null ? null : String(result.actual);
        if (!actual || !result.evidenceCount || !result.evidence.length || result.status === "NOT_MEASURED" || !p.eligibility.allowedStatuses.includes(result.status) || compareDecimal(actual, p.eligibility.minimumActual) < 0) { eligibility = "INELIGIBLE"; reason = "Configured threshold or recorded evidence requirement not met"; }
        const calculation = eligibility === "ELIGIBLE" ? calculateAmount(p, actual!) : { amountMinor: null, reason };
        if (eligibility === "ELIGIBLE" && calculation.amountMinor === null) eligibility = "NOT_CONFIGURED";
        const prior = await db.niceJobsIncentiveEarning.findUnique({ where: { assignmentId_policyId_periodStart_periodEnd: { assignmentId: s.assignmentId, policyId: v!.policyId, periodStart: s.periodStart, periodEnd: s.periodEnd } } });
        if (prior) { if (prior.snapshotId !== s.id || prior.policyVersionId !== v!.id) fail("This policy period already has an immutable calculation; use an approved correction"); id = prior.id; }
        else id = (await db.niceJobsIncentiveEarning.create({ data: { assignmentId: s.assignmentId, policyId: v!.policyId, policyVersionId: v!.id, snapshotId: s.id, periodStart: s.periodStart, periodEnd: s.periodEnd, currency: v!.currency, amountMinor: calculation.amountMinor === null ? null : BigInt(calculation.amountMinor), eligibility, calculation: JSON.stringify({ policyVersionId: v!.id, policyHash: hash(p), snapshotId: s.id, snapshotHash: hash(s.results), policy: p, metric: result.metric, evidence: result.evidence, evidenceCount: result.evidenceCount, sampled: result.sampled, currency: v!.currency, calculatedAt: now().toISOString(), metricKey: p.metricKey, actual, result: calculation, eligibility, reason }), creatorUserId: userId } })).id;
        if (eligibility !== "ELIGIBLE") await recordException(db, b, scope, eligibility === "NOT_CONFIGURED" ? "RULE_NOT_CONFIGURED" : "CALCULATION_NOT_PAYABLE", "Recorded calculation has no payable result; review its authorized policy and evidence.", "finance-calculation-exception:" + id);
      } else if (c.operation === "EARNING_SUBMIT") {
        if (earning!.status !== "CALCULATED" || earning!.eligibility !== "ELIGIBLE" || !earning!.amountMinor || earning!.amountMinor <= 0n) fail("Positive eligible calculation required");
        const p = incentivePolicy.parse(JSON.parse(earning!.policyVersion.definition)); await sourceProof(db, b, earning!.snapshotId, p);
        const r = await approval(db, b, "NICE_JOBS_EARNING", id, p.approvalControlPointId, c.idempotencyKey, c.reason);
        await db.niceJobsIncentiveEarning.update({ where: { id, revision: c.revision }, data: { requestId: r.id, status: "UNDER_REVIEW", revision: { increment: 1 } } }); await operations.submitRequest(userId, r.id, db);
      } else if (c.operation === "EARNING_POST") {
        if (earning!.status !== "APPROVED" || !earning!.amountMinor || earning!.amountMinor <= 0n) fail("Unposted approved earning required");
        await sourceProof(db, b, earning!.snapshotId, incentivePolicy.parse(JSON.parse(earning!.policyVersion.definition)));
        const w = await db.niceJobsWallet.findUnique({ where: { assignmentId_currency: { assignmentId: earning!.assignmentId, currency: earning!.currency } } }); if (!w) fail("Open the employee currency wallet first"); walletId = w.id;
        await post(db, b, w.id, { type: "CREDIT", amountMinor: earning!.amountMinor, earningId: id, reference, description: "Approved incentive" });
        await db.niceJobsIncentiveEarning.update({ where: { id, revision: c.revision }, data: { status: "POSTED", revision: { increment: 1 } } });
      } else if (c.operation === "EARNING_VOID") {
        if (earning!.status !== "CALCULATED") fail("Only an unsubmitted calculation may be voided");
        await db.niceJobsIncentiveEarning.update({ where: { id, revision: c.revision }, data: { status: "VOIDED", revision: { increment: 1 } } });
      } else if (c.operation === "ADJUSTMENT_CREATE" || c.operation === "REVERSAL_CREATE") {
        const w = await db.niceJobsWallet.findUniqueOrThrow({ where: { id: walletId! } }), p = await applicable(db, v!, w.assignmentId);
        if (!p.settlement.allowAdjustments || !p.adjustmentControlPointId || p.currency !== w.currency) fail("Approved adjustment policy is not configured for this wallet");
        if (original && (original.type === "SETTLEMENT" || original.type === "REVERSAL" || await db.niceJobsWalletLedger.count({ where: { reversesId: original.id } }) || await db.niceJobsSettlementLine.count({ where: { activeLedgerId: original.id } }))) fail("Reserved, paid-boundary or reversed entries cannot be reversed");
        const amountMinor = c.operation === "REVERSAL_CREATE" ? original!.amountMinor < 0n ? -original!.amountMinor : original!.amountMinor : BigInt(c.amountMinor), direction = c.operation === "REVERSAL_CREATE" ? original!.amountMinor > 0n ? "DEBIT" : "CREDIT" : c.direction;
        id = (await db.niceJobsWalletAdjustment.create({ data: { walletId: w.id, policyVersionId: v!.id, direction, amountMinor, reason: c.reason, description: c.operation === "REVERSAL_CREATE" ? "Reversal of " + original!.id : c.description, privateNote: "privateNote" in c ? c.privateNote : undefined, creatorUserId: userId } })).id;
        if (original) await db.niceJobsWalletReversalProposal.create({ data: { adjustmentId: id, ledgerId: original.id } });
      } else if (c.operation === "ADJUSTMENT_SUBMIT") {
        if (adjustment!.status !== "DRAFT") fail("Draft adjustment required");
        const p = incentivePolicy.parse(JSON.parse(adjustment!.policyVersion.definition)); if (!p.adjustmentControlPointId || !p.settlement.allowAdjustments) fail("Adjustment approval is not configured");
        const r = await approval(db, b, "NICE_JOBS_ADJUSTMENT", id, p.adjustmentControlPointId, c.idempotencyKey, c.reason);
        await db.niceJobsWalletAdjustment.update({ where: { id, revision: c.revision }, data: { status: "UNDER_REVIEW", requestId: r.id, revision: { increment: 1 } } }); await operations.submitRequest(userId, r.id, db);
      } else if (c.operation === "ADJUSTMENT_POST") {
        if (adjustment!.status !== "APPROVED") fail("Unposted approved adjustment required"); walletId = adjustment!.walletId;
        const original = adjustment!.reversalProposal?.ledger;
        if (original && (await db.niceJobsSettlementLine.count({ where: { activeLedgerId: original.id } }) || await db.niceJobsWalletLedger.count({ where: { reversesId: original.id } }))) fail("Original entry is reserved or reversed");
        await post(db, b, walletId, { type: original ? "REVERSAL" : "ADJUSTMENT", amountMinor: original ? -original.amountMinor : adjustment!.direction === "CREDIT" ? adjustment!.amountMinor : -adjustment!.amountMinor, adjustmentId: id, reversesId: original?.id, reference, description: adjustment!.description });
        await db.niceJobsWalletAdjustment.update({ where: { id, revision: c.revision }, data: { status: "POSTED", revision: { increment: 1 } } });
      } else if (c.operation === "SETTLEMENT_CREATE") {
        if (v!.status !== "PUBLISHED" || c.from >= c.until || new Date(c.until) > now() || new Date(c.from) < v!.effectiveAt || v!.expiresAt && new Date(c.until) > v!.expiresAt || Date.parse(c.until) - Date.parse(c.from) > 366 * 86400000) fail("Closed bounded published-policy settlement period required");
        if (await db.niceJobsSettlementPeriod.count({ where: { policyId: v!.policyId, status: { notIn: ["CANCELLED", "REJECTED"] }, from: { lt: new Date(c.until) }, until: { gt: new Date(c.from) } } })) fail("Settlement periods cannot overlap");
        id = (await db.niceJobsSettlementPeriod.create({ data: { policyId: v!.policyId, policyVersionId: v!.id, from: new Date(c.from), until: new Date(c.until), currency: v!.currency, creatorUserId: userId } })).id;
      } else if (c.operation === "STATEMENT_GENERATE") {
        if (period!.status !== "OPEN") fail("Open settlement period required");
        await target(db, b, "NICE_JOBS_WALLET", c.walletId, "nicejobs.finance.settlement.create");
        const w = await db.niceJobsWallet.findUniqueOrThrow({ where: { id: c.walletId } }), p = await applicable(db, period!.policyVersion, w.assignmentId);
        if (w.currency !== period!.currency || await db.niceJobsSettlementStatement.count({ where: { periodId: period!.id } }) >= 100) fail("Settlement currency or statement bound exceeded");
        const lines = await db.niceJobsWalletLedger.findMany({ where: { walletId: w.id, type: { not: "SETTLEMENT" }, lines: { none: { activeLedgerId: { not: null } } }, createdAt: { gte: period!.from, lt: period!.until }, OR: [{ earning: { policyId: period!.policyId } }, { adjustment: { policyVersion: { policyId: period!.policyId } } }] }, orderBy: { id: "asc" }, take: 251 });
        if (lines.length > 250) fail("Statement exceeds 250 lines; narrow the settlement window");
        const amount = boundedMoney(lines.reduce((sum, l) => sum + l.amountMinor, 0n));
        if (amount <= 0n || amount < BigInt(p.settlement.minimumMinor) || amount > BigInt((await balance(db, w.id)).availableMinor)) fail("No eligible positive unreserved funds meet the configured settlement minimum");
        const s = await db.niceJobsSettlementStatement.create({ data: { periodId: period!.id, walletId: w.id, currency: w.currency, amountMinor: amount, snapshot: JSON.stringify({ policyVersionId: period!.policyVersionId, from: period!.from.toISOString(), until: period!.until.toISOString(), totalMinor: amount.toString(), currency: w.currency, lines: lines.map(l => ({ ledgerId: l.id, amountMinor: l.amountMinor.toString(), type: l.type })) }), lines: { create: lines.map(l => ({ ledgerId: l.id, activeLedgerId: l.id, amountMinor: l.amountMinor })) } } });
        id = s.id; await db.niceJobsSettlementPeriod.update({ where: { id: period!.id, revision: c.revision }, data: { revision: { increment: 1 } } });
      } else if (c.operation === "SETTLEMENT_SUBMIT") {
        if (period!.status !== "OPEN" || !await db.niceJobsSettlementStatement.count({ where: { periodId: id, status: "REVIEW" } })) fail("Open nonempty settlement required");
        const p = incentivePolicy.parse(JSON.parse(period!.policyVersion.definition)), r = await approval(db, b, "NICE_JOBS_SETTLEMENT", id, p.settlementControlPointId, c.idempotencyKey, c.reason);
        await db.niceJobsSettlementPeriod.update({ where: { id, revision: c.revision }, data: { status: "REVIEW", requestId: r.id, revision: { increment: 1 } } }); await operations.submitRequest(userId, r.id, db);
      } else if (c.operation === "SETTLEMENT_POST") {
        if (period!.status !== "APPROVAL_GRANTED") fail("Human-approved unposted settlement required");
        const statements = await db.niceJobsSettlementStatement.findMany({ where: { periodId: id, status: "REVIEW" }, take: 101 });
        if (!statements.length || statements.length > 100) fail("Settlement statement bound exceeded");
        for (const s of statements) {
          await target(db, b, "NICE_JOBS_STATEMENT", s.id, "nicejobs.finance.settlement.create");
          // This statement's reservation is consumed in the same transaction as its debit.
          await db.niceJobsSettlementStatement.update({ where: { id: s.id }, data: { status: "APPROVED" } });
          await post(db, b, s.walletId, { type: "SETTLEMENT", amountMinor: -s.amountMinor, statementId: s.id, reference: reference + ":" + s.id, description: "Approved settlement reserved for payout; not transferred" });
          await announce(db, b, s.walletId, reference + ":" + s.id);
        }
        await db.niceJobsSettlementPeriod.update({ where: { id, revision: c.revision }, data: { status: "APPROVED", approvedAt: now(), revision: { increment: 1 } } });
      } else if (c.operation === "SETTLEMENT_CANCEL") {
        if (!["OPEN", "REVIEW", "REJECTED"].includes(period!.status)) fail("Approved settlements cannot be cancelled");
        if (period!.requestId && period!.status === "REVIEW") await operations.cancelRequest(userId, period!.requestId, db);
        await db.niceJobsSettlementLine.updateMany({ where: { statement: { periodId: id } }, data: { activeLedgerId: null } });
        await db.niceJobsSettlementStatement.updateMany({ where: { periodId: id }, data: { status: "VOIDED" } });
        if (period!.status !== "REVIEW") await db.niceJobsSettlementPeriod.update({ where: { id, revision: c.revision }, data: { status: "CANCELLED", revision: { increment: 1 } } });
      } else if (c.operation === "SETTLEMENT_CLOSE") {
        if (period!.status !== "APPROVED") fail("Approved settlement required; closing does not confirm payment");
        await db.niceJobsSettlementPeriod.update({ where: { id, revision: c.revision }, data: { status: "CLOSED", closedAt: now(), revision: { increment: 1 } } });
      } else if (c.operation === "DECIDE") await operations.decide(userId, { approvalId: c.approvalId, decision: c.decision, comment: c.reason }, db);
      else if (c.operation === "PAYOUT_REQUEST") {
        if (statement!.status !== "APPROVED" || !statement!.debit || !["APPROVED", "CLOSED"].includes(statement!.period.status)) fail("Approved posted settlement statement required");
        const w = await db.niceJobsWallet.findUniqueOrThrow({ where: { id: statement!.walletId } });
        if (w.currency !== statement!.currency || statement!.debit.amountMinor !== -statement!.amountMinor) fail("Settlement reconciliation failed");
        id = (await db.niceJobsPayoutIntent.upsert({ where: { statementId: statement!.id }, update: {}, create: { statementId: statement!.id, amountMinor: statement!.amountMinor, currency: statement!.currency, reference, creatorUserId: userId } })).id;
        await recordException(db, b, scope, "PROVIDER_NOT_CONFIGURED", "Internal payout intent is waiting for a configured provider. No payment is confirmed.", "finance-payout-exception:" + id, statement!.walletId);
      } else if (c.operation === "RECONCILE") {
        const result = await reconciliation(db, c.walletId); id = c.walletId;
        if (result.exceptions.length) { outcome = "FAILURE"; await recordException(db, b, scope, "RECONCILIATION_FAILED", result.exceptions.join("; "), reference, c.walletId); }
      } else fail("Unsupported financial operation");
      await operationalEvent(db, { actorUserId: userId, organizationId: scope, action: "nicejobs.finance." + c.operation.toLowerCase(), entityType: "NiceJobsFinance", entityId: id, result: outcome, reference, metadata: { fingerprint, operation: c.operation, outcome } });
      if (walletId && ["EARNING_POST", "ADJUSTMENT_POST"].includes(c.operation)) await announce(db, b, walletId, reference);
      return { id, status: outcome };
    }, { timeout: 30000 });
  }
  async function reconciliation(db: DB, walletId: string) {
    const w = await db.niceJobsWallet.findUniqueOrThrow({ where: { id: walletId } }), exceptions: string[] = [];
    const currencyMismatch = await db.niceJobsWalletLedger.count({ where: { walletId, OR: [{ currency: { not: w.currency } }, { status: { not: "POSTED" } }, { amountMinor: 0n }] } });
    const missingCredits = await db.niceJobsIncentiveEarning.count({ where: { assignmentId: w.assignmentId, currency: w.currency, status: "POSTED", ledger: null } });
    const missingAdjustments = await db.niceJobsWalletAdjustment.count({ where: { walletId, status: "POSTED", ledger: null } });
    const missingDebits = await db.niceJobsSettlementStatement.count({ where: { walletId, status: "APPROVED", debit: null } });
    const mismatch = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM NiceJobsWalletLedger l
      LEFT JOIN NiceJobsIncentiveEarning e ON e.id = l.earningId LEFT JOIN NiceJobsWalletAdjustment a ON a.id = l.adjustmentId
      LEFT JOIN NiceJobsSettlementStatement s ON s.id = l.statementId LEFT JOIN NiceJobsWalletLedger original ON original.id = l.reversesId
      WHERE l.walletId = ${walletId} AND ((l.type = 'CREDIT' AND (e.id IS NULL OR e.status <> 'POSTED' OR e.amountMinor <> l.amountMinor OR e.assignmentId <> ${w.assignmentId} OR e.currency <> l.currency))
      OR (l.type IN ('ADJUSTMENT','REVERSAL') AND (a.id IS NULL OR a.status <> 'POSTED' OR a.walletId <> l.walletId OR (CASE WHEN a.direction = 'CREDIT' THEN a.amountMinor ELSE -a.amountMinor END) <> l.amountMinor))
      OR (l.type = 'REVERSAL' AND (original.id IS NULL OR original.walletId <> l.walletId OR -original.amountMinor <> l.amountMinor))
      OR (l.type = 'SETTLEMENT' AND (s.id IS NULL OR s.status <> 'APPROVED' OR s.walletId <> l.walletId OR -s.amountMinor <> l.amountMinor OR s.currency <> l.currency)))`;
    const statementMismatch = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM NiceJobsSettlementStatement s WHERE s.walletId = ${walletId} AND s.status <> 'VOIDED' AND (s.currency <> ${w.currency} OR s.amountMinor <> COALESCE((SELECT SUM(line.amountMinor) FROM NiceJobsSettlementLine line WHERE line.statementId = s.id), 0))`;
    const payoutMismatch = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM NiceJobsPayoutIntent p JOIN NiceJobsSettlementStatement s ON s.id = p.statementId WHERE s.walletId = ${walletId} AND (p.status <> 'PROVIDER_NOT_CONFIGURED' OR p.providerReference IS NOT NULL OR p.amountMinor <> s.amountMinor OR p.currency <> s.currency OR s.status <> 'APPROVED')`;
    if (currencyMismatch) exceptions.push("Invalid posted entries"); if (missingCredits) exceptions.push("Posted earning without credit"); if (missingAdjustments) exceptions.push("Posted adjustment without entry"); if (missingDebits) exceptions.push("Approved statement without debit");
    if (BigInt(mismatch[0].n)) exceptions.push("Ledger source amount or state mismatch"); if (BigInt(statementMismatch[0].n)) exceptions.push("Settlement line reconciliation mismatch"); if (BigInt(payoutMismatch[0].n)) exceptions.push("Payout boundary mismatch");
    const totals = await balance(db, walletId); if (BigInt(totals.availableMinor) < 0n) exceptions.push("Negative available funds");
    return { walletId, ...totals, status: exceptions.length ? "FAILED" : "RECONCILED", exceptions, asOf: now() };
  }
  async function wallet(userId: string, walletId: string, raw: unknown = {}, constraint?: AgentConstraint) {
    const q = financeQuery.parse(raw);
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId, constraint), t = await financialRead(db, b.ctx, "NICE_JOBS_WALLET", walletId), w = await db.niceJobsWallet.findUniqueOrThrow({ where: { id: walletId } });
      if (q.companyId && q.companyId !== t.companyId || q.divisionId && q.divisionId !== t.organizationId || q.assignmentId && q.assignmentId !== w.assignmentId) throw new AccessError("Wallet scope mismatch");
      if (q.status && q.status !== w.status) fail("Wallet does not match the selected status");
      const ledger = await db.niceJobsWalletLedger.findMany({ where: { walletId, ...(q.after ? { id: { gt: q.after } } : {}), ...(q.ledgerType ? { type: q.ledgerType } : {}), ...(q.search ? { description: { contains: q.search } } : {}), ...(q.policyVersionId ? { OR: [{ earning: { policyVersionId: q.policyVersionId } }, { adjustment: { policyVersionId: q.policyVersionId } }, { statement: { period: { policyVersionId: q.policyVersionId } } }] } : {}) }, select: { id: true, type: true, status: true, amountMinor: true, currency: true, description: true, earningId: true, adjustmentId: true, statementId: true, reversesId: true, createdAt: true, earning: { select: { policyVersion: { select: { id: true, number: true, policy: { select: { name: true } } } } } }, adjustment: { select: { policyVersion: { select: { id: true, number: true, policy: { select: { name: true } } } } } }, statement: { select: { period: { select: { policyVersion: { select: { id: true, number: true, policy: { select: { name: true } } } } } } } } }, orderBy: { id: "asc" }, take: q.limit + 1 });
      return { id: w.id, assignmentId: w.assignmentId, currency: w.currency, status: w.status, ...await balance(db, w.id), ledger: ledger.slice(0, q.limit).map(l => ({ ...l, amountMinor: l.amountMinor.toString() })), nextCursor: ledger.length > q.limit ? ledger[q.limit - 1].id : null, companyId: b.company.id, divisionId: t.organizationId, canReconcile: b.ctx.organizationIds("nicejobs.finance.reconcile").includes(t.organizationId), canAdjust: b.ctx.organizationIds("nicejobs.finance.wallet.adjust").includes(t.organizationId), canReverse: b.ctx.organizationIds("nicejobs.finance.wallet.reverse").includes(t.organizationId), canPrivate: b.ctx.organizationIds("nicejobs.finance.private").includes(t.organizationId), provider: "NOT_CONFIGURED", transferredMinor: null, asOf: now() };
    });
  }
  async function list(userId: string, raw: unknown = {}, constraint?: AgentConstraint) {
    const q = financeQuery.parse(raw);
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId, constraint);
      if (q.companyId && q.companyId !== b.company.id) throw new AccessError("Financial company unavailable");
      const scopes = b.ctx.organizationIds(q.management ? "nicejobs.finance.wallet.read" : "nicejobs.finance.self.read").filter(id => !q.divisionId || id === q.divisionId);
      const ids = q.management ? scopes.filter(id => b.ctx.organizationIds("person.read").includes(id) && b.ctx.organizationIds("nicejobs.workspace.read").includes(id)) : scopes;
      if (!ids.length) throw new AccessError("Financial workspace not authorized");
      const rows = await db.niceJobsWallet.findMany({ where: { assignment: { profile: { companyId: b.company.id, ...(!q.management ? { personId: b.personId } : {}), person: { displayName: { contains: q.search } } }, version: { template: { productId: b.product.id } }, divisionId: { in: ids }, ...(q.assignmentId ? { id: q.assignmentId } : {}), ...(q.policyVersionId ? { incentiveEarnings: { some: { policyVersionId: q.policyVersionId } } } : {}) }, ...(q.after ? { id: { gt: q.after } } : {}), ...(q.status ? { status: q.status } : {}) }, include: { assignment: { include: { profile: { include: { person: true } }, division: true } } }, orderBy: { id: "asc" }, take: q.limit + 1 });
      const window = rows.slice(0, q.limit), walletIds = window.map(w => w.id);
      const posted = await db.niceJobsWalletLedger.groupBy({ by: ["walletId"], where: { walletId: { in: walletIds } }, _sum: { amountMinor: true } });
      const reserved = await db.niceJobsSettlementStatement.groupBy({ by: ["walletId", "status"], where: { walletId: { in: walletIds }, OR: [{ status: "APPROVED" }, { status: "REVIEW", period: { status: { in: ["OPEN", "REVIEW", "APPROVAL_GRANTED"] } } }] }, _sum: { amountMinor: true } });
      const pending = await db.niceJobsIncentiveEarning.groupBy({ by: ["assignmentId", "currency"], where: { OR: window.map(w => ({ assignmentId: w.assignmentId, currency: w.currency })), eligibility: "ELIGIBLE", status: { in: ["CALCULATED", "UNDER_REVIEW", "APPROVED"] } }, _sum: { amountMinor: true } });
      const records = window.map(w => {
        const postedMinor = boundedMoney(posted.find(p => p.walletId === w.id)?._sum.amountMinor ?? 0n), reservedMinor = boundedMoney(reserved.find(p => p.walletId === w.id && p.status === "REVIEW")?._sum.amountMinor ?? 0n);
        return { id: w.id, assignmentId: w.assignmentId, employee: w.assignment.profile.person.displayName, division: w.assignment.division.name, currency: w.currency, status: w.status, postedMinor: postedMinor.toString(), reservedMinor: reservedMinor.toString(), availableMinor: boundedMoney(postedMinor - reservedMinor).toString(), pendingMinor: boundedMoney(pending.find(p => p.assignmentId === w.assignmentId && p.currency === w.currency)?._sum.amountMinor ?? 0n).toString(), reservedForPayoutMinor: boundedMoney(reserved.find(p => p.walletId === w.id && p.status === "APPROVED")?._sum.amountMinor ?? 0n).toString() };
      });
      return { records, nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null, companyId: b.company.id, provider: "NOT_CONFIGURED", asOf: now() };
    });
  }
  async function records(userId: string, kind: typeof financeKinds[number], raw: unknown = {}, constraint?: AgentConstraint) {
    if (!financeKinds.includes(kind)) throw new AccessError("Financial view unavailable");
    const q = financeQuery.parse(raw);
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId, constraint);
      if (q.companyId && q.companyId !== b.company.id || !q.management && ["policies", "adjustments", "settlements", "exceptions"].includes(kind)) throw new AccessError("Financial view unavailable");
      const read = kind === "policies" ? "policy.read" : kind === "incentives" ? "incentive.read" : kind === "adjustments" ? "wallet.read" : kind === "payouts" ? "payout.read" : kind === "exceptions" ? "reconcile" : "settlement.read";
      const scopes = b.ctx.organizationIds(q.management ? "nicejobs.finance." + read : "nicejobs.finance.self.read").filter(id => !q.divisionId || id === q.divisionId);
      const ids = q.management && kind !== "policies" ? scopes.filter(id => b.ctx.organizationIds("person.read").includes(id) && b.ctx.organizationIds("nicejobs.workspace.read").includes(id)) : scopes;
      if (!ids.length) throw new AccessError("Financial view not authorized");
      const page = { ...(q.after ? { id: { gt: q.after } } : {}), ...(q.status ? { status: q.status } : {}) };
      const policyWhere = { companyId: b.company.id, divisionId: { in: ids }, jobVersion: { template: { productId: b.product.id } } };
      const assignmentWhere: Prisma.NiceJobsAssignmentWhereInput = { profile: { companyId: b.company.id, ...(!q.management ? { personId: b.personId } : {}), person: { displayName: { contains: q.search } } }, version: { template: { productId: b.product.id } }, divisionId: { in: ids }, ...(q.assignmentId ? { id: q.assignmentId } : {}) };
      const records: FinanceRecord[] = [], scopeById = new Map<string, string>();
      const add = (scope: string, r: Omit<FinanceRecord, "capabilities">) => { records.push({ ...r, capabilities: q.management ? ["policy.manage", "policy.review", "policy.publish", "calculate", "wallet.open", "wallet.post", "wallet.adjust", "wallet.reverse", "settlement.create", "payout.request", "reconcile", "private"].filter(k => b.ctx.organizationIds("nicejobs.finance." + k).includes(scope)) : [] }); scopeById.set(r.id, scope); };
      if (kind === "policies") for (const v of await db.niceJobsIncentiveVersion.findMany({ where: { ...page, policy: { ...policyWhere, name: { contains: q.search } }, ...(q.policyVersionId ? { id: q.policyVersionId } : {}) }, include: versionInclude, orderBy: { id: "asc" }, take: q.limit + 1 })) add(v.policy.divisionId, { id: v.id, name: v.policy.name + " / v" + v.number, status: v.status, revision: v.revision, currency: v.currency, definition: incentivePolicy.parse(JSON.parse(v.definition)) });
      if (kind === "incentives") for (const e of await db.niceJobsIncentiveEarning.findMany({ where: { ...page, assignment: assignmentWhere, ...(q.policyVersionId ? { policyVersionId: q.policyVersionId } : {}) }, include: { assignment: { include: { profile: { include: { person: true } } } }, policy: true }, orderBy: { id: "asc" }, take: q.limit + 1 })) add(e.assignment.divisionId, { id: e.id, name: e.policy.name + (q.management ? " / " + e.assignment.profile.person.displayName : ""), status: e.status, revision: e.revision, currency: e.currency, amountMinor: e.amountMinor?.toString() ?? null, assignmentId: e.assignmentId, versionId: e.policyVersionId, snapshotId: q.management ? e.snapshotId : undefined, requestId: q.management ? e.requestId : undefined, periodStart: e.periodStart, periodEnd: e.periodEnd, detail: e.status + "; " + (e.eligibility === "ELIGIBLE" ? "Eligible immutable policy/evidence calculation" : "No payable amount available") });
      if (kind === "adjustments") for (const a of await db.niceJobsWalletAdjustment.findMany({ where: { ...page, wallet: { assignment: assignmentWhere }, ...(q.policyVersionId ? { policyVersionId: q.policyVersionId } : {}) }, include: { wallet: { include: { assignment: true } } }, orderBy: { id: "asc" }, take: q.limit + 1 })) add(a.wallet.assignment.divisionId, { id: a.id, name: a.description, status: a.status, revision: a.revision, currency: a.wallet.currency, amountMinor: (a.direction === "DEBIT" ? -a.amountMinor : a.amountMinor).toString(), walletId: a.walletId, versionId: a.policyVersionId, requestId: a.requestId, detail: a.reason, privateNote: b.ctx.organizationIds("nicejobs.finance.private").includes(a.wallet.assignment.divisionId) ? a.privateNote : undefined });
      if (kind === "settlements") for (const p of await db.niceJobsSettlementPeriod.findMany({ where: { ...page, policy: { ...policyWhere, name: { contains: q.search } }, ...(q.policyVersionId ? { policyVersionId: q.policyVersionId } : {}) }, include: { policy: true }, orderBy: { id: "asc" }, take: q.limit + 1 })) add(p.policy.divisionId, { id: p.id, name: p.policy.name, status: p.status, revision: p.revision, currency: p.currency, versionId: p.policyVersionId, requestId: p.requestId, periodStart: p.from, periodEnd: p.until });
      if (kind === "statements") for (const s of await db.niceJobsSettlementStatement.findMany({ where: { ...page, wallet: { assignment: assignmentWhere }, ...(q.policyVersionId ? { period: { policyVersionId: q.policyVersionId } } : {}) }, include: { wallet: { include: { assignment: true } }, period: true }, orderBy: { id: "asc" }, take: q.limit + 1 })) add(s.wallet.assignment.divisionId, { id: s.id, name: "Settlement statement", status: s.status, revision: 0, currency: s.currency, amountMinor: s.amountMinor.toString(), walletId: s.walletId, periodStart: s.period.from, periodEnd: s.period.until, detail: "Immutable recorded statement; not proof of payment" });
      if (kind === "payouts") for (const p of await db.niceJobsPayoutIntent.findMany({ where: { ...page, statement: { wallet: { assignment: assignmentWhere }, ...(q.policyVersionId ? { period: { policyVersionId: q.policyVersionId } } : {}) } }, include: { statement: { include: { wallet: { include: { assignment: true } } } } }, orderBy: { id: "asc" }, take: q.limit + 1 })) add(p.statement.wallet.assignment.divisionId, { id: p.id, name: "Payout intent", status: p.status, revision: 0, currency: p.currency, amountMinor: p.amountMinor.toString(), walletId: p.statement.walletId, detail: "Provider not configured. No funds have been confirmed transferred." });
      if (kind === "exceptions") { if (q.status) fail("Exception status filtering is not configured"); for (const e of await db.niceJobsFinanceException.findMany({ where: { companyId: b.company.id, divisionId: { in: ids }, ...(q.after ? { id: { gt: q.after } } : {}), summary: { contains: q.search } }, orderBy: { id: "asc" }, take: q.limit + 1 })) add(e.divisionId, { id: e.id, name: e.code, status: "RECORDED", revision: 0, walletId: e.walletId ?? undefined, detail: e.summary }); }
      const visible = records.slice(0, q.limit), requestIds = visible.flatMap(r => r.requestId ? [r.requestId] : []);
      if (requestIds.length) {
        const approvals = await db.siaApproval.findMany({ where: { requestId: { in: requestIds } }, include: { approver: { include: { person: true } } }, orderBy: { id: "asc" }, take: 2501 });
        if (approvals.length > 2500) fail("Financial approval history bound exceeded");
        for (const r of visible) r.approvals = approvals.filter(a => a.requestId === r.requestId).map(a => ({ id: a.id, status: a.status, name: a.approver?.person?.displayName ?? "Human approver", comment: a.comment, canDecide: a.approverUserId === userId && a.status === "PENDING" && b.ctx.organizationIds("approval.decide").includes(scopeById.get(r.id)!) }));
      }
      return { records: visible, nextCursor: records.length > q.limit ? records[q.limit - 1].id : null, companyId: b.company.id, timezone: b.timezone, provider: "NOT_CONFIGURED" };
    });
  }
  async function options(userId: string) {
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId), orgs = b.ctx.organizationIds("nicejobs.finance.policy.read").filter(id => b.ctx.nodes.some(n => n.id === id && n.parentId === b.company.id && n.type === "DIVISION"));
      const divisions = await db.organization.findMany({ where: { id: { in: orgs }, status: "ACTIVE" }, select: { id: true, name: true }, take: 50, orderBy: { id: "asc" } });
      const frameworks = await db.niceJobsPerformanceVersion.findMany({ where: { status: "PUBLISHED", framework: { companyId: b.company.id, divisionId: { in: orgs.filter(id => b.ctx.organizationIds("nicejobs.performance.framework.read").includes(id)) }, jobVersion: { template: { productId: b.product.id } } } }, include: { framework: true }, take: 50, orderBy: { id: "asc" } });
      const points = await db.controlPoint.findMany({ where: { organizationId: { in: orgs.filter(id => b.ctx.organizationIds("control.read").includes(id)) }, status: "ACTIVE", allowSelfApproval: false, kind: { in: ["APPROVAL", "HUMAN_DECISION"] }, requiredPermission: { startsWith: "nicejobs.finance." } }, select: { id: true, name: true, organizationId: true, requiredPermission: true }, take: 50, orderBy: { id: "asc" } });
      const policies = await db.niceJobsIncentiveVersion.findMany({ where: { status: "PUBLISHED", policy: { companyId: b.company.id, divisionId: { in: orgs }, jobVersion: { template: { productId: b.product.id } } } }, include: versionInclude, take: 50, orderBy: { id: "asc" } });
      const workforceScopes = orgs.filter(id => b.ctx.organizationIds("person.read").includes(id) && b.ctx.organizationIds("nicejobs.workspace.read").includes(id));
      const assignments = await db.niceJobsAssignment.findMany({ where: { profile: { companyId: b.company.id }, divisionId: { in: workforceScopes }, version: { template: { productId: b.product.id } } }, include: { profile: { include: { person: true } } }, take: 50, orderBy: { id: "asc" } });
      const snapshots = await db.niceJobsPerformanceSnapshot.findMany({ where: { assignment: { profile: { companyId: b.company.id }, divisionId: { in: workforceScopes.filter(id => b.ctx.organizationIds("nicejobs.performance.read").includes(id)) } }, correction: null }, select: { id: true, assignmentId: true, frameworkVersionId: true, periodStart: true, periodEnd: true }, take: 50, orderBy: { id: "asc" } });
      const wallets = await db.niceJobsWallet.findMany({ where: { assignment: { profile: { companyId: b.company.id }, divisionId: { in: workforceScopes.filter(id => b.ctx.organizationIds("nicejobs.finance.wallet.read").includes(id)) } } }, select: { id: true, assignmentId: true, currency: true }, take: 50, orderBy: { id: "asc" } });
      return { divisions, frameworks: frameworks.map(f => ({ id: f.id, name: f.framework.name + " / v" + f.number, divisionId: f.framework.divisionId, jobVersionId: f.framework.jobVersionId, metrics: z.object({ metrics: z.array(metricResult.shape.metric) }).passthrough().parse(JSON.parse(f.definition)).metrics.filter(m => m.active).map(m => ({ id: m.key, name: m.name })) })), points, policies: policies.map(p => ({ id: p.id, name: p.policy.name + " / v" + p.number, divisionId: p.policy.divisionId, jobVersionId: p.policy.jobVersionId, currency: p.currency })), assignments: assignments.map(a => ({ id: a.id, name: a.profile.person.displayName, divisionId: a.divisionId, jobVersionId: a.versionId })), snapshots, wallets, companyId: b.company.id, capabilities: Object.fromEntries(divisions.map(d => [d.id, ["policy.manage", "calculate", "wallet.open", "wallet.adjust", "settlement.create"].filter(k => b.ctx.organizationIds("nicejobs.finance." + k).includes(d.id))])) };
    });
  }
  async function explanation(userId: string, earningId: string, constraint?: AgentConstraint) {
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId, constraint); await financialRead(db, b.ctx, "NICE_JOBS_EARNING", earningId);
      const e = await db.niceJobsIncentiveEarning.findUniqueOrThrow({ where: { id: earningId }, include: { policyVersion: { include: versionInclude } } });
      const p = incentivePolicy.parse(JSON.parse(e.policyVersion.definition)), proof = await sourceProof(db, b, e.snapshotId, p, true);
      const frozen = z.object({ actual: z.string().nullable(), result: z.object({ amountMinor: z.string().nullable(), reason: z.string() }), calculatedAt: z.string() }).passthrough().parse(JSON.parse(e.calculation));
      return { id: e.id, policy: e.policyVersion.policy.name, policyVersion: e.policyVersion.number, assignmentId: e.assignmentId, periodStart: e.periodStart, periodEnd: e.periodEnd, metric: proof.result.metric.name, source: proof.result.metric.source, actual: frozen.actual, threshold: p.eligibility.minimumActual, target: proof.result.metric.target ?? null, rule: p.rule, rounding: p.rounding, status: e.status, eligibility: e.eligibility === "ELIGIBLE" ? "ELIGIBLE" : "NO_PAYABLE_RESULT", amountMinor: e.amountMinor?.toString() ?? null, currency: e.currency, evidence: proof.result.evidence, evidenceCount: proof.result.evidenceCount, sampled: proof.result.sampled, calculatedAt: frozen.calculatedAt, calculation: frozen.result.reason };
    });
  }
  async function statementDetail(userId: string, statementId: string, constraint?: AgentConstraint) {
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId, constraint); await financialRead(db, b.ctx, "NICE_JOBS_STATEMENT", statementId);
      const s = await db.niceJobsSettlementStatement.findUniqueOrThrow({ where: { id: statementId }, include: { period: true, lines: { include: { ledger: { select: { type: true, description: true } } }, take: 251 }, payout: true } });
      if (s.lines.length > 250) fail("Statement detail bound exceeded");
      return { id: s.id, periodStart: s.period.from, periodEnd: s.period.until, amountMinor: s.amountMinor.toString(), currency: s.currency, status: s.status, approvedAt: s.period.approvedAt, walletId: s.walletId, lines: s.lines.map(l => ({ id: l.id, ledgerId: l.ledgerId, type: l.ledger.type, description: l.ledger.description, amountMinor: l.amountMinor.toString() })), deductions: "NOT_CONFIGURED", provider: "NOT_CONFIGURED", payoutStatus: s.payout?.status ?? "NOT_REQUESTED", transferredMinor: null };
    });
  }
  return { mutate, list, wallet, records, options, explanation, statementDetail };
}
export const financeService = createFinanceService();
