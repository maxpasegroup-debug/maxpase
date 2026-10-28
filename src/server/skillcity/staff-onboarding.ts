import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { setHumanMembershipRole } from "@/server/authorization/assignments";
import { operationalEvent } from "@/server/domain/operational-events";
import { createBossService } from "@/server/group/boss-service";
import { hasStaffWorkspaceCapabilities, isPreparedStaffRole, staffPortalForRole, staffRoleScopes } from "./staff-roles";

const draftInput = z.object({
  organizationId: z.string().min(1).max(200),
  displayName: z.string().trim().min(2).max(200).optional(),
  email: z.email().max(254).transform(value => value.toLowerCase()).optional(),
  existingPersonId: z.string().min(1).max(200).optional(),
  roleId: z.string().min(1).max(200),
  managerUserId: z.string().min(1).max(200).optional(),
  scopeDecisionReference: z.string().trim().min(8).max(200),
  managerDecisionReference: z.string().trim().min(8).max(200).optional()
}).strict().refine(value => value.existingPersonId ? !value.displayName && !value.email : !!value.displayName && !!value.email, "Choose an existing person or provide a new name and email").refine(value => !value.managerUserId || !!value.managerDecisionReference, "Record the manager decision reference");
const reviewInput = z.object({ userId: z.string().min(1).max(200), scopeDecisionReference: z.string().trim().min(8).max(200), managerUserId: z.string().min(1).max(200).optional(), managerDecisionReference: z.string().trim().min(8).max(200).optional() }).strict().refine(value => !value.managerUserId || !!value.managerDecisionReference);

export function createStaffOnboardingService(client: PrismaClient = prisma) {
  const boss = createBossService(client);
  async function options(actorUserId: string, organizationId: string) {
    const scope = await client.organization.findUnique({ where: { id: organizationId }, select: { id: true, slug: true, parentId: true, parent: { select: { slug: true } } } });
    if (!scope || !(scope.slug === "aira-skill-city" || scope.parent?.slug === "aira-skill-city") || !Object.values(staffRoleScopes).includes(scope.slug)) return { canPrepare: false, roles: [], managers: [], existingPeople: [] };
    const ctx = await createAccessContext(actorUserId, client, undefined, { organizationId });
    const canPrepare = ["person.create", "user.create", "membership.manage", "membership.assign_role"].every(key => ctx.organizationIds(key).includes(organizationId));
    if (!canPrepare) return { canPrepare: false, roles: [], managers: [], existingPeople: [] };
    const [roles, managers] = await Promise.all([
      client.role.findMany({ where: { organizationId, status: "ACTIVE", principalType: "HUMAN", key: { in: Object.keys(staffRoleScopes) } }, select: { id: true, name: true, key: true, permissions: { select: { permission: { select: { key: true } } } } }, orderBy: { name: "asc" }, take: 100 }),
      client.user.findMany({ where: { status: "ACTIVE", emailVerifiedAt: { not: null }, person: { memberships: { some: { organizationId, status: "ACTIVE" } } } }, select: { id: true, email: true }, orderBy: { email: "asc" }, take: 100 })
    ]);
    const isBoss = await boss.authority(actorUserId).then(() => true).catch(error => { if (error instanceof AccessError) return false; throw error; });
    const companyId = scope.slug === "aira-skill-city" ? scope.id : scope.parentId!;
    const existingPeople = isBoss && ctx.organizationIds("person.read").includes(organizationId) ? await client.person.findMany({ where: { status: "ACTIVE", email: { not: null }, users: { none: {} }, memberships: { some: { organization: { OR: [{ id: companyId }, { parentId: companyId }] } }, none: { organizationId } } }, select: { id: true, displayName: true, email: true, metadata: true, memberships: { select: { organizationId: true, organization: { select: { parentId: true } }, roles: { select: { id: true } } } } }, orderBy: { displayName: "asc" }, take: 50 }) : [];
    return { canPrepare, roles: roles.filter(role => isPreparedStaffRole(role.key, scope.slug) && hasStaffWorkspaceCapabilities(role.key, role.permissions.map(item => item.permission.key)) && (!["Director", "Division Director"].includes(role.name) || isBoss)).map(({ id, name }) => ({ id, name })), managers, existingPeople: existingPeople.filter(person => { try { return !JSON.parse(person.metadata ?? "{}").authenticationRealm && person.memberships.every(member => (member.organizationId === companyId || member.organization.parentId === companyId) && member.roles.length === 0); } catch { return false; } }).map(({ id, displayName, email }) => ({ id, displayName, email })) };
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
      let person;
      if (input.existingPersonId) {
        await boss.authority(actorUserId, db);
        await ctx.requireAccess("person.read", { organizationId: scope.id });
        const existing = await db.person.findUnique({ where: { id: input.existingPersonId }, include: { users: { select: { id: true } }, memberships: { select: { organizationId: true, organization: { select: { parentId: true } }, roles: { select: { id: true } } } } } });
        let metadata: Record<string, unknown>;
        try { metadata = JSON.parse(existing?.metadata ?? "{}"); } catch { throw new AccessError("Existing person requires identity review"); }
        if (!existing || existing.status !== "ACTIVE" || !existing.email || existing.users.length || metadata.authenticationRealm || !existing.memberships.some(member => member.organizationId === company.id || member.organization.parentId === company.id) || existing.memberships.some(member => member.organizationId === scope.id || member.organizationId !== company.id && member.organization.parentId !== company.id || member.roles.length > 0)) throw new AccessError("Existing person requires identity review; no duplicate will be created");
        if (await db.user.findUnique({ where: { email: existing.email } })) throw new AccessError("Existing account requires a separate access review");
        person = await db.person.update({ where: { id: existing.id }, data: { metadata: JSON.stringify({ ...metadata, authenticationRealm: staffPortalForRole(role.key), credentialKind: "STAFF_PASSWORD", staffOnboarding: "DRAFT", identityVerification: "PENDING", scopeDecisionReference: input.scopeDecisionReference, managerDecisionReference: input.managerDecisionReference ?? null, managerUserId: input.managerUserId ?? null }) } });
      } else {
        if (await db.user.findUnique({ where: { email: input.email! } }) || await db.person.findUnique({ where: { email: input.email! } })) throw new AccessError("Existing identity requires review; no duplicate will be created");
        person = await db.person.create({ data: { displayName: input.displayName!, email: input.email!, metadata: JSON.stringify({ authenticationRealm: staffPortalForRole(role.key), credentialKind: "STAFF_PASSWORD", staffOnboarding: "DRAFT", identityVerification: "PENDING", scopeDecisionReference: input.scopeDecisionReference, managerDecisionReference: input.managerDecisionReference ?? null, managerUserId: input.managerUserId ?? null }) } });
      }
      const user = await db.user.create({ data: { email: person.email!, personId: person.id, status: "INACTIVE" } });
      const membership = await db.membership.create({ data: { personId: person.id, organizationId: scope.id, scope: descendantScope ? "DESCENDANTS" : "ORGANIZATION", status: "INVITED", title: role.name } });
      await setHumanMembershipRole(db, ctx, membership.id, role.id, true);
      if (input.managerUserId) {
        const manager = await db.user.findUniqueOrThrow({ where: { id: input.managerUserId }, select: { personId: true } });
        if (manager.personId === person.id) throw new AccessError("Employee cannot report to themself");
        await db.reportingRelationship.create({ data: { organizationId: scope.id, personId: person.id, managerPersonId: manager.personId!, status: "INACTIVE", metadata: JSON.stringify({ decisionReference: input.managerDecisionReference }) } });
      }
      await operationalEvent(db, { actorUserId, actorPersonId: ctx.user!.personId, organizationId: scope.id, action: "staff.onboarding_draft_created", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { roleId: role.id, managerUserId: input.managerUserId ?? null, scopeDecisionReference: input.scopeDecisionReference, managerDecisionReference: input.managerDecisionReference ?? null, reusedPersonId: input.existingPersonId ?? null, activation: "BLOCKED_UNTIL_VERIFIED" } });
      return { id: user.id, status: "DRAFT" as const };
    });
  }
  async function reviewDraft(actorUserId: string, raw: unknown) {
    const input = reviewInput.parse(raw);
    return client.$transaction(async db => {
      await boss.authority(actorUserId, db);
      const user = await db.user.findUnique({ where: { id: input.userId }, include: { person: { include: { memberships: { include: { roles: { include: { role: true } } } } } } } });
      if (!user?.person || user.status !== "INACTIVE" || user.passwordHash || user.emailVerifiedAt) throw new AccessError("Inactive staff draft required");
      let metadata: Record<string, unknown>;
      try { metadata = JSON.parse(user.person.metadata ?? "{}"); } catch { throw new AccessError("Staff identity requires review"); }
      if ((metadata.authenticationRealm !== "skillcity" && metadata.authenticationRealm !== "labs") || metadata.staffOnboarding !== "DRAFT" || user.person.email !== user.email) throw new AccessError("Staff draft unavailable");
      const invited = user.person.memberships.filter(item => item.status === "INVITED" && item.projectId === null);
      if (invited.length !== 1 || invited[0].roles.length !== 1) throw new AccessError("Staff scope requires review");
      const membership = invited[0], role = membership.roles[0].role;
      const scope = await db.organization.findUnique({ where: { id: membership.organizationId }, select: { slug: true, parent: { select: { slug: true } } } });
      if (!scope || !(scope.slug === "aira-skill-city" || scope.parent?.slug === "aira-skill-city") || !isPreparedStaffRole(role.key, scope.slug) || (metadata.authenticationRealm !== staffPortalForRole(role.key) && !(scope.slug === "aira-labs" && metadata.authenticationRealm === "labs" && metadata.credentialKind === "STAFF_PASSWORD")) || role.organizationId !== membership.organizationId || role.status !== "ACTIVE") throw new AccessError("Staff role requires review");
      const ctx = await createAccessContext(actorUserId, db, undefined, { organizationId: membership.organizationId });
      for (const key of ["person.update", "user.update", "membership.manage", "reporting.manage"]) await ctx.requireAccess(key, { organizationId: membership.organizationId });
      if (!["Director", "Division Director"].includes(role.name) && !input.managerUserId) throw new AccessError("Manager decision required");
      let managerPersonId: string | null = null;
      if (input.managerUserId) {
        const manager = await db.user.findUnique({ where: { id: input.managerUserId }, select: { personId: true, status: true, emailVerifiedAt: true } });
        if (!manager?.personId || manager.personId === user.personId || manager.status !== "ACTIVE" || !manager.emailVerifiedAt || !(await db.membership.findFirst({ where: { personId: manager.personId, status: "ACTIVE", OR: [{ organizationId: membership.organizationId }, { organizationId: (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" }, select: { id: true } })).id, scope: "DESCENDANTS" }] } }))) throw new AccessError("Verified manager appointment required");
        managerPersonId = manager.personId;
        await db.reportingRelationship.updateMany({ where: { organizationId: membership.organizationId, personId: user.personId!, status: "INACTIVE", managerPersonId: { not: managerPersonId } }, data: { status: "ARCHIVED" } });
        await db.reportingRelationship.upsert({ where: { organizationId_personId_managerPersonId: { organizationId: membership.organizationId, personId: user.personId!, managerPersonId } }, create: { organizationId: membership.organizationId, personId: user.personId!, managerPersonId, status: "INACTIVE", metadata: JSON.stringify({ decisionReference: input.managerDecisionReference }) }, update: { status: "INACTIVE", metadata: JSON.stringify({ decisionReference: input.managerDecisionReference }) } });
      }
      await db.person.update({ where: { id: user.personId! }, data: { metadata: JSON.stringify({ ...metadata, scopeDecisionReference: input.scopeDecisionReference, managerDecisionReference: input.managerDecisionReference ?? null, managerUserId: input.managerUserId ?? null }) } });
      await operationalEvent(db, { actorUserId, actorPersonId: ctx.user!.personId, organizationId: membership.organizationId, action: "staff.onboarding_decisions_reviewed", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { scopeDecisionReference: input.scopeDecisionReference, managerDecisionReference: input.managerDecisionReference ?? null, managerUserId: input.managerUserId ?? null, roleId: role.id } });
      return { status: "DRAFT" as const };
    });
  }
  return { prepare, options, reviewDraft };
}

export const staffOnboardingService = createStaffOnboardingService();
