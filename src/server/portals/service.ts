import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { createAccessContext } from "@/server/authorization/engine";
import { createExecutionService } from "@/server/domain/execution-service";
import { requirePortalAccess } from "./policy";
import type { PortalId } from "./sites";

export function createPortalService(client: PrismaClient = prisma) {
  async function dashboard(userId: string, portal: PortalId, view = "overview", cursor?: string) {
    const access = await requirePortalAccess(client, userId, portal);
    const scope = { organizationId: access.divisionId };
    const resolver = (id: string, db?: Prisma.TransactionClient) => createAccessContext(id, db ?? client, undefined, scope);
    const execution = createExecutionService(client, resolver);
    const kind = ["projects", "tasks", "goals"].includes(view) ? view as "projects" | "tasks" | "goals" : "tasks";
    const readable = view !== "programs" && (await access.ctx.decide({ projects: "project.read", tasks: "task.read", goals: "goal.read" }[kind], scope)).allowed;
    const page = readable ? await execution.listPage(userId, kind, scope, { after: cursor }) : { records: [], nextCursor: null };
    const records = page.records.map(r => ({ id: r.id, title: "title" in r ? String(r.title) : "name" in r ? String(r.name) : "", status: "status" in r ? String(r.status) : "", dueAt: "dueDate" in r ? r.dueDate as Date | null : "targetDate" in r ? r.targetDate as Date | null : null }));
    const programRows = await client.program.findMany({ where: { companyOrganizationId: access.companyId, organizationId: { in: access.ctx.organizationIds("program.read") }, status: { not: "ARCHIVED" }, ...(view === "programs" && cursor ? { id: { gt: cursor } } : {}) }, select: { id: true, name: true, status: true, kind: true }, orderBy: { id: "asc" }, take: 51 });
    const programs = programRows.slice(0, 50);
    await requirePortalAccess(client, userId, portal);
    return { records, programs, nextCursor: view === "programs" ? programRows.length > 50 ? programs.at(-1)!.id : null : page.nextCursor, divisionId: access.divisionId };
  }
  return { dashboard };
}
export const portalService = createPortalService();
