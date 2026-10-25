import { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { workforcePermissions } from "@/server/authorization/registry";
import { createBossService } from "@/server/group/boss-service";

const advisor = ["organization.read", "product.read", "aira.crm.self", "aira.crm.perform"];
const director = ["organization.read", "executive.read", "decision.read", "decision.decide", "approval.read", "approval.decide", "person.read", "person.create", "person.update", "user.read", "user.create", "user.update", "membership.read", "membership.manage", "membership.assign_role", "membership.scope.manage", "role.read", "product.read", "project.read", "task.read", "task.manage", "aira.crm.self", "aira.crm.perform", "aira.crm.manage", "labs.sales.self", "labs.sales.perform", "labs.sales.read", "labs.sales.manage", "labs.delivery.assignee", "sia.access.read"];
const divisionDirector = ["organization.read", "executive.read", "decision.read", "decision.decide", "approval.read", "approval.decide", "person.read", "person.create", "person.update", "user.read", "user.create", "user.update", "membership.read", "membership.manage", "membership.assign_role", "role.read", "project.read", "task.read", "task.manage"];
const templates = [
  { scope: "aira-skill-city", key: "aira-03", name: "Director", permissions: director },
  { scope: "aira-skill-city", key: "aira-26", name: "Senior Academic Advisor", permissions: [...advisor, "labs.sales.self", "labs.sales.perform", "sia.access.read"] },
  { scope: "aira-labs", key: "labs-division-director", name: "Division Director", permissions: [...divisionDirector, "labs.sales.self", "labs.sales.perform", "labs.sales.read", "labs.sales.manage", "labs.delivery.assignee"] },
  { scope: "aira-startup-school", key: "startup-division-director", name: "Division Director", permissions: [...divisionDirector, "aira.crm.self", "aira.crm.perform", "aira.crm.manage"] },
  { scope: "aira-skill-studio", key: "studio-division-director", name: "Division Director", permissions: [...divisionDirector, "aira.crm.self", "aira.crm.perform", "aira.crm.manage"] },
  { scope: "aira-career-hub", key: "career-division-director", name: "Division Director", permissions: divisionDirector },
  { scope: "aira-labs", key: "labs-junior-academic-advisor", name: "Junior Academic Advisor", permissions: ["organization.read", "labs.sales.self", "labs.sales.perform"] },
  { scope: "aira-startup-school", key: "startup-junior-academic-advisor", name: "Junior Academic Advisor", permissions: ["organization.read", "aira.crm.self", "aira.crm.perform"] },
  { scope: "aira-skill-studio", key: "studio-junior-academic-advisor", name: "Junior Academic Advisor", permissions: ["organization.read", "aira.crm.self", "aira.crm.perform"] },
  { scope: "aira-labs", key: "labs-full-stack-developer", name: "Full Stack Developer", permissions: ["organization.read", "labs.delivery.assignee", "project.read", "task.read", "task.manage"] },
  { scope: "aira-labs", key: "labs-junior-developer", name: "Junior Developer", permissions: ["organization.read", "labs.delivery.assignee", "project.read", "task.read", "task.manage"] },
  { scope: "aira-labs", key: "labs-business-development-manager", name: "Business Development Manager", permissions: ["organization.read", "person.read", "labs.sales.self", "labs.sales.perform", "labs.sales.read", "labs.sales.manage"] }
] as const;

export function createSkillCityRoleTemplates(client: PrismaClient = prisma) {
  async function prepare(bossUserId: string, reviewedExistingDirectors: boolean) {
    return client.$transaction(async db => {
      const { ctx, root } = await createBossService(client).authority(bossUserId, db);
      const company = await db.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true, parentId: true, type: true, status: true } });
      if (!company || company.parentId !== root.id || company.type !== "COMPANY" || company.status !== "ACTIVE") throw new AccessError("AIRA company unavailable");
      const directorScopes = await db.organization.findMany({ where: { OR: [{ id: company.id }, { parentId: company.id, type: "DIVISION" }] }, select: { id: true } });
      const existingDirectors = await db.role.findMany({ where: { organizationId: { in: directorScopes.map(scope => scope.id) }, key: { in: ["aira-03", "labs-division-director", "startup-division-director", "studio-division-director", "career-division-director"] } }, select: { id: true } });
      const appointed = await db.membershipRole.count({ where: { roleId: { in: existingDirectors.map(role => role.id) }, membership: { status: "ACTIVE" } } });
      if (appointed && !reviewedExistingDirectors) throw new AccessError("Review existing director appointments before changing this shared role");
      const definitions = new Map(workforcePermissions.map(permission => [permission.key, permission]));
      let configured = 0;
      for (const template of templates) {
        const target = await db.organization.findUnique({ where: { slug: template.scope }, select: { id: true, parentId: true, type: true, status: true } });
        if (!target || target.status !== "ACTIVE" || !(target.id === company.id || target.parentId === company.id && target.type === "DIVISION")) throw new AccessError("Role scope unavailable");
        await ctx.requireAccess("role.create", { organizationId: target.id });
        await ctx.requireAccess("permission.assign", { organizationId: target.id });
        const role = await db.role.findUnique({ where: { organizationId_key: { organizationId: target.id, key: template.key } } });
        if (role && (role.name !== template.name || role.principalType !== "HUMAN" || role.status !== "ACTIVE")) throw new AccessError("Existing role conflicts with the approved template");
        const saved = role ?? await db.role.create({ data: { organizationId: target.id, key: template.key, name: template.name, principalType: "HUMAN", category: "Skill City staff", status: "ACTIVE" } });
        for (const key of template.permissions) {
          const definition = definitions.get(key);
          const permission = definition ? await db.permission.upsert({ where: { key }, create: definition, update: {} }) : await db.permission.findUnique({ where: { key } });
          if (!permission || permission.scope === "GLOBAL") throw new AccessError("Role capability unavailable");
          await ctx.requireDelegation(permission, { organizationId: target.id }, saved.organizationId === company.id);
          await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: saved.id, permissionId: permission.id } }, create: { roleId: saved.id, permissionId: permission.id }, update: {} });
        }
        configured++;
        await operationalEvent(db, { actorUserId: bossUserId, actorPersonId: ctx.user!.personId, organizationId: target.id, action: "staff.role_template_prepared", entityType: "Role", entityId: saved.id, result: "SUCCESS", metadata: { capabilityKeys: [...template.permissions], existingDirectorAppointmentsReviewed: reviewedExistingDirectors } });
      }
      return { configured };
    });
  }
  return { prepare };
}

export const skillCityRoleTemplates = createSkillCityRoleTemplates();
