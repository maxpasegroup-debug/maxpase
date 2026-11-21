import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { createBossService } from "./boss-service";
import { ensureBrandWorkspace, brandWorkspaceRolesForBrand, brandWorkspaceSlug } from "./brand-workspaces";
import { operationalEvent } from "@/server/domain/operational-events";

const inputSchema = z.object({
  companyId: z.string().min(1).max(200), brandId: z.string().min(1).max(200),
  roleKey: z.enum(["brand-director", "brand-administrative-officer", "brand-specialist", "brand-employee"]),
  displayName: z.string().trim().min(2).max(200), email: z.email().trim().max(254).transform(value => value.toLowerCase()),
  phone: z.string().trim().regex(/^\+?[0-9().\-\s]{7,24}$/), joiningDate: z.coerce.date()
}).strict();
type DB = Prisma.TransactionClient;

export function createBrandWorkforceOnboardingService(client: PrismaClient = prisma) {
  const boss = createBossService(client);
  async function appoint(actorUserId: string, raw: unknown) {
    const input = inputSchema.parse(raw);
    return client.$transaction(async (db: DB) => {
      const { ctx, root } = await boss.authority(actorUserId, db);
      const company = await db.organization.findFirst({ where: { id: input.companyId, type: "COMPANY", parentId: root.id, status: "ACTIVE", company: { status: "ACTIVE" } }, select: { id: true, name: true, slug: true } });
      if (!company) throw new AccessError("Choose an active registered company under MAXPASE GROUP");
      const brand = await db.brand.findFirst({ where: { id: input.brandId, organizationId: company.id, status: "ACTIVE" }, select: { id: true, name: true, slug: true } });
      if (!brand) throw new AccessError("Choose an active brand under the selected company");
      const workspace = await ensureBrandWorkspace(db, company.id, brand.id, brand.slug, actorUserId, ctx.user?.personId);
      const template = brandWorkspaceRolesForBrand(brand.slug).find(role => role.key === input.roleKey);
      if (!template) throw new AccessError("Choose an available role for this brand");
      const role = await db.role.findUnique({ where: { organizationId_key: { organizationId: workspace.organizationId, key: template.key } }, select: { id: true, name: true, status: true, principalType: true, permissions: { select: { id: true } } } });
      const acceptedLegacyName = input.roleKey === "brand-specialist" && role?.name === "Brand Specialist";
      if (!role || role.name !== template.name && !acceptedLegacyName || role.status !== "ACTIVE" || role.principalType !== "HUMAN" || role.permissions.length) throw new AccessError("The selected brand role needs Boss review before appointment");

      const existingPerson = await db.person.findUnique({ where: { email: input.email }, include: { employments: { where: { companyId: company.id, status: "ACTIVE" }, select: { id: true, designation: true, startDate: true, assignments: { where: { brandId: brand.id, status: "ACTIVE" }, select: { id: true, designation: true, startDate: true } } } }, users: { select: { id: true, status: true, emailVerifiedAt: true } }, memberships: { where: { organizationId: workspace.organizationId }, select: { id: true, status: true, roles: { select: { role: { select: { key: true } } } } } } } });
      if (existingPerson) {
        let metadata: Record<string, unknown>;
        try { metadata = JSON.parse(existingPerson.metadata ?? "{}"); } catch { throw new AccessError("Existing identity requires review"); }
        const appointment = metadata.brandAppointment as { companyId?: string; brandId?: string; roleKey?: string; joiningDate?: string } | undefined;
        const employment = existingPerson.employments.find(row => row.assignments.length === 1);
        const membership = existingPerson.memberships.find(row => row.roles.some(item => item.role.key === input.roleKey));
        const user = existingPerson.users.find(row => row.id === (metadata.brandAppointmentUserId as string | undefined));
        if (appointment?.companyId === company.id && appointment.brandId === brand.id && appointment.roleKey === input.roleKey && appointment.joiningDate === input.joiningDate.toISOString() && employment && membership?.status === "INVITED" && membership.roles.length === 1 && user && user.status === "INACTIVE" && !user.emailVerifiedAt) {
          return { employmentId: employment.id, userId: user.id, membershipId: membership.id, brandId: brand.id, brandName: brand.name, companyName: company.name, roleName: template.name, email: input.email, reused: true };
        }
        throw new AccessError("An existing person or account uses this email. Review that identity before creating another appointment.");
      }
      if (await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw new AccessError("An existing account uses this email. Review that identity before creating another appointment.");

      const bossPersonId = ctx.user?.personId ?? null;
      const appointmentData = { companyId: company.id, brandId: brand.id, roleKey: template.key, joiningDate: input.joiningDate.toISOString() };
      const person = await db.person.create({ data: { displayName: input.displayName, email: input.email, phone: input.phone, metadata: JSON.stringify({ authenticationRealm: "brand", credentialKind: "STAFF_PASSWORD", staffOnboarding: "INVITED", identityVerification: "PENDING", brandAppointment: appointmentData, appointmentAuthority: "GROUP_BOSS", scopeDecisionReference: "Boss HR appointment" }) } });
      const employment = await db.employment.create({ data: { personId: person.id, companyId: company.id, status: "ACTIVE", startDate: input.joiningDate, designation: template.name, decisionReference: "Boss HR appointment", contactEmail: input.email, contactPhone: input.phone } });
      const assignment = await db.hrAssignment.create({ data: { employmentId: employment.id, brandId: brand.id, managerPersonId: bossPersonId, designation: template.name, startDate: input.joiningDate, status: "ACTIVE", decisionReference: "Boss HR appointment" } });
      const user = await db.user.create({ data: { email: input.email, personId: person.id, status: "INACTIVE" } });
      await db.person.update({ where: { id: person.id }, data: { metadata: JSON.stringify({ authenticationRealm: "brand", credentialKind: "STAFF_PASSWORD", staffOnboarding: "INVITED", identityVerification: "PENDING", brandAppointment: appointmentData, brandAppointmentUserId: user.id, appointmentAuthority: "GROUP_BOSS", scopeDecisionReference: "Boss HR appointment" }) } });
      const membership = await db.membership.create({ data: { personId: person.id, organizationId: workspace.organizationId, scope: "ORGANIZATION", status: "INVITED", title: template.name } });
      await db.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
      if (bossPersonId) await db.reportingRelationship.create({ data: { organizationId: workspace.organizationId, personId: person.id, managerPersonId: bossPersonId, status: "ACTIVE", metadata: JSON.stringify({ source: "BOSS_HR_APPOINTMENT" }) } });
      await operationalEvent(db, { actorUserId, actorPersonId: bossPersonId, organizationId: workspace.organizationId, action: "hr.brand_employee_appointed", entityType: "Employment", entityId: employment.id, result: "SUCCESS", metadata: { companyId: company.id, brandId: brand.id, assignmentId: assignment.id, userId: user.id, membershipId: membership.id, roleKey: template.key, joiningDate: input.joiningDate.toISOString(), invitation: "PENDING" } });
      return { employmentId: employment.id, userId: user.id, membershipId: membership.id, brandId: brand.id, brandName: brand.name, companyName: company.name, roleName: template.name, email: input.email, reused: false };
    });
  }
  async function changeAccess(actorUserId: string, raw: unknown) {
    const input = z.object({ employmentId: z.string().min(1).max(200), brandId: z.string().min(1).max(200), action: z.enum(["suspend", "resume", "revoke"]) }).strict().parse(raw);
    return client.$transaction(async db => {
      const { ctx } = await boss.authority(actorUserId, db);
      const employment = await db.employment.findFirst({ where: { id: input.employmentId, status: "ACTIVE", assignments: { some: { brandId: input.brandId, status: "ACTIVE" } } }, select: { id: true, personId: true, companyId: true } });
      const brand = await db.brand.findFirst({ where: { id: input.brandId, organizationId: employment?.companyId, status: "ACTIVE" }, select: { id: true, slug: true } });
      if (!employment || !brand) throw new AccessError("Active brand employment required");
      const workspace = await db.organization.findFirst({ where: { slug: brandWorkspaceSlug(brand.slug), parentId: employment.companyId, type: "BUSINESS_UNIT", status: "ACTIVE" }, select: { id: true } });
      const membership = workspace ? await db.membership.findFirst({ where: { personId: employment.personId, organizationId: workspace.id, status: { in: ["ACTIVE", "SUSPENDED", "INVITED"] } }, include: { roles: { include: { role: { select: { key: true } } } } } }) : null;
      const user = await db.user.findFirst({ where: { personId: employment.personId }, select: { id: true, status: true, passwordHash: true, emailVerifiedAt: true } });
      if (!workspace || !membership || membership.roles.length !== 1 || !membership.roles[0].role.key.startsWith("brand-") || !user) throw new AccessError("Brand account access is unavailable");
      if (input.action === "suspend") {
        if (membership.status !== "ACTIVE" || user.status !== "ACTIVE" || !user.passwordHash || !user.emailVerifiedAt) throw new AccessError("Only active verified brand access can be suspended");
        await db.membership.update({ where: { id: membership.id }, data: { status: "SUSPENDED" } });
      } else if (input.action === "resume") {
        if (membership.status !== "SUSPENDED" || user.status !== "ACTIVE" || !user.passwordHash || !user.emailVerifiedAt) throw new AccessError("Verified suspended brand access can be resumed");
        await db.membership.update({ where: { id: membership.id }, data: { status: "ACTIVE" } });
      } else {
        if (!["ACTIVE", "SUSPENDED", "INVITED"].includes(membership.status)) throw new AccessError("Brand access is already revoked");
        await db.membership.update({ where: { id: membership.id }, data: { status: "ENDED", endDate: new Date() } });
      }
      await db.session.deleteMany({ where: { userId: user.id } });
      await db.emailAuthChallenge.updateMany({ where: { userId: user.id, purpose: "STAFF_INVITE", status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
      const actionName = input.action === "suspend" ? "suspended" : input.action === "resume" ? "resumed" : "revoked";
      await operationalEvent(db, { actorUserId, actorPersonId: ctx.user?.personId, organizationId: workspace.id, action: `hr.brand_access_${actionName}`, entityType: "Membership", entityId: membership.id, result: "SUCCESS", metadata: { employmentId: employment.id, brandId: brand.id, userId: user.id, sessionsRevoked: true } });
      return { action: input.action, employmentId: employment.id, brandId: brand.id };
    });
  }
  return { appoint, changeAccess };
}
export const brandWorkforceOnboardingService = createBrandWorkforceOnboardingService();
