import { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { workforcePermissions } from "@/server/authorization/registry";
import { createBossService } from "@/server/group/boss-service";

const advisor = ["organization.read", "product.read", "aira.crm.self", "aira.crm.perform"];
const director = ["organization.read", "executive.read", "decision.read", "decision.decide", "approval.read", "approval.decide", "person.read", "person.create", "person.update", "user.read", "user.create", "user.update", "membership.read", "membership.manage", "membership.assign_role", "membership.scope.manage", "role.read", "reporting.read", "responsibility.read", "product.read", "program.manage", "project.read", "task.read", "task.manage", "aira.crm.self", "aira.crm.perform", "aira.crm.manage", "labs.sales.self", "labs.sales.perform", "labs.sales.read", "labs.sales.manage", "labs.delivery.assignee", "sia.access.read"];
const divisionDirector = ["organization.read", "executive.read", "decision.read", "decision.decide", "approval.read", "approval.decide", "person.read", "person.create", "person.update", "user.read", "user.create", "user.update", "membership.read", "membership.manage", "membership.assign_role", "role.read", "reporting.read", "responsibility.read", "project.read", "task.read", "task.manage"];
const niceJobsDirector = ["organization.read", "nicejobs.command.read", "nicejobs.job.read", "nicejobs.job.create", "nicejobs.job.edit", "nicejobs.job.publish", "nicejobs.job.pause", "nicejobs.job.archive", "nicejobs.worker.read", "nicejobs.worker.assign", "nicejobs.worker.transition", "nicejobs.workspace.read", "nicejobs.application.read", "nicejobs.application.evaluate", "nicejobs.application.shortlist", "nicejobs.application.reject", "nicejobs.application.close", "nicejobs.onboarding.read", "nicejobs.onboarding.manage", "nicejobs.orientation.manage", "nicejobs.ojt.configure", "nicejobs.ojt.assign", "nicejobs.ojt.review", "nicejobs.readiness.review", "nicejobs.knowledge.read", "nicejobs.knowledge.manage", "nicejobs.knowledge.review", "nicejobs.knowledge.publish", "nicejobs.resource.read", "nicejobs.finance.policy.read", "nicejobs.finance.incentive.read", "nicejobs.finance.wallet.read", "nicejobs.finance.settlement.read", "nicejobs.finance.payout.read", "nicejobs.performance.read", "nicejobs.exception.read"] as const;
export const administrativeOfficerRolePermissions = ["organization.read", "company.read", "person.read", "reporting.read", "responsibility.read", "skillcity.administrative.read", "skillcity.administrative.task.perform", "task.read", "event.read", "labs.billing.status.read", "labs.billing.customer.read", "labs.billing.customer.manage", "startup.application.read", "startup.application.triage", "startup.operations.read", "startup.operations.manage", "startup.centre.read", "startup.centre.manage", "startup.records.read", "startup.records.manage", "startup.records.sensitive.manage", "startup.grievance.submit", "startup.grievance.read", "startup.grievance.manage"] as const;
export const labsDeveloperRolePermissions = ["organization.read", "labs.delivery.assignee", "project.read", "task.read", "task.manage", "blocker.manage"] as const;
const templates = [
  { scope: "aira-skill-city", key: "aira-03", name: "Director", permissions: director },
  { scope: "aira-skill-city", key: "aira-26", name: "Senior Academic Advisor", permissions: [...advisor, "labs.sales.self", "labs.sales.perform", "sia.access.read"] },
  { scope: "aira-skill-city", key: "aira-administrative-officer", name: "Administrative Officer", permissions: administrativeOfficerRolePermissions },
  { scope: "aira-labs", key: "labs-division-director", name: "Division Director", permissions: [...divisionDirector, "labs.sales.self", "labs.sales.perform", "labs.sales.read", "labs.sales.manage", "labs.delivery.assignee", "labs.customer.manage"] },
  { scope: "aira-startup-school", key: "startup-division-director", name: "Division Director", permissions: [...divisionDirector, "program.manage", "aira.crm.self", "aira.crm.perform", "aira.crm.manage", "startup.operations.read", "startup.operations.submit", "startup.operations.manage", "startup.centre.read", "startup.centre.manage", "startup.centre.approve", "startup.records.read", "startup.records.manage", "startup.records.sensitive.read", "startup.records.sensitive.manage", "startup.grievance.submit", "startup.grievance.read", "startup.grievance.manage", "startup.grievance.sensitive.read", "startup.finance.read", "startup.finance.submit", "startup.finance.manage", "startup.finance.approve.all", "startup.finance.policy.manage", "startup.finance.payment.record", "startup.lead.read", "startup.lead.create", "startup.lead.call", "startup.lead.manage", "startup.hr.input.review", "startup.hr.payroll.read", "startup.hr.payroll.review", "startup.hr.payroll.release", "startup.hr.payroll.rules.approve", "startup.reports.read"] },
  { scope: "aira-startup-school", key: "startup-hr-manager", name: "Startup Skool HR Manager", permissions: ["organization.read", "startup.hr.people.read", "startup.hr.people.manage", "startup.hr.input.submit", "startup.hr.input.review", "startup.hr.payroll.read", "startup.hr.payroll.detail", "startup.hr.payroll.prepare", "startup.hr.payroll.rules.manage", "hr.document.read", "hr.document.manage"] },
  { scope: "aira-startup-school", key: "startup-admissions-officer", name: "Startup Skool Administrative Officer", permissions: ["organization.read", "startup.application.read", "startup.application.triage", "startup.operations.read", "startup.operations.manage", "startup.centre.read", "startup.centre.manage", "startup.records.read", "startup.records.manage", "startup.records.sensitive.manage", "startup.grievance.submit", "startup.grievance.read", "startup.grievance.manage", "startup.finance.read", "startup.finance.submit", "startup.finance.manage", "startup.finance.approve.routine", "startup.finance.payment.record", "task.read", "startup.lead.read", "startup.lead.create", "startup.lead.call", "startup.lead.manage", "startup.hr.people.read", "startup.hr.input.review"] },
  { scope: "aira-startup-school", key: "startup-centre-manager", name: "Startup Skool Centre Manager", permissions: ["organization.read", "startup.operations.read", "startup.operations.submit", "startup.centre.read", "startup.records.read", "startup.grievance.submit", "startup.finance.submit", "startup.hr.input.submit"] },
  { scope: "aira-startup-school", key: "startup-department-submitter", name: "Startup Skool Department Submitter", permissions: ["organization.read", "startup.operations.read", "startup.operations.submit", "startup.grievance.submit", "startup.finance.submit"] },
  { scope: "aira-startup-school", key: "startup-admissions-caller", name: "Startup Skool Admissions Caller", permissions: ["organization.read", "startup.lead.read", "startup.lead.create", "startup.lead.call"] },
  { scope: "aira-skill-studio", key: "studio-division-director", name: "Division Director", permissions: [...divisionDirector, "aira.crm.self", "aira.crm.perform", "aira.crm.manage"] },
  { scope: "aira-career-hub", key: "career-division-director", name: "Division Director", permissions: divisionDirector },
  { scope: "aira-career-hub", key: "nicejobs-director", name: "NICEJOBS Director", permissions: niceJobsDirector },
  { scope: "aira-labs", key: "labs-junior-academic-advisor", name: "Junior Academic Advisor", permissions: ["organization.read", "labs.sales.self", "labs.sales.perform"] },
  { scope: "aira-startup-school", key: "startup-junior-academic-advisor", name: "Junior Academic Advisor", permissions: ["organization.read", "aira.crm.self", "aira.crm.perform"] },
  { scope: "aira-skill-studio", key: "studio-junior-academic-advisor", name: "Junior Academic Advisor", permissions: ["organization.read", "aira.crm.self", "aira.crm.perform"] },
  { scope: "aira-labs", key: "labs-full-stack-developer", name: "Full Stack Developer", permissions: labsDeveloperRolePermissions },
  { scope: "aira-labs", key: "labs-software-developer", name: "Software Developer", permissions: labsDeveloperRolePermissions },
  { scope: "aira-labs", key: "labs-junior-developer", name: "Junior Developer", permissions: labsDeveloperRolePermissions },
  { scope: "aira-labs", key: "labs-business-development-manager", name: "Business Development Manager", permissions: ["organization.read", "person.read", "notification.read", "labs.sales.self", "labs.sales.perform", "labs.sales.read", "labs.sales.manage"] },
  { scope: "aira-media-company", key: "media-digital-marketing-manager", name: "Digital Marketing Manager", permissions: ["organization.read", "person.read", "reporting.read", "responsibility.read", "project.read", "task.read", "task.manage", "blocker.manage", "executive.read"] },
  { scope: "aira-media-company", key: "media-graphic-designer", name: "Graphic Designer", permissions: ["organization.read", "project.read", "task.read", "task.manage", "blocker.manage"] },
  { scope: "aira-media-company", key: "media-video-audio-editor", name: "Video and Audio Editor", permissions: ["organization.read", "project.read", "task.read", "task.manage", "blocker.manage"] },
  { scope: "aira-media-company", key: "media-ai-video-expert", name: "AI Video Expert", permissions: ["organization.read", "project.read", "task.read", "task.manage", "blocker.manage"] }
] as const;

export function createSkillCityRoleTemplates(client: PrismaClient = prisma) {
  async function prepare(bossUserId: string, reviewedExistingDirectors: boolean) {
    return client.$transaction(async db => {
      const { ctx, root } = await createBossService(client).authority(bossUserId, db);
      const company = await db.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true, parentId: true, type: true, status: true } });
      if (!company || company.parentId !== root.id || company.type !== "COMPANY" || company.status !== "ACTIVE") throw new AccessError("AIRA company unavailable");
      const directorScopes = await db.organization.findMany({ where: { OR: [{ id: company.id }, { parentId: company.id, type: "DIVISION" }] }, select: { id: true } });
      const existingDirectors = await db.role.findMany({ where: { organizationId: { in: directorScopes.map(scope => scope.id) }, key: { in: ["aira-03", "labs-division-director", "startup-division-director", "studio-division-director", "career-division-director", "nicejobs-director"] } }, select: { id: true } });
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
        if (["aira-administrative-officer", "startup-admissions-officer", "startup-hr-manager", "startup-centre-manager", "startup-department-submitter", "startup-admissions-caller", "nicejobs-director"].includes(template.key) || template.key.startsWith("labs-") && template.key.endsWith("-developer")) {
          const allowed = new Set<string>(template.permissions);
          const assigned = await db.rolePermission.findMany({ where: { roleId: saved.id }, select: { permissionId: true, permission: { select: { key: true } } } });
          const revoked = assigned.filter(grant => !allowed.has(grant.permission.key)).map(grant => grant.permissionId);
          if (revoked.length) await db.rolePermission.deleteMany({ where: { roleId: saved.id, permissionId: { in: revoked } } });
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
