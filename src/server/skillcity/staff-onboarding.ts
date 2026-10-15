import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { setHumanMembershipRole } from "@/server/authorization/assignments";
import { operationalEvent } from "@/server/domain/operational-events";
import { createBossService } from "@/server/group/boss-service";
import { hasStaffWorkspaceCapabilities, isPreparedStaffRole, staffRoleScopes } from "./staff-roles";

const draftInput = z.object({
  organizationId: z.string().min(1).max(200),
  displayName: z.string().trim().min(2).max(200),
  email: z.email().max(254).transform(value => value.toLowerCase()),
  roleId: z.string().min(1).max(200),
  managerUserId: z.string().min(1).max(200).optional()
}).strict();

export function createStaffOnboardingService(client: PrismaClient = prisma) {
  const boss = createBossService(client);
  async function options(actorUserId: string, organizationId: string) {
    const scope = await client.organization.findUnique({ where: { id: organizationId }, select: { slug: true, parent: { select: { slug: true } } } });
    if (!scope || !(scope.slug === "aira-skill-city" || scope.parent?.slug === "aira-skill-city") || !Object.values(staffRoleScopes).includes(scope.slug)) return { canPrepare: false, roles: [], managers: [] };
    const ctx = await createAccessContext(actorUserId, client, undefined, { organizationId });
    const canPrepare = ["person.create", "user.create", "membership.manage", "membership.assign_role"].every(key => ctx.organizationIds(key).includes(organizationId));
    if (!canPrepare) return { canPrepare: false, roles: [], managers: [] };
    const [roles, managers] = await Promise.all([
      client.role.findMany({ where: { organizationId, status: "ACTIVE", principalType: "HUMAN", key: { in: Object.keys(staffRoleScopes) } }, select: { id: true, name: true, key: true, permissions: { select: { permission: { select: { key: true } } } } }, orderBy: { name: "asc" }, take: 100 }),
      client.user.findMany({ where: { status: "ACTIVE", emailVerifiedAt: { not: null }, person: { memberships: { some: { organizationId, status: "ACTIVE" } } } }, select: { id: true, email: true }, orderBy: { email: "asc" }, take: 100 })
    ]);
    const isBoss = await boss.authority(actorUserId).then(() => true).catch(error => { if (error instanceof AccessError) return false; throw error; });
    return { canPrepare, roles: roles.filter(role => isPreparedStaffRole(role.key, scope.slug) && hasStaffWorkspaceCapabilities(role.key, role.permissions.map(item => item.permission.key)) && (!["Director", "Division Director"].includes(role.name) || isBoss)).map(({ id, name }) => ({ id, name })), managers };
  }
  async function prepare(actorUserId: string, raw: unknown) {
    const input = draftInput.parse(raw);
    return client.$transaction(async db => {
      const company = await db.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true, status: true } });
      const scope = await db.organization.findUnique({ where: { id: input.organizationId }, select: { id: true, slug: true, parentId: true, type: true, status: true } });
      if (!company || company.status !== "ACTIVE" || !scope || scope.status !== "ACTIVE" || !(scope.id === company.id && scope.type === "COMPANY" || scope.parentId === company.id && scope.type === "DIVISION")) throw new AccessError("Staff scope unavailable");
      const ctx = await createAccessContext(actorUserId, db, undefined, { organizationId: scope.id });
      for (const permission of ["person.create", "user.create", "membership.manage", "membership.assign_role"]) await ctx.requireAccess(permission, { organizationId: scope.id });
      const role = await db.role.findUnique({ where: { id: input.roleId }, select: { id: true, key: true, name: true, organizationId: true, principalType: true, status: true, permissions: { select: { permission: { select: { key: true } } } } } });
      if (!role || !isPreparedStaffRole(role.key, scope.slug) || !hasStaffWorkspaceCapabilities(role.key, role.permissions.map(item => item.permission.key)) || role.organizationId !== scope.id || role.principalType !== "HUMAN" || role.status !== "ACTIVE") throw new AccessError("Role unavailable in this scope");
      if (role.name === "Director" || role.name === "Division Director") {
        if (role.name === "Director" && scope.id !== company.id || role.name === "Division Director" && scope.type !== "DIVISION") throw new AccessError("Director appointment requires its prepared scope");
        await boss.authority(actorUserId, db);
      }
      const descendantScope = scope.id === company.id && ["Director", "Senior Academic Advisor"].includes(role.name);
      if (descendantScope) await ctx.requireAccess("membership.scope.manage", { organizationId: scope.id });
      if (["Software Developer", "Full Stack Developer", "Junior Developer"].includes(role.name) && (await db.organization.findUnique({ where: { slug: "aira-labs" }, select: { id: true } }))?.id !== scope.id) throw new AccessError("Developer assignment requires Labs scope");
      if (input.managerUserId) {
        const manager = await db.user.findUnique({ where: { id: input.managerUserId }, select: { personId: true, status: true, emailVerifiedAt: true } });
        if (!manager?.personId || manager.status !== "ACTIVE" || !manager.emailVerifiedAt || !(await db.membership.findFirst({ where: { personId: manager.personId, status: "ACTIVE", OR: [{ organizationId: scope.id }, { organizationId: company.id, scope: "DESCENDANTS" }] } }))) throw new AccessError("Verified manager appointment required");
      }
      if (await db.user.findUnique({ where: { email: input.email } })) throw new AccessError("An account already uses this email; review it instead of duplicating it");
      const person = await db.person.create({ data: { displayName: input.displayName, email: input.email, metadata: JSON.stringify({ authenticationRealm: "skillcity", staffOnboarding: "DRAFT", identityVerification: "PENDING" }) } });
      const user = await db.user.create({ data: { email: input.email, personId: person.id, status: "INACTIVE" } });
      const membership = await db.membership.create({ data: { personId: person.id, organizationId: scope.id, scope: descendantScope ? "DESCENDANTS" : "ORGANIZATION", status: "INVITED", title: role.name } });
      await setHumanMembershipRole(db, ctx, membership.id, role.id, true);
      if (input.managerUserId) {
        const manager = await db.user.findUniqueOrThrow({ where: { id: input.managerUserId }, select: { personId: true } });
        await db.reportingRelationship.create({ data: { organizationId: scope.id, personId: person.id, managerPersonId: manager.personId!, status: "ACTIVE" } });
      }
      await operationalEvent(db, { actorUserId, actorPersonId: ctx.user!.personId, organizationId: scope.id, action: "staff.onboarding_draft_created", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { roleId: role.id, managerUserId: input.managerUserId ?? null, activation: "BLOCKED_UNTIL_VERIFIED" } });
      return { id: user.id, status: "DRAFT" as const };
    });
  }
  return { prepare, options };
}

export const staffOnboardingService = createStaffOnboardingService();
