import type { Prisma } from "@prisma/client";
import { AccessError, createAccessContext, type ResourceScope } from "@/server/authorization/engine";
import type { resourceTypes } from "./operations-input";
import { workerKnowledgeWhere, knowledgeCapability, type KnowledgeKind } from "@/server/nicejobs/knowledge-access";
import { financialRead, type FinancialResource } from "@/server/nicejobs/finance-access";
export type DB = Prisma.TransactionClient;
export type Context = Awaited<ReturnType<typeof createAccessContext>>;
export type Resource = ResourceScope & { resourceType: string; resourceId: string };
export async function resolveResource(db: DB, ctx: Context, type: typeof resourceTypes[number], id: string, depth = 0): Promise<Resource> {
  if (depth > 8) throw new AccessError("Resource reference is too deeply nested");
  let scope: ResourceScope | null = null;
  let read = "";
  switch (type) {
    case "NICE_JOBS_EARNING": case "NICE_JOBS_WALLET": case "NICE_JOBS_ADJUSTMENT": case "NICE_JOBS_SETTLEMENT": case "NICE_JOBS_STATEMENT": case "NICE_JOBS_PAYOUT": {
      const target = await financialRead(db, ctx, type as FinancialResource, id);
      return { organizationId: target.organizationId, projectId: null, resourceType: type, resourceId: id };
    }
    case "NICE_JOBS_PERFORMANCE":
    case "NICE_JOBS_PIP": {
      const p = type === "NICE_JOBS_PIP" ? await db.niceJobsPip.findUnique({ where: { id } }) : null;
      if (type === "NICE_JOBS_PIP" && !p) throw new AccessError("Plan unavailable");
      const s = await db.niceJobsPerformanceSnapshot.findUnique({ where: { id: p?.snapshotId ?? id }, include: { assignment: { include: { profile: true } }, frameworkVersion: { include: { framework: true } } } });
      if (!s || s.assignment.profile.companyId !== s.frameworkVersion.framework.companyId || s.assignment.divisionId !== s.frameworkVersion.framework.divisionId || s.assignment.versionId !== s.frameworkVersion.framework.jobVersionId) throw new AccessError("Performance unavailable");
      await resolveResource(db, ctx, "NICE_JOBS_ASSIGNMENT", s.assignmentId, depth + 1);
      scope = { organizationId: s.assignment.divisionId };
      if (s.assignment.profile.personId === ctx.user?.personId) {
        if (p && (!p.released || p.status === "DRAFT")) throw new AccessError("Plan unavailable");
        await ctx.requireAccess("nicejobs.performance.self.read", scope);
        read = p ? "nicejobs.pip.self.read" : "nicejobs.performance.self.read";
      } else { await ctx.requireAccess("nicejobs.performance.read", scope); read = p ? "nicejobs.pip.read" : "nicejobs.performance.read"; }
      break;
    }
    case "NICE_JOBS_KNOWLEDGE": {
      const v = await db.niceJobsKnowledgeVersion.findUnique({ where: { id }, include: { content: { include: { company: { include: { company: true } } } }, organization: true } });
      if (!v || v.content.company.slug !== "aira-skill-city" || v.content.company.status !== "ACTIVE" || v.content.company.company?.status !== "ACTIVE" || v.organization.status !== "ACTIVE" || v.organizationId !== v.content.companyId && v.organization.parentId !== v.content.companyId) throw new AccessError("Content unavailable");
      if (!await db.product.findFirst({ where: { organizationId: v.content.companyId, slug: "nice-jobs", status: "ACTIVE", division: { is: { slug: "aira-career-hub", parentId: v.content.companyId, status: "ACTIVE" } } }, select: { id: true } })) throw new AccessError("Content unavailable");
      scope = { organizationId: v.organizationId };
      if ((await ctx.decide("nicejobs.knowledge.read", scope)).allowed) read = "nicejobs.knowledge.read";
      else {
        const rows = await db.niceJobsAssignment.findMany({ where: { profile: { companyId: v.content.companyId, personId: ctx.user?.personId ?? "__none__" }, status: "ACTIVE", lifecycle: "ACTIVE", onboardingId: { not: null }, readinessReviewId: { not: null } }, include: { version: true }, take: 2 });
        if (rows.length !== 1) throw new AccessError("Worker content unavailable");
        await resolveResource(db, ctx, "NICE_JOBS_ASSIGNMENT", rows[0].id, depth + 1);
        if (!await db.niceJobsKnowledgeVersion.findFirst({ where: { AND: [workerKnowledgeWhere(ctx, rows[0], v.content.companyId, v.content.kind as KnowledgeKind, new Date(), false), { id }] }, select: { id: true } })) throw new AccessError("Content unavailable");
        read = knowledgeCapability(v.content.kind);
      }
      break;
    }
    case "NICE_JOBS_LEAD": {
      const l = await db.niceJobsLead.findUnique({ where: { id }, include: { company: { include: { company: true } }, division: true, policy: { include: { definition: true, eligibility: true } }, currentWorkerAssignment: { include: { profile: true } } } });
      if (!l || l.company.slug !== "aira-skill-city" || l.company.status !== "ACTIVE" || l.company.company?.status !== "ACTIVE" || l.division.parentId !== l.companyId || l.division.status !== "ACTIVE" || l.policy.companyId !== l.companyId || l.policy.divisionId !== l.divisionId || l.policy.definition.organizationId !== l.divisionId || l.policy.definition.projectId) throw new AccessError("Lead unavailable");
      scope = { organizationId: l.divisionId };
      if (l.currentWorkerAssignment?.profile.personId === ctx.user?.personId) {
        await resolveResource(db, ctx, "NICE_JOBS_ASSIGNMENT", l.currentWorkerAssignmentId!, depth + 1);
        if (l.policy.status !== "ACTIVE" || l.policy.definition.status !== "ACTIVE" || l.currentWorkerAssignment!.divisionId !== l.divisionId || !l.policy.eligibility.some(e => e.versionId === l.currentWorkerAssignment!.versionId)) throw new AccessError("Lead policy unavailable");
        read = "nicejobs.lead.self.read";
      } else read = "nicejobs.lead.pool.read";
      break;
    }
    case "NICE_JOBS_ASSIGNMENT": {
      const a = await db.niceJobsAssignment.findUnique({ where: { id }, include: { profile: { include: { company: { include: { company: true } }, person: true } }, division: true, version: { include: { template: { include: { product: { include: { division: true } } } } } }, onboarding: true, readinessReview: true } });
      if (!a || a.profile.company.slug !== "aira-skill-city" || a.profile.company.status !== "ACTIVE" || a.profile.company.company?.status !== "ACTIVE" || a.profile.person.status !== "ACTIVE" || a.division.parentId !== a.profile.companyId || a.division.status !== "ACTIVE" || a.version.template.companyId !== a.profile.companyId || a.version.template.product.slug !== "nice-jobs" || a.version.template.product.status !== "ACTIVE" || a.version.template.product.division?.slug !== "aira-career-hub" || a.version.template.product.division.status !== "ACTIVE") throw new AccessError("Worker resource unavailable");
      scope = { organizationId: a.divisionId };
      if (a.profile.personId === ctx.user?.personId) {
        if (a.status !== "ACTIVE" || a.lifecycle !== "ACTIVE" || !a.activatedAt || a.onboarding?.status !== "READY" || a.readinessReview?.outcome !== "READY" || !a.startDate || a.startDate > new Date() || a.endDate && a.endDate <= new Date()) throw new AccessError("Active worker resource unavailable");
        read = "nicejobs.workspace.self";
      } else { await ctx.requireAccess("person.read", scope); read = "nicejobs.workspace.read"; }
      break;
    }
    case "NICE_JOBS_ONBOARDING": {
      const e = await db.niceJobsOnboarding.findUnique({ where: { id }, include: { plan: true, offer: true, application: { include: { company: { include: { company: true } }, area: { include: { division: true, version: { include: { template: { include: { product: true } } } } } } } } } });
      const a = e?.application;
      if (!e || !a || a.company.slug !== "aira-skill-city" || a.company.status !== "ACTIVE" || a.company.company?.status !== "ACTIVE" || a.candidateId === ctx.user?.personId || a.companyId !== a.area.division.parentId || a.area.division.status !== "ACTIVE" || a.companyId !== a.area.version.template.companyId || a.area.version.template.product.slug !== "nice-jobs" || a.area.version.template.product.status !== "ACTIVE" || a.area.version.template.product.organizationId !== a.companyId || e.plan.versionId !== a.versionId || e.offer.applicationId !== a.id || e.offer.status !== "ACCEPTED" || !e.offer.acceptedAt || a.status !== "OFFER_ACCEPTED") throw new AccessError("Resource unavailable");
      scope = { organizationId: a.divisionId };
      read = (await ctx.decide("nicejobs.onboarding.read", scope)).allowed ? "nicejobs.onboarding.read" : e.reviewerUserId === ctx.user?.id && e.reviewerPersonId === ctx.user?.personId && (await ctx.decide("nicejobs.ojt.review", scope)).allowed ? "nicejobs.ojt.review" : e.readinessReviewerUserId === ctx.user?.id && e.readinessReviewerPersonId === ctx.user?.personId && (await ctx.decide("nicejobs.readiness.review", scope)).allowed ? "nicejobs.readiness.review" : "nicejobs.onboarding.read";
      break;
    }
    case "NICE_JOBS_RECRUITMENT": {
      const application = await db.niceJobsApplication.findFirst({ where: { id, company: { slug: "aira-skill-city", status: "ACTIVE", company: { is: { status: "ACTIVE" } } }, area: { division: { status: "ACTIVE" }, version: { template: { product: { slug: "nice-jobs", status: "ACTIVE" } } } } }, select: { companyId: true, divisionId: true, candidateId: true, area: { select: { division: { select: { parentId: true } }, version: { select: { template: { select: { companyId: true, product: { select: { organizationId: true } } } } } } } } } });
      if (!application || application.candidateId === ctx.user?.personId || application.companyId !== application.area.division.parentId || application.companyId !== application.area.version.template.companyId || application.companyId !== application.area.version.template.product.organizationId) throw new AccessError("Resource unavailable");
      scope = { organizationId: application.divisionId }; read = "nicejobs.application.read"; break;
    }
    case "NICE_JOBS_APPLICATION": {
      const application = await db.niceJobsApplication.findUnique({ where: { id }, include: { area: { include: { version: { select: { template: { select: { productId: true, companyId: true } } } } } } } });
      if (!application || application.candidateId !== ctx.user?.personId || application.companyId !== application.area.version.template.companyId) throw new AccessError("Resource unavailable");
      const product = await db.product.findFirst({ where: { id: application.area.version.template.productId, organizationId: application.companyId, slug: "nice-jobs", status: "ACTIVE", organization: { status: "ACTIVE", company: { is: { status: "ACTIVE" } } }, division: { is: { slug: "aira-career-hub", parentId: application.companyId, status: "ACTIVE" } } }, select: { divisionId: true } });
      if (!product?.divisionId) throw new AccessError("Resource unavailable");
      scope = { organizationId: product.divisionId };
      await ctx.requireAccess("organization.read", scope);
      read = "nicejobs.application.self"; break;
    }
    case "ORGANIZATION": scope = (await db.organization.findUnique({ where: { id } })) ? { organizationId: id } : null; read = "organization.read"; break;
    case "PROJECT": { const r = await db.project.findUnique({ where: { id } }); scope = r ? { organizationId: r.organizationId, projectId: r.id } : null; read = "project.read"; break; }
    case "TASK": scope = await db.task.findUnique({ where: { id } }); read = "task.read"; break;
    case "GOAL": {
      const g = await db.goal.findUnique({ where: { id } });
      scope = g; read = "goal.read";
      if (g && g.ownerPersonId === ctx.user?.personId && g.metadata) {
        const p = JSON.parse(g.metadata);
        if (p.kind === "NICE_JOBS_30_DAY") {
          await resolveResource(db, ctx, "NICE_JOBS_ASSIGNMENT", p.assignmentId, depth + 1);
          const a = await db.niceJobsAssignment.findUniqueOrThrow({ where: { id: p.assignmentId }, include: { profile: true } });
          if (a.divisionId !== g.organizationId || a.profile.personId !== g.ownerPersonId) throw new AccessError("Goal scope mismatch");
          read = "nicejobs.workspace.self";
        }
      }
      break;
    }
    case "PROGRAM": scope = await db.program.findUnique({ where: { id } }); read = "program.read"; break;
    case "BATCH": { const r = await db.batch.findUnique({ where: { id }, include: { program: true } }); scope = r?.program ?? null; read = "batch.read"; break; }
    case "LOCATION": scope = await db.location.findUnique({ where: { id } }); read = "location.read"; break;
    case "MILESTONE": { const r = await db.milestone.findUnique({ where: { id }, include: { project: true } }); scope = r ? { organizationId: r.project.organizationId, projectId: r.projectId } : null; read = "milestone.read"; break; }
    case "REQUEST": { const r = await db.operationalRequest.findUnique({ where: { id } }); if (r) await resolveResource(db, ctx, r.resourceType as typeof resourceTypes[number], r.resourceId, depth + 1); scope = r; read = "request.read"; break; }
    case "INSTANCE": { const r = await db.workflowInstance.findUnique({ where: { id } }); if (r) await resolveResource(db, ctx, r.resourceType as typeof resourceTypes[number], r.resourceId, depth + 1); scope = r; read = "workflow.read"; break; }
    case "APPROVAL": { const a = await db.siaApproval.findUnique({ where: { id }, include: { request: true } }); if (a?.request) await resolveResource(db, ctx, a.request.resourceType as typeof resourceTypes[number], a.request.resourceId, depth + 1); scope = a?.request ?? null; read = "approval.read"; break; }
  }
  if (!scope) throw new AccessError("Resource unavailable");
  await ctx.requireAccess(read, scope);
  return { organizationId: scope.organizationId, projectId: scope.projectId ?? null, resourceType: type, resourceId: id };
}
export async function boundResource(db: DB, ctx: Context, raw: Resource, permission: string) {
  const actual = await resolveResource(db, ctx, raw.resourceType as typeof resourceTypes[number], raw.resourceId);
  if (actual.organizationId !== raw.organizationId || raw.projectId !== undefined && (raw.projectId ?? null) !== actual.projectId) throw new AccessError("Resource scope mismatch");
  await ctx.requireAccess(permission, actual);
  return actual;
}
export async function validRecipient(db: DB, userId: string, resource: Resource, permission = "notification.read") {
  const ctx = await createAccessContext(userId, db, undefined, resource);
  if (!ctx.active || !ctx.user?.personId) throw new AccessError("Recipient unavailable");
  await boundResource(db, ctx, resource, permission);
  return ctx;
}
