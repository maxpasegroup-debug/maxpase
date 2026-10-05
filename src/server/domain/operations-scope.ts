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
