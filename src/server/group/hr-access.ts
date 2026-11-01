import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { ancestry } from "@/server/authorization/business-scope";
import { setHumanMembershipRole } from "@/server/authorization/assignments";
import { operationalEvent } from "@/server/domain/operational-events";
import { accountPortalRealm } from "@/server/auth/account-realm";
import { isPreparedStaffRole, hasStaffWorkspaceCapabilities } from "@/server/skillcity/staff-roles";
import { createBossService } from "./boss-service";
import { marketingDivisionSlug } from "./brand-marketing-scope";

const id = z.string().min(1).max(200);
export function createHrAccess(client: PrismaClient = prisma) {
  const boss = createBossService(client);
  async function employee(actorId: string, employmentId: string, db: Prisma.TransactionClient = client) {
    const { ctx, root } = await boss.authority(actorId, db);
    const row = await db.employment.findUnique({ where: { id: employmentId }, include: { company: { select: { slug: true, parentId: true, status: true } }, person: { select: { id: true, email: true, users: { select: { id: true, email: true, status: true, emailVerifiedAt: true, person: { select: { metadata: true } } } } } } } });
    if (!row || row.company.parentId !== root.id) throw new AccessError("Employment unavailable");
    await ctx.requireAccess("membership.read", { organizationId: row.companyId });
    return { row, ctx };
  }
  async function overview(actorId: string, employmentId: string) {
    const { row, ctx } = await employee(actorId, employmentId);
    const scopeIds = ctx.nodes.filter(node => ancestry(ctx.nodes, node.id).some(parent => parent.id === row.companyId)).map(node => node.id);
    const [memberships, invitations] = await Promise.all([
      client.membership.findMany({ where: { personId: row.personId, organizationId: { in: scopeIds } }, include: { organization: { select: { name: true } }, roles: { include: { role: { select: { name: true, key: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 }),
      row.company.slug === "aira-skill-city" && row.person.users.length ? client.emailAuthChallenge.findMany({ where: { userId: { in: row.person.users.map(item => item.id) }, purpose: "STAFF_INVITE" }, select: { id: true, status: true, createdAt: true, expiresAt: true, consumedAt: true }, orderBy: { createdAt: "desc" }, take: 50 }) : []
    ]);
    const challenge = invitations[0] ?? null;
    const account = row.person.users.find(item => item.email === row.person.email) ?? null;
    const assignments = await client.hrAssignment.findMany({ where: { employmentId, status: "ACTIVE", brand: { status: "ACTIVE" } }, include: { brand: { select: { name: true, slug: true, parentBrandId: true } } }, take: 100 });
    const targets: { id: string; name: string; brandId: string | null }[] = [];
    if (row.company.slug === "aira-skill-city") {
      targets.push({ id: row.companyId, name: "AIRA Skill City company", brandId: null as string | null });
      for (const assignment of assignments) {
        const slug = assignment.brand.parentBrandId ? undefined : marketingDivisionSlug(assignment.brand.slug);
        const division = slug ? await client.organization.findFirst({ where: { slug, parentId: row.companyId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } }) : null;
        if (division) targets.push({ id: division.id, name: assignment.brand.name, brandId: assignment.brandId });
      }
    }
    const roles = targets.length ? await client.role.findMany({ where: { organizationId: { in: targets.map(target => target.id) }, status: "ACTIVE", principalType: "HUMAN" }, include: { permissions: { include: { permission: { select: { key: true } } } } }, take: 100 }) : [];
    const history = await client.operationalEvent.findMany({ where: { organizationId: { in: scopeIds }, OR: [{ entityType: "Membership", entityId: { in: memberships.map(m => m.id) } }, ...(account ? [{ entityType: "User", entityId: account.id }] : []), { entityType: "EmailAuthChallenge", entityId: { in: invitations.map(item => item.id) } }] }, select: { id: true, eventType: true, status: true, createdAt: true, actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    return {
      employmentStatus: row.status,
      companyId: row.companyId,
      portal: row.company.slug === "aira-skill-city" ? account && accountPortalRealm(account.person?.metadata) === "labs" ? "AIRA Labs" : "AIRA Skill City" : "NOT CONFIGURED",
      account: account ? { id: account.id, status: account.status, verified: !!account.emailVerifiedAt, realm: accountPortalRealm(account.person?.metadata) } : null,
      invitation: challenge,
      invitations,
      history,
      memberships: memberships.map(m => ({ id: m.id, scopeKey: m.scopeKey, organizationId: m.organizationId, organization: m.organization.name, status: m.status, roles: m.roles.map(item => item.role.name), createdAt: m.createdAt, endDate: m.endDate })),
      targets,
      roles: roles.filter(role => targets.some(target => target.id === role.organizationId && isPreparedStaffRole(role.key, target.brandId ? marketingDivisionSlug(assignments.find(a => a.brandId === target.brandId)?.brand.slug ?? "") ?? "" : row.company.slug)) && hasStaffWorkspaceCapabilities(role.key, role.permissions.map(p => p.permission.key))).map(role => ({ id: role.id, organizationId: role.organizationId, name: role.name }))
    };
  }
  async function grant(actorId: string, raw: unknown) {
    const input = z.object({ employmentId: id, organizationId: id, roleId: id, brandId: id.optional() }).strict().parse(raw);
    return client.$transaction(async db => {
      const { row, ctx } = await employee(actorId, input.employmentId, db);
      if (row.status !== "ACTIVE" || row.company.status !== "ACTIVE" || row.company.slug !== "aira-skill-city") throw new AccessError("Employee portal and active employment required");
      const user = row.person.users.find(u => u.status === "ACTIVE" && u.emailVerifiedAt && u.email === row.person.email && accountPortalRealm(u.person?.metadata) === "skillcity");
      if (!user) throw new AccessError("Verified Skill City employee account required");
      const target = await db.organization.findUnique({ where: { id: input.organizationId }, select: { id: true, slug: true, parentId: true, type: true, status: true } });
      if (!target || target.status !== "ACTIVE" || !(target.id === row.companyId && target.type === "COMPANY" && !input.brandId || target.parentId === row.companyId && target.type === "DIVISION" && !!input.brandId)) throw new AccessError("Organization scope unavailable");
      if (input.brandId) {
        const assignment = await db.hrAssignment.findFirst({ where: { employmentId: row.id, brandId: input.brandId, status: "ACTIVE", brand: { organizationId: row.companyId, parentBrandId: null, status: "ACTIVE" } }, include: { brand: { select: { slug: true } } } });
        if (!assignment || marketingDivisionSlug(assignment.brand.slug) !== target.slug) throw new AccessError("Verified brand assignment required");
      }
      for (const key of ["membership.manage", "membership.assign_role"]) await ctx.requireAccess(key, { organizationId: target.id });
      const role = await db.role.findUnique({ where: { id: input.roleId }, include: { permissions: { include: { permission: true } } } });
      if (!role || role.organizationId !== target.id || role.status !== "ACTIVE" || role.principalType !== "HUMAN" || !isPreparedStaffRole(role.key, target.slug) || !hasStaffWorkspaceCapabilities(role.key, role.permissions.map(p => p.permission.key))) throw new AccessError("Approved role template unavailable");
      const scopeKey = input.brandId ? `hr-brand:${input.brandId}` : "organization";
      const existing = await db.membership.findMany({ where: { personId: row.personId, organizationId: target.id }, include: { roles: true }, take: 2 });
      if (existing.length > 1) throw new AccessError("Multiple existing memberships require review");
      const prior = existing[0] ?? null;
      if (prior?.status === "ENDED") throw new AccessError("Revoked access requires a new reviewed appointment");
      if (prior && (prior.status === "ACTIVE" && prior.roles.some(p => p.roleId === role.id))) return prior.id;
      if (prior && prior.roles.length && !prior.roles.some(p => p.roleId === role.id)) throw new AccessError("Existing access requires a separate role review");
      const membership = prior ? await db.membership.update({ where: { id: prior.id }, data: { status: "ACTIVE", endDate: null } }) : await db.membership.create({ data: { personId: row.personId, organizationId: target.id, scopeKey, status: "ACTIVE", scope: "ORGANIZATION", title: role.name } });
      await setHumanMembershipRole(db, ctx, membership.id, role.id, true);
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: target.id, action: "hr.employee_access_granted", entityType: "Membership", entityId: membership.id, result: "SUCCESS", metadata: { employmentId: row.id, brandId: input.brandId ?? null, roleId: role.id } });
      return membership.id;
    });
  }
  async function change(actorId: string, raw: unknown) {
    const input = z.object({ employmentId: id, membershipId: id, action: z.enum(["suspend", "revoke", "resume"]) }).strict().parse(raw);
    return client.$transaction(async db => {
      const { row, ctx } = await employee(actorId, input.employmentId, db);
      const member = await db.membership.findUnique({ where: { id: input.membershipId } });
      if (!member || member.personId !== row.personId || !ancestry(ctx.nodes, member.organizationId).some(node => node.id === row.companyId)) throw new AccessError("Membership unavailable");
      await ctx.requireAccess("membership.manage", { organizationId: member.organizationId });
      if (input.action === "resume" && (member.status !== "SUSPENDED" || row.status !== "ACTIVE") || input.action !== "resume" && member.status !== "ACTIVE") throw new AccessError("Invalid access transition");
      if (input.action === "resume") {
        if (row.company.slug !== "aira-skill-city" || row.company.status !== "ACTIVE") throw new AccessError("Employee portal unavailable");
        const organization = await db.organization.findUnique({ where: { id: member.organizationId }, select: { slug: true } });
        const requiredRealm = organization?.slug === "aira-labs" ? "labs" : "skillcity";
        if (!row.person.users.some(user => user.status === "ACTIVE" && !!user.emailVerifiedAt && user.email === row.person.email && accountPortalRealm(user.person?.metadata) === requiredRealm)) throw new AccessError("Verified employee account required");
        const roles = await db.membershipRole.findMany({ where: { membershipId: member.id }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
        if (!organization || !roles.length || roles.some(item => item.role.status !== "ACTIVE" || item.role.organizationId !== member.organizationId || !isPreparedStaffRole(item.role.key, organization.slug) || !hasStaffWorkspaceCapabilities(item.role.key, item.role.permissions.map(p => p.permission.key)))) throw new AccessError("A current approved role is required");
        if (member.organizationId !== row.companyId) {
          const active = await db.hrAssignment.findMany({ where: { employmentId: row.id, status: "ACTIVE", brand: { parentBrandId: null, status: "ACTIVE" } }, include: { brand: { select: { slug: true } } }, take: 100 });
          if (!active.some(item => marketingDivisionSlug(item.brand.slug) === organization.slug)) throw new AccessError("Active brand assignment required");
        }
      }
      const status = input.action === "resume" ? "ACTIVE" : input.action === "suspend" ? "SUSPENDED" : "ENDED";
      await db.membership.update({ where: { id: member.id }, data: { status, endDate: status === "ENDED" ? new Date() : null } });
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: member.organizationId, action: `hr.employee_access_${input.action}`, entityType: "Membership", entityId: member.id, result: "SUCCESS", metadata: { employmentId: row.id } });
    });
  }
  async function revokeInvitation(actorId: string, raw: unknown) {
    const input = z.object({ employmentId: id, challengeId: z.uuid() }).strict().parse(raw);
    return client.$transaction(async db => {
      const { row, ctx } = await employee(actorId, input.employmentId, db);
      if (row.company.slug !== "aira-skill-city") throw new AccessError("Invitation unavailable");
      await ctx.requireAccess("user.update", { organizationId: row.companyId });
      const changed = await db.emailAuthChallenge.updateMany({ where: { id: input.challengeId, user: { personId: row.personId }, purpose: "STAFF_INVITE", status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
      if (changed.count !== 1) throw new AccessError("Invitation already closed");
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: row.companyId, action: "hr.employee_invitation_revoked", entityType: "EmailAuthChallenge", entityId: input.challengeId, result: "SUCCESS" });
    });
  }
  async function suspendAccount(actorId: string, raw: unknown) {
    const input = z.object({ employmentId: id, decisionReference: z.string().trim().min(8).max(200) }).strict().parse(raw);
    return client.$transaction(async db => {
      const { row, ctx } = await employee(actorId, input.employmentId, db);
      await ctx.requireAccess("user.update", { organizationId: row.companyId });
      if (row.company.slug !== "aira-skill-city" || await db.employment.findFirst({ where: { personId: row.personId, companyId: { not: row.companyId }, status: "ACTIVE" } })) throw new AccessError("Suspend scoped memberships instead; this account may serve another company");
      const account = row.person.users.find(user => user.email === row.person.email && user.status === "ACTIVE" && ["skillcity", "labs"].includes(accountPortalRealm(user.person?.metadata) ?? ""));
      if (!account) throw new AccessError("Active employee account unavailable");
      const scopes = ctx.nodes.filter(node => ancestry(ctx.nodes, node.id).some(parent => parent.id === row.companyId)).map(node => node.id);
      const memberships = await db.membership.findMany({ where: { personId: row.personId, organizationId: { in: scopes }, status: "ACTIVE" }, select: { id: true, organizationId: true } });
      for (const member of memberships) await ctx.requireAccess("membership.manage", { organizationId: member.organizationId });
      await db.user.update({ where: { id: account.id }, data: { status: "SUSPENDED" } });
      await db.session.deleteMany({ where: { userId: account.id } });
      await db.membership.updateMany({ where: { id: { in: memberships.map(member => member.id) } }, data: { status: "SUSPENDED" } });
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: row.companyId, action: "hr.employee_account_suspended", entityType: "User", entityId: account.id, result: "SUCCESS", metadata: { employmentId: row.id, decisionReference: input.decisionReference, membershipIds: memberships.map(member => member.id) } });
    });
  }
  async function resumeAccount(actorId: string, raw: unknown) {
    const input = z.object({ employmentId: id, decisionReference: z.string().trim().min(8).max(200) }).strict().parse(raw);
    return client.$transaction(async db => {
      const { row, ctx } = await employee(actorId, input.employmentId, db);
      await ctx.requireAccess("user.update", { organizationId: row.companyId });
      if (row.company.slug !== "aira-skill-city" || row.company.status !== "ACTIVE" || row.status !== "ACTIVE") throw new AccessError("Active configured employment required");
      if (await db.employment.findFirst({ where: { personId: row.personId, companyId: { not: row.companyId }, status: "ACTIVE" } })) throw new AccessError("Account serves another company; review company memberships instead");
      const account = row.person.users.find(user => user.email === row.person.email && user.status === "SUSPENDED" && !!user.emailVerifiedAt && ["skillcity", "labs"].includes(accountPortalRealm(user.person?.metadata) ?? ""));
      if (!account || !(await db.hrAssignment.findFirst({ where: { employmentId: row.id, status: "ACTIVE", brand: { status: "ACTIVE" } }, select: { id: true } }))) throw new AccessError("Verified account and active assignment required");
      await db.user.update({ where: { id: account.id }, data: { status: "ACTIVE" } });
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: row.companyId, action: "hr.employee_account_resumed", entityType: "User", entityId: account.id, result: "SUCCESS", metadata: { employmentId: row.id, decisionReference: input.decisionReference } });
      // Memberships remain suspended until each scope is reviewed and resumed.
    });
  }
  return { overview, grant, change, revokeInvitation, suspendAccount, resumeAccount };
}
export const hrAccess = createHrAccess();
