import { READ_BUDGET, boundedRead, groupRows } from "./query-bounds";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { createAccessContext as defaultAccessContext, AccessError, type ResourceScope } from "@/server/authorization/engine";
import { activeMembershipWhere, ancestry } from "@/server/authorization/business-scope";
import { setHumanMembershipRole, validateMembershipAuthority } from "@/server/authorization/assignments";
import { hashPassword } from "@/server/auth/password";
import { canNestOrganization } from "./organization";
import { organizationInput } from "./business-input";
import * as input from "./workforce-input";
import { operationalEvent } from "./operational-events";
import { protectCanonicalDivision } from "./company-structure";

type DB = Prisma.TransactionClient;
type Context = Awaited<ReturnType<typeof defaultAccessContext>>;
const readKeys: Record<input.WorkforceKind, string> = { people: "person.read", users: "user.read", roles: "role.read", permissions: "permission.read", memberships: "membership.read", access: "membership.read", reporting: "reporting.read", responsibilities: "responsibility.read", departments: "organization.read", teams: "organization.read", organizations: "organization.read", sia: "sia.access.read" };
export function createWorkforceService(client: PrismaClient = prisma, createAccessContext = defaultAccessContext) {
  async function context(db: DB, userId: string) {
    const ctx = await createAccessContext(userId, db);
    if (!ctx.active) throw new AccessError("Access denied");
    return ctx;
  }
  async function audit(db: DB, ctx: Context, scope: ResourceScope, action: string, type: string, id: string, metadata?: Prisma.InputJsonValue) {
    await operationalEvent(db, { actorUserId: ctx.user!.id, actorPersonId: ctx.user!.personId, organizationId: scope.organizationId, projectId: scope.projectId, action, entityType: type, entityId: id, result: "SUCCESS", metadata: { projectId: scope.projectId ?? null, ...(metadata as Record<string, Prisma.InputJsonValue> ?? {}) } });
  }
  async function scopedPerson(db: DB, ctx: Context, personId: string, key = "person.read") {
    const person = await db.person.findFirst({ where: { id: personId, memberships: { some: visibleMemberships(ctx, key) } } });
    if (!person) throw new AccessError("Access denied");
    return person;
  }
  function visibleMemberships(ctx: Context, key: string): Prisma.MembershipWhereInput {
    const activeIds = ctx.nodes.filter(n => ancestry(ctx.nodes, n.id).every(a => a.status === "ACTIVE")).map(n => n.id);
    return { OR: [{ organizationId: { in: ctx.organizationIds(key) } }, { organizationId: { in: activeIds }, projectId: { in: ctx.grants.filter(g => g.key === key && g.projectId).map(g => g.projectId!) } }] };
  }
  async function fullPersonAuthority(db: DB, ctx: Context, personId: string, key: string) {
    const memberships = await boundedRead(take => db.membership.findMany({ take, where: { personId } }));
    if (!memberships.length) ctx.requireGlobal(key);
    for (const membership of memberships) {
      await ctx.requireAccess(key, membership);
      await validateMembershipAuthority(db, ctx, membership.id, membership);
    }
  }
  async function belongs(db: DB, ctx: Context, personId: string, scope: ResourceScope) {
    const path = ancestry(ctx.nodes, scope.organizationId).map(n => n.id);
    const membership = await db.membership.findFirst({ where: { ...activeMembershipWhere(), personId, OR: [
      { projectId: null, organizationId: scope.organizationId },
      { projectId: null, organizationId: { in: path }, scope: "DESCENDANTS" },
      ...(scope.projectId ? [{ projectId: scope.projectId, organizationId: scope.organizationId }] : [])
    ] } });
    if (!membership) throw new AccessError("Person must have an active membership in this scope");
  }
  async function list(userId: string, kind: input.WorkforceKind, query: { organizationId?: string; search?: string; status?: string; projectId?: string } = {}) {
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      const key = readKeys[kind];
      if (query.projectId) {
        const project = await db.project.findUniqueOrThrow({ where: { id: query.projectId } });
        await ctx.requireAccess(key, { organizationId: project.organizationId, projectId: project.id });
      }
      if (query.organizationId) await ctx.requireAccess(key, { organizationId: query.organizationId, projectId: query.projectId });
      const ids = ctx.organizationIds(key).filter(id => !query.organizationId || ancestry(ctx.nodes, id).some(n => n.id === query.organizationId));
      const selectedIds = query.organizationId ? ctx.nodes.filter(n => ancestry(ctx.nodes, n.id).some(a => a.id === query.organizationId)).map(n => n.id) : undefined;
      const search = query.search?.trim().slice(0, 200) ?? "";
      const scope = { organizationId: { in: ids } };
      const lifecycle = input.lifecycle.safeParse(query.status);
      const status = lifecycle.success ? { status: lifecycle.data } : {};
      switch (kind) {
        case "people": return boundedRead(take => db.person.findMany({ take, where: { ...status, displayName: { contains: search }, memberships: { some: { ...visibleMemberships(ctx, key), ...(selectedIds ? { organizationId: { in: selectedIds } } : {}) } } }, select: { id: true, displayName: true, legalName: true, email: true, phone: true, profile: true, status: true, metadata: true, memberships: { take: READ_BUDGET + 1, where: { ...visibleMemberships(ctx, key), ...(selectedIds ? { organizationId: { in: selectedIds } } : {}) }, select: { organizationId: true } } }, orderBy: { displayName: "asc" } }));
        case "users": return boundedRead(take => db.user.findMany({ take, where: { ...status, email: { contains: search }, person: { memberships: { some: { ...visibleMemberships(ctx, key), ...(selectedIds ? { organizationId: { in: selectedIds } } : {}) } } } }, select: { id: true, email: true, personId: true, status: true, person: { select: { displayName: true, memberships: { take: READ_BUDGET + 1, where: { ...visibleMemberships(ctx, key), ...(selectedIds ? { organizationId: { in: selectedIds } } : {}) }, select: { organizationId: true } } } }, createdAt: true }, orderBy: { email: "asc" } }));
        case "roles": {
          const roles = await boundedRead(take => db.role.findMany({ take, where: { ...scope, ...status, name: { contains: search } }, orderBy: { name: "asc" } }));
          const permissions = groupRows(await boundedRead(take => db.rolePermission.findMany({ take, where: { roleId: { in: roles.map(r => r.id) } }, include: { permission: { select: { id: true, key: true, name: true, scope: true } } }, orderBy: { id: "asc" } })), p => p.roleId);
          return roles.map(r => ({ ...r, permissions: permissions.get(r.id) ?? [] }));
        }
        case "permissions": {
          if (!ids.length) return [];
          return boundedRead(take => db.permission.findMany({ take, where: { OR: [{ name: { contains: search } }, { key: { contains: search } }] }, orderBy: { key: "asc" } }));
        }
        case "memberships": case "access": {
          const membershipStatus = query.status && ["ACTIVE", "INACTIVE", "INVITED", "SUSPENDED", "ENDED"].includes(query.status) ? { status: query.status as "ACTIVE" } : {};
          const projectIds = ctx.grants.filter(g => g.key === key && g.projectId).map(g => g.projectId!);
          const memberships = await boundedRead(take => db.membership.findMany({ take, where: { ...membershipStatus, AND: [{ OR: [scope, { projectId: { in: projectIds }, organizationId: { in: ctx.nodes.filter(n => ancestry(ctx.nodes, n.id).every(a => a.status === "ACTIVE")).map(n => n.id) } }] }, ...(selectedIds ? [{ organizationId: { in: selectedIds } }] : []), ...(query.projectId ? [{ projectId: query.projectId }] : [])], person: { displayName: { contains: search } } }, include: { person: { select: { displayName: true } }, project: { select: { name: true } } } }));
          const roles = groupRows(await boundedRead(take => db.membershipRole.findMany({ take, where: { membershipId: { in: memberships.map(m => m.id) } }, include: { role: { select: { id: true, name: true, principalType: true } } }, orderBy: { id: "asc" } })), a => a.membershipId);
          return memberships.map(m => ({ ...m, roles: roles.get(m.id) ?? [] }));
        }
        case "organizations": case "departments": case "teams": return boundedRead(take => db.organization.findMany({ take, where: { id: { in: ids }, ...status, name: { contains: search }, ...(kind === "departments" ? { type: "DEPARTMENT" } : kind === "teams" ? { type: "TEAM" } : {}) }, orderBy: { name: "asc" } }));
        case "reporting": return boundedRead(take => db.reportingRelationship.findMany({ take, where: { ...scope, ...status, person: { displayName: { contains: search } } }, include: { person: { select: { displayName: true } }, manager: { select: { displayName: true } } } }));
        case "responsibilities": {
          const projectIds = ctx.grants.filter(g => g.key === key && g.projectId).map(g => g.projectId!);
          const within = (ids: string[]): Prisma.ResponsibilityWhereInput => ({ OR: [{ projectId: { in: ids } }, { task: { projectId: { in: ids } } }, { milestone: { projectId: { in: ids } } }, { goal: { projectId: { in: ids } } }] });
          const rows = await boundedRead(take => db.responsibility.findMany({ take, where: { ...status, AND: [{ OR: [scope, within(projectIds)] }, ...(selectedIds ? [{ organizationId: { in: selectedIds } }] : []), ...(query.projectId ? [within([query.projectId])] : [])], title: { contains: search } }, include: { person: { select: { displayName: true } }, project: { select: { name: true } }, product: { select: { name: true } }, goal: { select: { title: true, projectId: true } }, task: { select: { title: true, projectId: true } }, milestone: { select: { name: true, projectId: true } } } }));
          return Promise.all(rows.map(async r => ({ ...r, task: r.task && (await ctx.decide("task.read", { organizationId: r.organizationId, projectId: r.task.projectId })).allowed ? r.task : null, scopeProjectId: r.projectId ?? r.task?.projectId ?? r.milestone?.projectId ?? r.goal?.projectId ?? null })));
        }
        case "sia": return ids.length ? boundedRead(take => db.siaIdentity.findMany({ take, where: { name: { contains: search } }, select: { id: true, name: true, title: true, status: true, roleAssignments: { take: READ_BUDGET + 1, where: scope, include: { role: { select: { name: true } } } } } })) : [];
      }
    });
  }
  async function save(userId: string, kind: input.WorkforceKind, raw: unknown, recordId?: string) {
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      let resource: { id: string };
      let scope: ResourceScope;
      let changes: Prisma.InputJsonObject = {};
      switch (kind) {
        case "people": {
          const { organizationId, ...data } = input.personInput.parse(raw); scope = { organizationId };
          changes = { status: data.status };
          await ctx.requireAccess(recordId ? "person.update" : "person.create", scope);
          if (data.status === "ARCHIVED") await ctx.requireAccess("person.archive", scope);
          if (recordId) {
            await scopedPerson(db, ctx, recordId, "person.update");
            await fullPersonAuthority(db, ctx, recordId, data.status === "ARCHIVED" ? "person.archive" : "person.update");
            resource = await db.person.update({ where: { id: recordId }, data });
            if (data.status !== "ACTIVE") await db.session.deleteMany({ where: { user: { personId: recordId } } });
          } else {
            await ctx.requireAccess("membership.manage", scope);
            resource = await db.person.create({ data: { ...data, memberships: { create: { organizationId } } } });
            const membership = await db.membership.findUniqueOrThrow({ where: { personId_organizationId_scopeKey: { personId: resource.id, organizationId, scopeKey: "organization" } } });
            await audit(db, ctx, scope, "membership.created", "Membership", membership.id);
          }
          break;
        }
        case "users": {
          const { organizationId, password, ...data } = input.userInput.parse(raw); scope = { organizationId };
          changes = { status: data.status, credentialChanged: !!password };
          await ctx.requireAccess(recordId ? "user.update" : "user.create", scope);
          await scopedPerson(db, ctx, data.personId, recordId ? "user.update" : "user.create");
          await fullPersonAuthority(db, ctx, data.personId, recordId ? "user.update" : "user.create");
          const passwordHash = password ? await hashPassword(password) : undefined;
          if (recordId) {
            const existing = await db.user.findUnique({ where: { id: recordId } });
            if (!existing || existing.personId !== data.personId) throw new AccessError("Account cannot be moved to another person");
            if (data.status === "ACTIVE" && !existing.passwordHash && !passwordHash) throw new AccessError("An active account requires a password");
            resource = await db.user.update({ where: { id: recordId }, data: { ...data, passwordHash } });
            if (data.status !== "ACTIVE" || passwordHash) await db.session.deleteMany({ where: { userId: recordId } });
          } else {
            if (!password && data.status === "ACTIVE") throw new AccessError("An active account requires an initial password");
            resource = await db.user.create({ data: { ...data, passwordHash } });
          }
          break;
        }
        case "memberships": {
          const data = input.membershipInput.parse(raw); scope = data;
          changes = { status: data.status, membershipScope: data.scope, projectId: data.projectId ?? null };
          await ctx.requireAccess("membership.manage", scope);
          if (data.projectId && ["ACTIVE", "INVITED"].includes(data.status)) {
            const p = await db.project.findUniqueOrThrow({ where: { id: data.projectId } });
            if (["COMPLETED", "CANCELLED", "ARCHIVED"].includes(p.status)) throw new AccessError("Closed project cannot accept active membership changes");
          }
          await scopedPerson(db, ctx, data.personId);
          const scopeKey = data.projectId ? "project:" + data.projectId : "organization";
          if (recordId) {
            const previous = await db.membership.findUnique({ where: { id: recordId } });
            if (!previous || previous.personId !== data.personId || previous.organizationId !== data.organizationId || previous.scopeKey !== scopeKey) throw new AccessError("Membership cannot be moved between people or scopes");
            if (previous.scope !== data.scope) await ctx.requireAccess("membership.scope.manage", scope);
            if (data.status === "ACTIVE") await validateMembershipAuthority(db, ctx, recordId, data);
            resource = await db.membership.update({ where: { id: recordId }, data });
          } else {
            if (data.scope === "DESCENDANTS") await ctx.requireAccess("membership.scope.manage", scope);
            resource = await db.membership.create({ data: { ...data, projectId: data.projectId ?? null, scopeKey } });
          }
          break;
        }
        case "roles": {
          const { copyRoleId, ...data } = input.roleInput.parse(raw); scope = { organizationId: data.organizationId };
          changes = { status: data.status, designationKey: data.key, principalType: data.principalType };
          await ctx.requireAccess(recordId ? "role.update" : "role.create", scope);
          if (recordId) {
            const previous = await db.role.findUnique({ where: { id: recordId }, include: { permissions: { take: READ_BUDGET + 1, include: { permission: true } } } });
            if (!previous || previous.organizationId !== data.organizationId) throw new AccessError("Role scope cannot be changed");
            if (previous.canonical && (previous.name !== data.name || previous.key !== data.key || previous.principalType !== data.principalType || data.status !== "ACTIVE")) throw new AccessError("Canonical AIRA designations are locked");
            if (previous.system && !previous.canonical) throw new AccessError("Foundation system role is protected");
            if (previous.principalType !== data.principalType) throw new AccessError("Role identity type cannot be changed");
            if (data.status === "ACTIVE") for (const { permission } of previous.permissions) await ctx.requireDelegation(permission, scope, true);
            resource = await db.role.update({ where: { id: recordId }, data });
          } else {
            let copy;
            if (copyRoleId) {
              copy = await db.role.findUnique({ where: { id: copyRoleId }, include: { permissions: { take: READ_BUDGET + 1, include: { permission: true } } } });
              if (!copy?.organizationId) throw new AccessError("Role template unavailable");
              await ctx.requireAccess("role.read", { organizationId: copy.organizationId });
              await ctx.requireAccess("permission.assign", scope);
              if (copy.principalType !== data.principalType || copy.canonical && copy.name !== data.name) throw new AccessError("Copied designation must preserve its identity");
              for (const { permission } of copy.permissions) await ctx.requireDelegation(permission, scope, true);
            }
            resource = await db.role.create({ data: { ...data, canonical: copy?.canonical ?? false, permissions: copy ? { create: copy.permissions.map(p => ({ permissionId: p.permissionId })) } : undefined } });
          }
          break;
        }
        case "permissions": {
          const { organizationId, ...data } = input.permissionInput.parse(raw); scope = { organizationId };
          ctx.requireGlobal("permission.create");
          await ctx.requireAccess("permission.read", scope);
          if (recordId) throw new AccessError("Capability definitions are immutable; register a new capability");
          resource = await db.permission.create({ data });
          break;
        }
        case "reporting": {
          const data = input.reportingInput.parse(raw); scope = data;
          await ctx.requireAccess("reporting.manage", scope);
          await scopedPerson(db, ctx, data.personId); await scopedPerson(db, ctx, data.managerPersonId);
          if (data.status === "ACTIVE") {
            await belongs(db, ctx, data.personId, scope); await belongs(db, ctx, data.managerPersonId, scope);
            const edges = await boundedRead(take => db.reportingRelationship.findMany({ take, where: { organizationId: data.organizationId, status: "ACTIVE", ...(recordId ? { id: { not: recordId } } : {}) }, select: { personId: true, managerPersonId: true } }));
            const queue = [data.managerPersonId]; const seen = new Set<string>();
            while (queue.length) {
              const node = queue.pop()!;
              if (node === data.personId) throw new AccessError("Reporting relationship would create a cycle");
              if (seen.has(node)) continue; seen.add(node);
              queue.push(...edges.filter(e => e.personId === node).map(e => e.managerPersonId));
            }
          }
          if (recordId) {
            const previous = await db.reportingRelationship.findUnique({ where: { id: recordId } });
            if (!previous || previous.organizationId !== data.organizationId) throw new AccessError("Reporting scope cannot be changed");
          }
          resource = recordId ? await db.reportingRelationship.update({ where: { id: recordId }, data }) : await db.reportingRelationship.create({ data });
          break;
        }
        case "responsibilities": {
          const parsed = input.responsibilityInput.parse(raw);
          const data = { ...parsed, projectId: parsed.projectId ?? null, productId: parsed.productId ?? null, goalId: parsed.goalId ?? null, taskId: parsed.taskId ?? null, milestoneId: parsed.milestoneId ?? null, programId: parsed.programId ?? null, batchId: parsed.batchId ?? null, locationId: parsed.locationId ?? null };
          let targetProjectId = data.projectId;
          if (data.taskId) {
            const task = await db.task.findUniqueOrThrow({ where: { id: data.taskId } });
            if (task.organizationId !== data.organizationId) throw new AccessError("Responsibility target belongs to another scope");
            targetProjectId = task.projectId;
            await ctx.requireAccess("task.read", task);
          }
          if (data.milestoneId) {
            const milestone = await db.milestone.findUniqueOrThrow({ where: { id: data.milestoneId }, include: { project: true } });
            if (milestone.project.organizationId !== data.organizationId) throw new AccessError("Responsibility target belongs to another scope");
            targetProjectId = milestone.projectId;
            await ctx.requireAccess("milestone.read", { organizationId: data.organizationId, projectId: targetProjectId });
          }
          if (data.goalId) targetProjectId = (await db.goal.findUniqueOrThrow({ where: { id: data.goalId } })).projectId;
          scope = { organizationId: data.organizationId, projectId: targetProjectId }; await ctx.requireAccess("responsibility.manage", scope);
          for (const [type, id] of [["program", data.programId], ["batch", data.batchId], ["location", data.locationId]] as const) if (id) {
            const target = type === "program" ? await db.program.findUnique({ where: { id } }) : type === "location" ? await db.location.findUnique({ where: { id } }) : await db.batch.findUnique({ where: { id }, include: { program: true } });
            const organizationId = target && ("organizationId" in target ? target.organizationId : target.program.organizationId);
            if (!target || organizationId !== data.organizationId) throw new AccessError("Responsibility target belongs to another scope");
            await ctx.requireAccess(type + ".read", { organizationId });
            if (data.status === "ACTIVE" && ["RETIRED", "COMPLETED", "CANCELLED", "ARCHIVED"].includes(target.status)) throw new AccessError("Closed target cannot accept active responsibility changes");
          }
          if (data.teamId) {
            const team = await db.organization.findUnique({ where: { id: data.teamId } });
            if (!team || team.type !== "TEAM" || team.status !== "ACTIVE" || !ancestry(ctx.nodes, team.id).some(n => n.id === data.organizationId)) throw new AccessError("Responsible team must belong to the target branch");
            await ctx.requireAccess("organization.read", { organizationId: team.id });
          }
          if (targetProjectId && data.status === "ACTIVE" && ["COMPLETED", "CANCELLED", "ARCHIVED"].includes((await db.project.findUniqueOrThrow({ where: { id: targetProjectId } })).status)) throw new AccessError("Closed project cannot accept active responsibilities");
          await scopedPerson(db, ctx, data.personId);
          if (data.status === "ACTIVE") await belongs(db, ctx, data.personId, scope);
          for (const [type, id] of [["project", data.projectId], ["product", data.productId], ["goal", data.goalId]] as const) if (id) {
            const target = type === "project" ? await db.project.findUnique({ where: { id } }) : type === "product" ? await db.product.findUnique({ where: { id } }) : await db.goal.findUnique({ where: { id } });
            if (!target || target.organizationId !== data.organizationId) throw new AccessError("Responsibility target belongs to another scope");
            await ctx.requireAccess(type + ".read", { organizationId: data.organizationId, projectId: type === "project" ? id : targetProjectId });
          }
          if (recordId) {
            const previous = await db.responsibility.findUnique({ where: { id: recordId } });
            if (!previous) throw new AccessError("Access denied");
            if (["projectId", "productId", "goalId", "taskId", "milestoneId", "programId", "batchId", "locationId"].some(key => previous[key as keyof typeof previous] !== data[key as keyof typeof data])) throw new AccessError("Responsibility target cannot be changed");
            await ctx.requireAccess("responsibility.manage", previous);
            if (previous.organizationId !== data.organizationId) throw new AccessError("Responsibility scope cannot be changed");
          }
          resource = recordId ? await db.responsibility.update({ where: { id: recordId }, data }) : await db.responsibility.create({ data });
          break;
        }
        case "organizations": case "departments": case "teams": {
          const data = organizationInput.parse(raw); scope = { organizationId: data.parentId };
          await ctx.requireAccess("organization.manage", { organizationId: recordId ?? data.parentId });
          const parent = await db.organization.findUnique({ where: { id: data.parentId } });
          if (!parent || !canNestOrganization(parent.type, data.type) || kind === "departments" && data.type !== "DEPARTMENT" || kind === "teams" && data.type !== "TEAM") throw new AccessError("Invalid organization structure");
          if (recordId) {
            await ctx.requireAccess("organization.manage", { organizationId: recordId });
            const previous = await db.organization.findUnique({ where: { id: recordId } });
            if (!previous || previous.parentId !== data.parentId || previous.type !== data.type) throw new AccessError("Organization scope and type cannot be changed");
            protectCanonicalDivision(previous, data);
            resource = await db.organization.update({ where: { id: recordId }, data });
          } else resource = await db.organization.create({ data: { ...data, department: data.type === "DEPARTMENT" ? { create: {} } : undefined, team: data.type === "TEAM" ? { create: {} } : undefined } });
          scope = { organizationId: resource.id }; break;
        }
        default: throw new AccessError("Use the explicit access assignment operation");
      }
      await audit(db, ctx, scope, kind + (recordId ? ".updated" : ".created"), kind, resource.id, changes);
      return resource;
    });
  }
  async function setPermission(userId: string, roleId: string, permissionId: string, enabled: boolean) {
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      const role = await db.role.findUnique({ where: { id: roleId } });
      const permission = await db.permission.findUnique({ where: { id: permissionId } });
      if (!role?.organizationId || !permission) throw new AccessError("Access denied");
      const scope = { organizationId: role.organizationId };
      await ctx.requireAccess("permission.assign", scope);
      if (enabled) {
        await ctx.requireDelegation(permission, scope, true);
        if (role.principalType === "AGENT" && permission.scope === "GLOBAL") throw new AccessError("SIA roles cannot receive global capabilities");
      }
      if (enabled) await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId, permissionId } }, create: { roleId, permissionId }, update: {} });
      else await db.rolePermission.deleteMany({ where: { roleId, permissionId } });
      await audit(db, ctx, scope, enabled ? "permission.assigned" : "permission.revoked", "Role", role.id, { permissionId });
    });
  }
  async function setRole(userId: string, membershipId: string, roleId: string, enabled: boolean) {
    return client.$transaction(async db => setHumanMembershipRole(db, await context(db, userId), membershipId, roleId, enabled));
  }
  async function switchOrganization(userId: string, organizationId: string) {
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      await ctx.requireAccess("organization.read", { organizationId });
      return db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { id: true, name: true, type: true } });
    });
  }
  async function explain(userId: string, targetUserId: string, permission: string, scope: ResourceScope) {
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      await ctx.requireAccess("access.explain", scope);
      const target = await db.user.findUnique({ where: { id: targetUserId }, select: { personId: true } });
      if (!target?.personId) throw new AccessError("Access denied");
      await scopedPerson(db, ctx, target.personId, "user.read");
      const decision = await (await createAccessContext(targetUserId, db)).decide(permission, scope);
      if (decision.via?.organizationId && !(await ctx.decide("role.read", { organizationId: decision.via.organizationId })).allowed) delete decision.via;
      return decision;
    });
  }
  async function setSiaRole(userId: string, siaId: string, organizationId: string, roleId: string, enabled: boolean, includeDescendants = false) {
    if (typeof includeDescendants !== "boolean") throw new AccessError("Invalid SIA descendant coverage");
    return client.$transaction(async db => {
      const ctx = await context(db, userId); const scope = { organizationId };
      await ctx.requireAccess("sia.access.manage", scope);
      const sia = await db.siaIdentity.findUnique({ where: { id: siaId } });
      const role = await db.role.findUnique({ where: { id: roleId }, include: { permissions: { take: READ_BUDGET + 1, include: { permission: true } } } });
      if (!sia || !role || role.organizationId !== organizationId || role.principalType !== "AGENT" || enabled && role.status !== "ACTIVE") throw new AccessError("SIA requires an active agent role in this scope");
      if (enabled) for (const { permission } of role.permissions) {
        if (permission.scope === "GLOBAL") throw new AccessError("SIA access must be organizationally scoped");
        await ctx.requireDelegation(permission, scope, includeDescendants);
      }
      if (enabled) await db.siaRoleAssignment.upsert({ where: { siaId_organizationId_roleId: { siaId, organizationId, roleId } }, create: { siaId, organizationId, roleId, includeDescendants }, update: { includeDescendants } });
      else await db.siaRoleAssignment.deleteMany({ where: { siaId, organizationId, roleId } });
      await audit(db, ctx, scope, enabled ? "sia.role_assigned" : "sia.role_revoked", "SiaIdentity", siaId, { roleId, includeDescendants });
    });
  }
  async function workspace(userId: string) {
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      const ids = ctx.organizationIds("organization.read");
      const organizations = await boundedRead(take => db.organization.findMany({ take, where: { id: { in: ids } }, select: { id: true, name: true, type: true, parentId: true } }));
      const people = await boundedRead(take => db.person.findMany({ take, where: { memberships: { some: visibleMemberships(ctx, "person.read") } }, select: { id: true, displayName: true } }));
      const roles = await boundedRead(take => db.role.findMany({ take, where: { organizationId: { in: ctx.organizationIds("role.read") } }, select: { id: true, name: true, organizationId: true, principalType: true } }));
      const projects = await boundedRead(take => db.project.findMany({ take, where: { OR: [{ organizationId: { in: ctx.organizationIds("project.read") } }, { id: { in: ctx.grants.filter(g => g.key === "project.read" && g.projectId).map(g => g.projectId!) }, organizationId: { in: ctx.nodes.filter(n => ancestry(ctx.nodes, n.id).every(a => a.status === "ACTIVE")).map(n => n.id) } }] }, select: { id: true, name: true, organizationId: true } }));
      const products = await boundedRead(take => db.product.findMany({ take, where: { organizationId: { in: ctx.organizationIds("product.read") } }, select: { id: true, name: true, organizationId: true } }));
      const goals = await boundedRead(take => db.goal.findMany({ take, where: { organizationId: { in: ctx.organizationIds("goal.read") } }, select: { id: true, title: true, organizationId: true } }));
      const permissions = ctx.organizationIds("permission.read").length ? await boundedRead(take => db.permission.findMany({ take, select: { id: true, name: true, key: true }, orderBy: { key: "asc" } })) : [];
      const scopes = Object.fromEntries(["person.create", "person.update", "user.create", "user.update", "role.create", "role.update", "permission.assign", "membership.manage", "membership.assign_role", "organization.manage", "reporting.manage", "responsibility.manage", "sia.access.manage", "access.explain"].map(k => [k, ctx.organizationIds(k)]));
      const canCreatePermission = ctx.grants.some(g => g.key === "permission.create" && g.scope === "GLOBAL" && !g.projectId);
      return { organizations, people, roles, projects, products, goals, permissions, scopes, canCreatePermission };
    });
  }
  return { list, save, setRole, setPermission, switchOrganization, explain, setSiaRole, workspace };
}
export const workforceService = createWorkforceService();
