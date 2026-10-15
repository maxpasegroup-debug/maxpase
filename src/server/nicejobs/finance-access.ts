import type { Prisma } from "@prisma/client";
import { AccessError, createAccessContext } from "@/server/authorization/engine";

type DB = Prisma.TransactionClient;
type AccessContext = Awaited<ReturnType<typeof createAccessContext>>;
export const financialResourceTypes = ["NICE_JOBS_EARNING", "NICE_JOBS_WALLET", "NICE_JOBS_ADJUSTMENT", "NICE_JOBS_SETTLEMENT", "NICE_JOBS_STATEMENT", "NICE_JOBS_PAYOUT"] as const;
export type FinancialResource = typeof financialResourceTypes[number];
export async function financialResource(db: DB, type: FinancialResource, id: string) {
  const assignment = { include: { profile: true, division: true, version: { include: { template: true } } } } as const;
  let a; let divisionId: string | undefined, companyId: string | undefined, productId: string | undefined, read: string;
  if (type === "NICE_JOBS_EARNING") { const r = await db.niceJobsIncentiveEarning.findUnique({ where: { id }, include: { assignment } }); a = r?.assignment; read = "incentive.read"; }
  else if (type === "NICE_JOBS_WALLET") { const r = await db.niceJobsWallet.findUnique({ where: { id }, include: { assignment } }); a = r?.assignment; read = "wallet.read"; }
  else if (type === "NICE_JOBS_ADJUSTMENT") { const r = await db.niceJobsWalletAdjustment.findUnique({ where: { id }, include: { wallet: { include: { assignment } } } }); a = r?.wallet.assignment; read = "wallet.read"; }
  else if (type === "NICE_JOBS_STATEMENT" || type === "NICE_JOBS_PAYOUT") { const statementId = type === "NICE_JOBS_PAYOUT" ? (await db.niceJobsPayoutIntent.findUnique({ where: { id }, select: { statementId: true } }))?.statementId : id; const r = statementId && await db.niceJobsSettlementStatement.findUnique({ where: { id: statementId }, include: { wallet: { include: { assignment } } } }); a = r ? r.wallet.assignment : undefined; read = type === "NICE_JOBS_PAYOUT" ? "payout.read" : "settlement.read"; }
  else { const r = await db.niceJobsSettlementPeriod.findUnique({ where: { id }, include: { policy: { include: { jobVersion: { include: { template: true } } } } } }); divisionId = r?.policy.divisionId; companyId = r?.policy.companyId; productId = r?.policy.jobVersion.template.productId; read = "settlement.read"; }
  if (a) { if (a.version.template.companyId !== a.profile.companyId || a.division.parentId !== a.profile.companyId) throw new AccessError("Financial scope unavailable"); divisionId = a.divisionId; companyId = a.profile.companyId; productId = a.version.template.productId; }
  if (!productId || !await db.product.findFirst({ where: { id: productId, slug: "nice-jobs", status: "ACTIVE", division: { slug: "aira-career-hub", parentId: companyId, status: "ACTIVE" } }, select: { id: true } })) throw new AccessError("Financial product unavailable");
  const company = companyId && await db.organization.findFirst({ where: { id: companyId, slug: "aira-skill-city", status: "ACTIVE", company: { is: { status: "ACTIVE" } } }, select: { id: true } });
  if (!company || !divisionId || !await db.organization.findFirst({ where: { id: divisionId, parentId: company.id, type: "DIVISION", status: "ACTIVE" }, select: { id: true } })) throw new AccessError("Financial resource unavailable");
  return { organizationId: divisionId, companyId: company.id, assignmentId: a?.id, personId: a?.profile.personId, read: "nicejobs.finance." + read };
}
export async function financialRead(db: DB, ctx: AccessContext, type: FinancialResource, id: string) {
  const target = await financialResource(db, type, id);
  await ctx.requireAccess(target.personId === ctx.user?.personId ? "nicejobs.finance.self.read" : target.read, target);
  if (target.personId !== ctx.user?.personId) { await ctx.requireAccess("person.read", target); await ctx.requireAccess("nicejobs.workspace.read", target); }
  return target;
}
export async function financialRequestGuard(db: DB, request: { id: string; resourceType: string; resourceId: string; controlPointId: string }, personId?: string | null) {
  if (!financialResourceTypes.includes(request.resourceType as FinancialResource)) return;
  let expected: string | undefined, bound: string | null | undefined, state: string | undefined;
  if (request.resourceType === "NICE_JOBS_EARNING") { const r = await db.niceJobsIncentiveEarning.findUnique({ where: { id: request.resourceId }, include: { policyVersion: true, assignment: { include: { profile: true } } } }); if (personId && r?.assignment.profile.personId === personId) throw new AccessError("Beneficiary self approval is forbidden"); expected = r && JSON.parse(r.policyVersion.definition).approvalControlPointId; bound = r?.requestId; state = r?.status; }
  else if (request.resourceType === "NICE_JOBS_ADJUSTMENT") { const r = await db.niceJobsWalletAdjustment.findUnique({ where: { id: request.resourceId }, include: { policyVersion: true, wallet: { include: { assignment: { include: { profile: true } } } } } }); if (personId && r?.wallet.assignment.profile.personId === personId) throw new AccessError("Beneficiary self approval is forbidden"); expected = r && JSON.parse(r.policyVersion.definition).adjustmentControlPointId; bound = r?.requestId; state = r?.status; }
  else if (request.resourceType === "NICE_JOBS_SETTLEMENT") { const r = await db.niceJobsSettlementPeriod.findUnique({ where: { id: request.resourceId }, include: { policyVersion: true } }); if (personId && await db.niceJobsSettlementStatement.count({ where: { periodId: request.resourceId, wallet: { assignment: { profile: { personId } } } } })) throw new AccessError("Beneficiary settlement approval is forbidden"); expected = r && JSON.parse(r.policyVersion.definition).settlementControlPointId; bound = r?.requestId; state = r?.status; }
  else throw new AccessError("This financial resource is not an approval request");
  if (bound !== request.id || expected !== request.controlPointId || !["UNDER_REVIEW", "REVIEW", "APPROVED", "APPROVAL_GRANTED", "POSTED", "CLOSED"].includes(state ?? "")) throw new AccessError("Financial approval binding changed");
}

export async function financialDecision(db: DB, request: { id: string; resourceType: string; resourceId: string }, decision: "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED") {
  if (!financialResourceTypes.includes(request.resourceType as FinancialResource)) return null;
  if (request.resourceType === "NICE_JOBS_EARNING" || request.resourceType === "NICE_JOBS_ADJUSTMENT") {
    const args = { where: { id: request.resourceId, requestId: request.id, status: "UNDER_REVIEW" }, data: { status: decision, revision: { increment: 1 } } };
    const changed = request.resourceType === "NICE_JOBS_EARNING" ? await db.niceJobsIncentiveEarning.updateMany(args) : await db.niceJobsWalletAdjustment.updateMany(args);
    if (changed.count !== 1) throw new AccessError("Financial state changed");
  }
  else if (request.resourceType === "NICE_JOBS_SETTLEMENT") {
    const changed = await db.niceJobsSettlementPeriod.updateMany({ where: { id: request.resourceId, requestId: request.id, status: "REVIEW" }, data: { status: decision === "APPROVED" ? "APPROVAL_GRANTED" : decision, revision: { increment: 1 } } }); if (changed.count !== 1) throw new AccessError("Settlement state changed");
    if (decision !== "APPROVED") {
      await db.niceJobsSettlementLine.updateMany({ where: { statement: { periodId: request.resourceId } }, data: { activeLedgerId: null } });
      await db.niceJobsSettlementStatement.updateMany({ where: { periodId: request.resourceId, status: "REVIEW" }, data: { status: "VOIDED" } });
    }
  }
  return { id: request.resourceId, previous: request.resourceType === "NICE_JOBS_SETTLEMENT" ? "REVIEW" : "UNDER_REVIEW", next: decision === "APPROVED" && request.resourceType === "NICE_JOBS_SETTLEMENT" ? "APPROVAL_GRANTED" : decision };
}
