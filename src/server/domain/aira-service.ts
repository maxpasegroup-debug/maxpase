import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { databasePage, checkRows, boundedRead, resultPage, type PageInput } from "./query-bounds";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { activeMembershipWhere, ancestry } from "@/server/authorization/business-scope";
import { companyForOrganization } from "./company-structure";
import { operationalEvent } from "./operational-events";
import { createBusinessService } from "./business-service";
import { createWorkforceService } from "./workforce-service";
import { createExecutionService } from "./execution-service";
import { createOperationsService } from "./operations-service";
import { resolveResource } from "./operations-scope";
import * as input from "./company-input";
import { lifecycle } from "./workforce-input";
type DB = Prisma.TransactionClient;
type Context = Awaited<ReturnType<typeof createAccessContext>>;
export const companyReadKeys: Record<input.CompanyKind, string> = { divisions: "organization.read", departments: "organization.read", teams: "organization.read", people: "person.read", programs: "program.read", batches: "batch.read", locations: "location.read", products: "product.read", projects: "project.read", goals: "goal.read", responsibilities: "responsibility.read", participants: "batch.read", approvals: "approval.read", requests: "request.read", notifications: "notification.read", workflows: "workflow.read", instances: "workflow.read", employers: "company.read" };
export function createAiraService(client: PrismaClient = prisma) {
  const business = createBusinessService(client), workforce = createWorkforceService(client), execution = createExecutionService(client), ops = createOperationsService(client);
  async function context(db: DB, userId: string) {
    const ctx = await createAccessContext(userId, db);
    const company = await db.organization.findUnique({ where: { slug: "aira-skill-city" }, include: { company: { include: { group: true } } } });
    if (!ctx.active || !company?.company || company.type !== "COMPANY" || !company.company.group || company.company.group.organizationId !== company.parentId || company.company.status !== "ACTIVE") throw new AccessError("AIRA company context unavailable");
    const group = await db.organization.findUnique({ where: { id: company.parentId! } });
    if (!group || group.type !== "GROUP" || group.slug !== "maxpase-group") throw new AccessError("AIRA company context unavailable");
    await ctx.requireAccess("company.read", { organizationId: company.id });
    const ids = ctx.nodes.filter(n => {
      const path = ancestry(ctx.nodes, n.id);
      return path.every(p => p.status === "ACTIVE") && path.find(p => p.type === "COMPANY")?.id === company.id;
    }).map(n => n.id);
    return { ctx, company, ids };
  }
  async function scope(db: DB, c: Awaited<ReturnType<typeof context>>, organizationId: string, key: string) {
    if (await companyForOrganization(db, organizationId) !== c.company.id) throw new AccessError("Resource is outside AIRA company context");
    await c.ctx.requireAccess(key, { organizationId });
  }
  async function event(db: DB, ctx: Context, organizationId: string, action: string, entityType: string, entityId: string, metadata: Prisma.InputJsonObject = {}) {
    await operationalEvent(db, { actorUserId: ctx.user!.id, actorPersonId: ctx.user!.personId, organizationId, action, entityType, entityId, result: "SUCCESS", metadata });
  }
  async function program(db: DB, c: Awaited<ReturnType<typeof context>>, id: string, key = "program.read") {
    const p = await db.program.findUnique({ where: { id } });
    if (!p || p.companyOrganizationId !== c.company.id) throw new AccessError("Program unavailable in AIRA");
    await scope(db, c, p.organizationId, key); return p;
  }
  async function location(db: DB, c: Awaited<ReturnType<typeof context>>, id: string, key = "location.read") {
    const l = await db.location.findUnique({ where: { id } });
    if (!l || l.companyOrganizationId !== c.company.id) throw new AccessError("Location unavailable in AIRA");
    await scope(db, c, l.organizationId, key); return l;
  }
  async function belongs(db: DB, ctx: Context, personId: string, organizationId: string) {
    const path = ancestry(ctx.nodes, organizationId).map(n => n.id);
    if (!await db.membership.findFirst({ where: { ...activeMembershipWhere(), personId, projectId: null, OR: [{ organizationId }, { organizationId: { in: path }, scope: "DESCENDANTS" }] } })) throw new AccessError("Person needs active membership coverage");
    await ctx.requireAccess("person.read", { organizationId });
  }
  async function enter(userId: string) {
    return client.$transaction(async db => {
      const c = await context(db, userId);
      await event(db, c.ctx, c.company.id, "company.context_entered", "Organization", c.company.id);
      return { id: c.company.id, name: c.company.company!.displayName };
    });
  }
  async function save(userId: string, kind: "programs" | "batches" | "locations" | "participants", raw: unknown, recordId?: string) {
    return client.$transaction(async db => {
      const c = await context(db, userId); let organizationId: string; let row: { id: string; status: string };
      if (kind === "programs") {
        const data = input.programInput.parse(raw);
        await scope(db, c, data.organizationId, "program.manage"); organizationId = data.organizationId;
        const division = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
        if (!["DIVISION", "BUSINESS_UNIT"].includes(division.type)) throw new AccessError("A program requires a division or business unit");
        await c.ctx.requireAccess("organization.read", { organizationId });
        const old = recordId ? await program(db, c, recordId, "program.manage") : null;
        if (old && old.organizationId !== organizationId) throw new AccessError("Program division cannot be changed");
        for (const [type, id] of [["brand", data.brandId], ["product", data.productId]] as const) if (id) {
          const linked = type === "brand" ? await db.brand.findUnique({ where: { id } }) : await db.product.findUnique({ where: { id } });
          if (!linked || linked.organizationId !== c.company.id || "divisionId" in linked && linked.divisionId && linked.divisionId !== organizationId) throw new AccessError("Program relationship belongs to another company or division");
          await c.ctx.requireAccess(type + ".read", linked);
          if (type === "product" && data.brandId && "brandId" in linked && linked.brandId !== data.brandId) throw new AccessError("Program brand conflicts with product");
        }
        if (old && data.capacity && await db.batch.count({ where: { programId: old.id, capacity: { gt: data.capacity }, status: { notIn: ["CANCELLED", "ARCHIVED", "COMPLETED"] } } })) throw new AccessError("Program capacity is below an open batch capacity");
        if (old && ["RETIRED", "ARCHIVED"].includes(data.status) && await db.batch.count({ where: { programId: old.id, status: { in: ["OPEN", "ACTIVE"] } } })) throw new AccessError("Close open batches before retiring the program");
        row = old ? await db.program.update({ where: { id: old.id }, data }) : await db.program.create({ data: { ...data, companyOrganizationId: c.company.id } });
      } else if (kind === "locations") {
        const data = input.locationInput.parse(raw); organizationId = data.organizationId;
        await scope(db, c, organizationId, "location.manage");
        const old = recordId ? await location(db, c, recordId, "location.manage") : null;
        if (old && old.organizationId !== organizationId) throw new AccessError("Location scope cannot be changed");
        if (old && data.status !== "ACTIVE" && await db.batch.count({ where: { locationId: old.id, status: { in: ["OPEN", "ACTIVE"] } } })) throw new AccessError("Open batches still use this location");
        row = old ? await db.location.update({ where: { id: old.id }, data }) : await db.location.create({ data: { ...data, companyOrganizationId: c.company.id } });
      } else if (kind === "batches") {
        const data = input.batchInput.parse(raw), p = await program(db, c, data.programId); organizationId = p.organizationId;
        await scope(db, c, organizationId, "batch.manage");
        const old = recordId ? await db.batch.findUnique({ where: { id: recordId } }) : null;
        if (recordId && (!old || old.programId !== p.id)) throw new AccessError("Batch program cannot be changed");
        if (["RETIRED", "ARCHIVED"].includes(p.status)) throw new AccessError("Program is closed");
        if (["OPEN", "ACTIVE"].includes(data.status) && p.status !== "ACTIVE") throw new AccessError("Open delivery requires an active program");
        if (data.status === "ACTIVE" && (!data.startDate || data.startDate > new Date())) throw new AccessError("Active batch requires an actual start date");
        if (data.status === "COMPLETED" && (!data.endDate || data.endDate > new Date())) throw new AccessError("Completed batch requires an actual end date");
        if (old && ["COMPLETED", "CANCELLED", "ARCHIVED"].includes(old.status) && data.status !== "ARCHIVED") throw new AccessError("Closed batch is read-only");
        if (p.capacity && data.capacity && data.capacity > p.capacity) throw new AccessError("Batch exceeds program capacity");
        if (old && data.capacity && await db.batchParticipant.count({ where: { batchId: old.id, status: { in: ["PLANNED", "ACTIVE"] } } }) > data.capacity) throw new AccessError("Capacity is below registered participation");
        if (data.locationId) {
          const l = await location(db, c, data.locationId);
          if (!ancestry(c.ctx.nodes, organizationId).some(n => n.id === l.organizationId) || ["INACTIVE", "ARCHIVED"].includes(l.status) || ["OPEN", "ACTIVE"].includes(data.status) && l.status !== "ACTIVE") throw new AccessError("Location is unavailable for this division");
        }
        row = old ? await db.batch.update({ where: { id: old.id }, data }) : await db.batch.create({ data });
      } else {
        const data = input.participantInput.parse(raw);
        const batch = await db.batch.findUnique({ where: { id: data.batchId } });
        if (!batch) throw new AccessError("Batch unavailable");
        const p = await program(db, c, batch.programId); organizationId = p.organizationId;
        await scope(db, c, organizationId, "batch.manage");
        if (["COMPLETED", "CANCELLED", "ARCHIVED"].includes(batch.status)) throw new AccessError("Closed batch cannot change participation");
        await belongs(db, c.ctx, data.personId, organizationId);
        if (data.status === "ACTIVE" && batch.status !== "ACTIVE") throw new AccessError("Active participation requires an active batch");
        const old = await db.batchParticipant.findUnique({ where: { batchId_personId: { batchId: batch.id, personId: data.personId } } });
        if (recordId && old?.id !== recordId) throw new AccessError("Participation identity cannot be changed");
        if (["PLANNED", "ACTIVE"].includes(data.status) && (!old || !["PLANNED", "ACTIVE"].includes(old.status)) && (batch.capacity ?? p.capacity) && await db.batchParticipant.count({ where: { batchId: batch.id, status: { in: ["PLANNED", "ACTIVE"] } } }) >= (batch.capacity ?? p.capacity)!) throw new AccessError("Batch capacity reached");
        row = await db.batchParticipant.upsert({ where: { batchId_personId: { batchId: batch.id, personId: data.personId } }, create: data, update: { status: data.status } });
      }
      const domain = { programs: "program", batches: "batch", locations: "location", participants: "participant" }[kind];
      await event(db, c.ctx, organizationId, domain + (recordId ? ".updated" : ".created"), kind, row.id, { status: row.status });
      return row;
    });
  }
  async function saveShared(userId: string, kind: "divisions" | "departments" | "teams" | "products" | "projects" | "goals" | "responsibilities", raw: Record<string, unknown>, recordId?: string) {
    await client.$transaction(async db => {
      const c = await context(db, userId);
      const organizationId = String(kind === "divisions" || kind === "departments" || kind === "teams" ? raw.parentId : raw.organizationId);
      await scope(db, c, organizationId, kind === "divisions" || kind === "departments" || kind === "teams" ? "organization.manage" : kind === "responsibilities" ? "responsibility.manage" : kind.slice(0, -1) + ".manage");
      if (recordId) {
        const old = ["divisions", "departments", "teams"].includes(kind) ? await db.organization.findUnique({ where: { id: recordId } }) : kind === "products" ? await db.product.findUnique({ where: { id: recordId } }) : kind === "projects" ? await db.project.findUnique({ where: { id: recordId } }) : kind === "goals" ? await db.goal.findUnique({ where: { id: recordId } }) : await db.responsibility.findUnique({ where: { id: recordId } });
        if (!old || !("organizationId" in old ? c.ids.includes(old.organizationId) : c.ids.includes(old.id))) throw new AccessError("Record is outside AIRA");
      }
      if (kind === "divisions" && !["DIVISION", "BUSINESS_UNIT"].includes(String(raw.type))) throw new AccessError("Choose a division or business unit");
    });
    if (kind === "products") return business.save(userId, kind, raw, recordId);
    if (kind === "projects" || kind === "goals") return execution.save(userId, kind, raw, recordId);
    return workforce.save(userId, kind === "divisions" ? "organizations" : kind, raw, recordId);
  }
  async function startWorkflow(userId: string, raw: Record<string, unknown>) {
    const resource = await client.$transaction(async db => {
      const c = await context(db, userId);
      const r = await resolveResource(db, c.ctx, String(raw.resourceType) as "PROGRAM", String(raw.resourceId));
      await scope(db, c, r.organizationId, "workflow.manage"); return r;
    });
    return ops.startWorkflow(userId, { ...raw, ...resource });
  }
  async function list(userId: string, kind: input.CompanyKind, query: { organizationId?: string; search?: string; status?: string; divisionId?: string; page?: PageInput } = {}): Promise<Record<string, unknown>[]> {
    const c = await client.$transaction(db => context(db, userId));
    const key = companyReadKeys[kind];
    if (query.organizationId) await client.$transaction(db => scope(db, c, query.organizationId!, key));
    if (query.divisionId) await client.$transaction(db => scope(db, c, query.divisionId!, "organization.read"));
    const ids = c.ids.filter(id => c.ctx.organizationIds(key).includes(id) && (!query.organizationId || id === query.organizationId));
    const search = query.search?.trim().slice(0, 200) ?? "";
    const status = query.status ? { status: query.status.slice(0, 50) } : {};
    const lifecycleFilter = query.status && ["divisions", "departments", "teams", "products", "responsibilities"].includes(kind) ? { status: lifecycle.parse(query.status) } : {};
    const where = { organizationId: { in: ids }, ...status };
    const divisionFilter = query.divisionId ? { AND: [{ organizationId: query.divisionId }] } : {};
    const { take, after } = databasePage(query.page);
    if (kind === "programs") return checkRows(await client.program.findMany({ take, where: { ...where, ...after, ...divisionFilter, companyOrganizationId: c.company.id, name: { contains: search } }, orderBy: query.page ? { id: "asc" } : [{ name: "asc" }, { id: "asc" }] }));
    if (kind === "batches") return checkRows(await client.batch.findMany({ take, where: { ...status, ...after, name: { contains: search }, program: { ...where, ...divisionFilter, status: undefined, companyOrganizationId: c.company.id } }, include: { program: { select: { name: true, organizationId: true } } }, orderBy: query.page ? { id: "asc" } : [{ startDate: "asc" }, { id: "asc" }] })).map(({ program, ...b }) => ({ ...b, organizationId: program.organizationId, programName: c.ctx.organizationIds("program.read").includes(program.organizationId) ? program.name : null }));
    if (kind === "locations") return boundedRead(take => client.location.findMany({ take, where: { ...where, companyOrganizationId: c.company.id, name: { contains: search } }, orderBy: { name: "asc" } }));
    if (kind === "participants") {
      const rows = await boundedRead(take => client.batchParticipant.findMany({ take, where: { ...status, batch: { program: { ...where, status: undefined, companyOrganizationId: c.company.id } }, person: { displayName: { contains: search } } }, include: { batch: { include: { program: true } }, person: { select: { displayName: true } } } }));
      return rows.filter(r => c.ctx.organizationIds("person.read").includes(r.batch.program.organizationId)).map(r => ({ id: r.id, batchId: r.batchId, batchName: r.batch.name, personId: r.personId, name: r.person.displayName, status: r.status, organizationId: r.batch.program.organizationId }));
    }
    if (["divisions", "departments", "teams"].includes(kind)) return boundedRead(take => client.organization.findMany({ take, where: { id: { in: ids }, ...lifecycleFilter, name: { contains: search }, type: kind === "divisions" ? { in: ["DIVISION", "BUSINESS_UNIT"] } : kind === "departments" ? "DEPARTMENT" : "TEAM" }, orderBy: { name: "asc" } }));
    if (kind === "products") return boundedRead(take => client.product.findMany({ take, where: { organizationId: { in: ids }, ...lifecycleFilter, name: { contains: search }, ...(query.divisionId ? { divisionId: query.divisionId } : {}) }, orderBy: { name: "asc" } }));
    if (kind === "responsibilities") {
      const rows = await boundedRead(take => client.responsibility.findMany({ take, where: { organizationId: { in: ids }, ...lifecycleFilter, title: { contains: search } }, include: { person: { select: { displayName: true } }, team: { select: { name: true } } } }));
      const visible = [];
      for (const r of rows) {
        const projectId = r.projectId ?? (r.goalId ? (await client.goal.findUnique({ where: { id: r.goalId } }))?.projectId : r.taskId ? (await client.task.findUnique({ where: { id: r.taskId } }))?.projectId : r.milestoneId ? (await client.milestone.findUnique({ where: { id: r.milestoneId } }))?.projectId : null);
        if ((await c.ctx.decide(key, { organizationId: r.organizationId, projectId })).allowed) visible.push({ ...r, name: r.person.displayName, teamName: r.team?.name });
      }
      return visible;
    }
    if (kind === "employers") {
      if (!c.ctx.organizationIds("company.read").includes(c.company.id)) return [];
      return (await business.list(userId, "relationships")).filter(r => "fromCompanyId" in r && r.fromCompanyId === c.company.company!.id && r.relationship === "EMPLOYER");
    }
    if (kind !== "people") {
      const rows = kind === "projects" || kind === "goals" ? await execution.list(userId, kind, query) : await ops.list(userId, kind as "approvals", query);
      return rows.filter(r => "organizationId" in r && typeof r.organizationId === "string" && c.ids.includes(r.organizationId));
    }
    const result: Record<string, unknown>[] = [];
    for (const organizationId of ids) {
      const rows = await workforce.list(userId, "people", { ...query, organizationId });
      result.push(...rows.filter(r => {
        const organizationId = "organizationId" in r ? r.organizationId : undefined;
        return typeof organizationId === "string" ? ids.includes(organizationId) : true;
      }));
    }
    return [...new Map(result.map(r => [String(r.id), r])).values()];
  }
  async function workspace(userId: string) {
    return client.$transaction(async db => {
      const c = await context(db, userId);
      const organizations = await boundedRead(take => db.organization.findMany({ take, where: { id: { in: c.ids.filter(id => c.ctx.organizationIds("organization.read").includes(id)) } }, select: { id: true, name: true, parentId: true, type: true } }));
      const programs = await boundedRead(take => db.program.findMany({ take, where: { companyOrganizationId: c.company.id, organizationId: { in: c.ctx.organizationIds("program.read") } }, select: { id: true, name: true, organizationId: true, status: true } }));
      const batches = await boundedRead(take => db.batch.findMany({ take, where: { program: { companyOrganizationId: c.company.id, organizationId: { in: c.ctx.organizationIds("batch.read") } } }, select: { id: true, name: true, programId: true, status: true } }));
      const locations = await boundedRead(take => db.location.findMany({ take, where: { companyOrganizationId: c.company.id, organizationId: { in: c.ctx.organizationIds("location.read") } }, select: { id: true, name: true, organizationId: true, status: true } }));
      const people = c.ids.some(id => c.ctx.organizationIds("person.read").includes(id)) ? await boundedRead(take => db.person.findMany({ take, where: { status: "ACTIVE", memberships: { some: { ...activeMembershipWhere(), projectId: null, OR: [{ organizationId: { in: c.ids.filter(id => c.ctx.organizationIds("person.read").includes(id)) } }, { organizationId: { in: ancestry(c.ctx.nodes, c.company.id).map(n => n.id) }, scope: "DESCENDANTS" }] } } }, select: { id: true, displayName: true } })) : [];
      const products = await boundedRead(take => db.product.findMany({ take, where: { organizationId: c.company.id, ...(c.ctx.organizationIds("product.read").includes(c.company.id) ? {} : { id: "" }) }, select: { id: true, name: true, divisionId: true } }));
      const brands = await boundedRead(take => db.brand.findMany({ take, where: { organizationId: c.company.id, ...(c.ctx.organizationIds("brand.read").includes(c.company.id) ? {} : { id: "" }) }, select: { id: true, name: true } }));
      const workflows = await boundedRead(take => db.workflowDefinition.findMany({ take, where: { organizationId: { in: c.ids.filter(id => c.ctx.organizationIds("workflow.read").includes(id)) }, projectId: null, status: "ACTIVE" }, select: { id: true, name: true, organizationId: true } }));
      const projects = await boundedRead(take => db.project.findMany({ take, where: { organizationId: { in: c.ids }, OR: [{ organizationId: { in: c.ctx.organizationIds("project.read") } }, { id: { in: c.ctx.grants.filter(g => g.key === "project.read" && g.projectId).map(g => g.projectId!) } }] }, select: { id: true, name: true, organizationId: true } }));
      const goals = await boundedRead(take => db.goal.findMany({ take, where: { organizationId: { in: c.ids.filter(id => c.ctx.organizationIds("goal.read").includes(id)) } }, select: { id: true, title: true, organizationId: true } }));
      const capabilities = Object.fromEntries(["organization.manage", "program.manage", "batch.manage", "location.manage", "product.manage", "project.manage", "goal.manage", "responsibility.manage", "workflow.manage"].map(key => [key, c.ids.filter(id => c.ctx.organizationIds(key).includes(id))]));
      const navigation = input.companyKinds.filter(kind => c.ids.some(id => c.ctx.organizationIds(companyReadKeys[kind]).includes(id)) || c.ctx.grants.some(g => g.key === companyReadKeys[kind] && g.projectId && c.ids.includes(g.organizationId!)));
      return { company: { id: c.company.id, name: c.company.company!.displayName, legalName: c.company.company!.legalName, status: c.company.status, description: c.company.company!.description ?? c.company.description }, organizations, programs, batches, locations, people, products, brands, workflows, projects, goals, capabilities, navigation };
    });
  }
  async function overview(userId: string) {
    const ws = await workspace(userId);
    const programs = await list(userId, "programs"), batches = await list(userId, "batches"), projects = await list(userId, "projects"), goals = await list(userId, "goals"), approvals = await list(userId, "approvals"), responsibilities = await list(userId, "responsibilities");
    const now = new Date();
    return { workspace: ws, activePrograms: programs.filter(p => p.status === "ACTIVE"), upcoming: batches.filter(b => ["PLANNED", "OPEN"].includes(String(b.status)) && b.startDate instanceof Date && b.startDate >= now), activeProjects: projects.filter(p => p.status === "ACTIVE"), blocked: projects.filter(p => p.status === "BLOCKED"), atRisk: goals.filter(g => g.status === "AT_RISK" || g.status === "MISSED"), pending: approvals.filter(a => a.status === "PENDING" && a.actionable), responsibilities: responsibilities.filter(r => r.status === "ACTIVE") };
  }
  async function listPage(userId: string, kind: input.CompanyKind, query: Parameters<typeof list>[2] = {}, page: PageInput = {}) {
    const databasePaged = ["programs", "batches"].includes(kind);
    const rows = await list(userId, kind, { ...query, page: databasePaged ? page : undefined });
    return resultPage(checkRows(rows) as (Record<string, unknown> & { id: string })[], page, databasePaged);
  }
  return { enter, save, saveShared, startWorkflow, list, listPage, workspace, overview };
}
export const airaService = createAiraService();
