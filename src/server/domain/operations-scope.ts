import type { Prisma } from "@prisma/client";
import { AccessError, createAccessContext, type ResourceScope } from "@/server/authorization/engine";
import type { resourceTypes } from "./operations-input";
export type DB = Prisma.TransactionClient;
export type Context = Awaited<ReturnType<typeof createAccessContext>>;
export type Resource = ResourceScope & { resourceType: string; resourceId: string };
export async function resolveResource(db: DB, ctx: Context, type: typeof resourceTypes[number], id: string, depth = 0): Promise<Resource> {
  if (depth > 8) throw new AccessError("Resource reference is too deeply nested");
  let scope: ResourceScope | null = null;
  let read = "";
  switch (type) {
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
    case "GOAL": scope = await db.goal.findUnique({ where: { id } }); read = "goal.read"; break;
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
