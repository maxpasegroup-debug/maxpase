import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/server/auth/password";
import { workforcePermissions } from "@/server/authorization/registry";
import { initializeGroupStructure } from "./structure";
import { BOSS_EMAIL, validateBossConfiguration, type BossConfiguration } from "./identity";

const capabilities = [...workforcePermissions.filter(p => p.scope !== "GLOBAL"), ...["boss.access", "audit.read", "organization.read", "organization.manage", "company.read", "company.manage", "brand.read", "brand.manage", "product.read", "product.manage", "ownership.read", "ownership.manage", "membership.read", "membership.manage", "membership.scope.manage", "membership.assign_role", "project.read", "project.manage", "goal.read", "goal.manage", "sia.approve_action"].map(key => ({ key, name: key.replaceAll(".", " "), scope: "GROUP" as const }))];

export async function provisionBoss(client: PrismaClient, env: BossConfiguration) {
  validateBossConfiguration(env);
  if (!env.BOSS_PIN) throw new Error("Boss PIN configuration is required for explicit provisioning");
  const pinHash = await hashPassword(env.BOSS_PIN);
  return client.$transaction(async db => {
    const { groupId } = await initializeGroupStructure(db);
    const prior = await db.user.findUnique({ where: { email: BOSS_EMAIL }, select: { id: true, status: true, personId: true, person: { select: { metadata: true, status: true } } } });
    if (prior && (!prior.personId || JSON.parse(prior.person?.metadata ?? "{}").credentialKind !== "BOSS_PIN")) throw new Error("Existing account requires an explicit reviewed conversion");
    if (prior && (prior.status !== "ACTIVE" || prior.person?.status !== "ACTIVE")) throw new Error("Inactive Boss account requires operator review");
    const person = prior ? await db.person.findUniqueOrThrow({ where: { id: prior.personId! } }) : await db.person.create({ data: { displayName: "Group executive account", metadata: JSON.stringify({ credentialKind: "BOSS_PIN" }) } });
    const user = await db.user.upsert({ where: { email: BOSS_EMAIL }, update: { passwordHash: pinHash }, create: { email: BOSS_EMAIL, personId: person.id, passwordHash: pinHash } });
    await db.session.deleteMany({ where: { userId: user.id } });
    const role = await db.role.upsert({ where: { organizationId_key: { organizationId: groupId, key: "group-boss" } }, update: {}, create: { organizationId: groupId, key: "group-boss", name: "Group executive", principalType: "HUMAN" } });
    if (await db.rolePermission.count({ where: { roleId: role.id, permission: { scope: "GLOBAL" } } })) throw new Error("Boss provisioning cannot reuse global authority");
    for (const definition of capabilities) {
      const permission = await db.permission.upsert({ where: { key: definition.key }, update: {}, create: definition });
      if (permission.scope === "GLOBAL") throw new Error("Boss provisioning cannot grant global authority");
      await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
    }
    const membership = await db.membership.upsert({ where: { personId_organizationId_scopeKey: { personId: person.id, organizationId: groupId, scopeKey: "organization" } }, update: {}, create: { personId: person.id, organizationId: groupId, scope: "DESCENDANTS" } });
    if (membership.scope !== "DESCENDANTS" || membership.status !== "ACTIVE" || role.status !== "ACTIVE" || role.principalType !== "HUMAN") throw new Error("Existing Boss authority requires operator review");
    await db.membershipRole.upsert({ where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } }, update: {}, create: { membershipId: membership.id, roleId: role.id } });
    await db.auditEvent.create({ data: { actorUserId: user.id, actorPersonId: person.id, organizationId: groupId, action: "auth.boss_provisioned", entityType: "User", entityId: user.id, result: "SUCCESS" } });
    return { userId: user.id, groupId };
  });
}
