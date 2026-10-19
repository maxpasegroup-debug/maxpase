import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { createSecurityLimiter, securityKey } from "@/server/security/rate-limit";
import { operationalEvent } from "@/server/domain/operational-events";
import { NiceJobsError, NiceJobsUnavailable } from "./input";

export const applicantPermissionKeys = ["organization.read", "nicejobs.application.self", "notification.read", "sia.access.read"] as const;
export const applicantRoleKey = "nicejobs-public-applicant";
export const applicantRegistrationInput = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  password: z.string().min(12).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password is too long"),
  confirmPassword: z.string(),
  acknowledge: z.literal(true)
}).strict().refine(value => value.password === value.confirmPassword, "Passwords must match");

export function createApplicantAccess(client: PrismaClient = prisma) {
  const consume = createSecurityLimiter(client);
  async function register(raw: unknown) {
    await consume("nicejobs:registration:global", 20, 60);
    const data = applicantRegistrationInput.parse(raw);
    await consume(securityKey("nicejobs:registration:account", data.email), 3, 3600);
    if (["boss@nicejobs.online", "boss@maxpase.com"].includes(data.email)) throw new NiceJobsError("Use sign in or contact the platform administrator for this account.");
    const passwordHash = await hashPassword(data.password);
    try {
      return await client.$transaction(async db => {
        const company = await db.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true, type: true, status: true, company: { select: { status: true } } } });
        if (!company || company.type !== "COMPANY" || company.status !== "ACTIVE" || company.company?.status !== "ACTIVE") throw new NiceJobsUnavailable("Applicant registration is unavailable");
        const product = await db.product.findUnique({ where: { organizationId_slug: { organizationId: company.id, slug: "nice-jobs" } }, select: { status: true, division: { select: { id: true, slug: true, type: true, parentId: true, status: true } } } });
        const career = product?.division;
        if (!product || product.status !== "ACTIVE" || !career || career.type !== "DIVISION" || career.slug !== "aira-career-hub" || career.parentId !== company.id || career.status !== "ACTIVE") throw new NiceJobsUnavailable("Applicant registration is unavailable");
        if (await db.user.findUnique({ where: { email: data.email }, select: { id: true } }) || await db.person.findUnique({ where: { email: data.email }, select: { id: true } })) throw new NiceJobsError("Use sign in or contact the platform administrator for this account.");
        const permissions = await db.permission.findMany({ where: { key: { in: [...applicantPermissionKeys] } }, select: { id: true, key: true, scope: true }, take: 5 });
        if (permissions.length !== applicantPermissionKeys.length || permissions.some(permission => permission.scope !== "GROUP")) throw new NiceJobsUnavailable("Applicant access is not configured");
        let role = await db.role.findUnique({ where: { organizationId_key: { organizationId: career.id, key: applicantRoleKey } }, include: { permissions: { include: { permission: { select: { key: true } } }, take: 5 } } });
        if (!role) role = await db.role.create({ data: { organizationId: career.id, key: applicantRoleKey, name: "Nice Jobs applicant", category: "APPLICANT", system: true, description: "Self-service application access in Career Hub only. No worker or management authority.", permissions: { create: permissions.map(permission => ({ permissionId: permission.id })) } }, include: { permissions: { include: { permission: { select: { key: true } } }, take: 5 } } });
        if (role.status !== "ACTIVE" || role.principalType !== "HUMAN" || role.canonical || role.permissions.length !== applicantPermissionKeys.length || role.permissions.some(grant => !applicantPermissionKeys.some(key => key === grant.permission.key))) throw new NiceJobsUnavailable("Applicant access is not configured");
        const person = await db.person.create({ data: { displayName: data.displayName, email: data.email, metadata: JSON.stringify({ authenticationRealm: "jobs", identitySource: "SELF_REGISTRATION", contactStatus: "UNVERIFIED", registrationNoticeVersion: 1 }) } });
        const user = await db.user.create({ data: { email: data.email, personId: person.id, passwordHash } });
        const membership = await db.membership.create({ data: { personId: person.id, organizationId: career.id, title: "Applicant", scope: "ORGANIZATION", metadata: JSON.stringify({ source: "NICE_JOBS_SELF_REGISTRATION" }), roles: { create: { roleId: role.id } } } });
        await operationalEvent(db, { actorUserId: user.id, actorPersonId: person.id, organizationId: career.id, action: "nicejobs.applicant.registered", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { membershipId: membership.id, noticeVersion: 1, contactStatus: "UNVERIFIED" } });
        return { userId: user.id };
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new NiceJobsError("Use sign in or contact the platform administrator for this account.");
      throw error;
    }
  }
  return { register };
}

export const applicantAccess = createApplicantAccess();
