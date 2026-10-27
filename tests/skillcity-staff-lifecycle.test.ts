import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createPostgresFixture } from "./helpers/postgres-fixture";
import { provisionBoss } from "@/server/group/provision";
import { createSkillCityRoleTemplates } from "@/server/skillcity/role-templates";
import { createStaffOnboardingService } from "@/server/skillcity/staff-onboarding";
import { createStaffInvite } from "@/server/skillcity/staff-invite";
import { createAuthenticationService } from "@/server/auth/service";

const postgres = createPostgresFixture();
const db = postgres.db;
const staff = createStaffOnboardingService(db);
const secret = randomBytes(32).toString("hex");
const env = { SKILLCITY_EMAIL_AUTH_ENABLED: "true", RESEND_API_KEY: "isolated-not-live", SKILLCITY_AUTH_FROM: "staff@test.invalid", SKILLCITY_OTP_SECRET: secret };
let code = "", invitationText = "", bossId: string, companyId: string, labsId: string, foreignId: string, roleId: string, managerId: string;
const invite = createStaffInvite(db, env, () => new Date(), async (_url, init) => {
  invitationText = JSON.parse(String(init?.body)).text;
  code = /code is ([0-9]{6})/.exec(invitationText)?.[1] ?? "";
  return new Response(JSON.stringify({ id: "mock-receipt" }), { status: 200 });
});
const email = () => `staff-${randomUUID()}@test.invalid`;

beforeAll(async () => {
  await postgres.initialize();
  bossId = (await provisionBoss(db, { BOSS_PIN: String(Math.floor(100000 + Math.random() * 900000)) })).userId;
  companyId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
  labsId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id;
  foreignId = (await db.organization.findUniqueOrThrow({ where: { slug: "pearn" } })).id;
  await createSkillCityRoleTemplates(db).prepare(bossId, false);
  roleId = (await db.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: labsId, key: "labs-junior-developer" } } })).id;
  const manager = await db.person.create({ data: { displayName: "Synthetic manager", email: email() } });
  managerId = (await db.user.create({ data: { email: manager.email!, personId: manager.id, emailVerifiedAt: new Date() } })).id;
  await db.membership.create({ data: { personId: manager.id, organizationId: labsId } });
}, 120000);
afterAll(() => postgres.dispose(), 30000);

describe("Skill City Boss employee lifecycle", () => {
  it("keeps the draft and reporting link inactive, then activates both with a single-use email proof", async () => {
    const address = email();
    const draft = await staff.prepare(bossId, { organizationId: labsId, displayName: "Synthetic developer", email: address, roleId, managerUserId: managerId, scopeDecisionReference: "scope-review-001", managerDecisionReference: "manager-review-001" });
    const user = await db.user.findUniqueOrThrow({ where: { id: draft.id }, include: { person: true } });
    expect(user.status).toBe("INACTIVE");
    expect(user.passwordHash).toBeNull();
    expect((await db.membership.findFirstOrThrow({ where: { personId: user.personId!, organizationId: labsId } })).status).toBe("INVITED");
    expect((await db.reportingRelationship.findFirstOrThrow({ where: { personId: user.personId!, organizationId: labsId } })).status).toBe("INACTIVE");
    expect(await db.auditEvent.count({ where: { entityId: user.id, action: "staff.onboarding_draft_created" } })).toBe(1);
    await invite.send(bossId, { userId: user.id, verificationEvidence: "synthetic identity checked" });
    expect(invitationText).toContain("https://airalabs.online/activate");
    const challenge = await db.emailAuthChallenge.findFirstOrThrow({ where: { userId: user.id, purpose: "STAFF_INVITE" } });
    expect(challenge.status).toBe("SENT");
    await expect(invite.activate({ challengeId: challenge.id, code, password: "synthetic-password-123", confirmPassword: "synthetic-password-123", portal: "skillcity" })).rejects.toThrow();
    await invite.activate({ challengeId: challenge.id, code, password: "synthetic-password-123", confirmPassword: "synthetic-password-123", portal: "labs" });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("ACTIVE");
    expect((await db.reportingRelationship.findFirstOrThrow({ where: { personId: user.personId!, organizationId: labsId } })).status).toBe("ACTIVE");
    expect(await createAuthenticationService(db).loginPortal({ email: address, password: "synthetic-password-123" }, secret, "labs")).not.toBeNull();
    expect(await createAuthenticationService(db).loginPortal({ email: address, password: "synthetic-password-123" }, secret, "skillcity")).toBeNull();
    await expect(invite.activate({ challengeId: challenge.id, code, password: "synthetic-password-123", confirmPassword: "synthetic-password-123", portal: "labs" })).rejects.toThrow();
  });
  it("reuses an eligible unclaimed AIRA Person but refuses duplicate and foreign identities", async () => {
    const address = email();
    const person = await db.person.create({ data: { displayName: "Existing synthetic person", email: address, memberships: { create: { organizationId: companyId } } } });
    const listed = await staff.options(bossId, labsId);
    expect(listed.existingPeople.some(row => row.id === person.id)).toBe(true);
    const before = await db.person.count({ where: { email: address } });
    const draft = await staff.prepare(bossId, { organizationId: labsId, existingPersonId: person.id, roleId, scopeDecisionReference: "scope-review-002" });
    expect((await db.user.findUniqueOrThrow({ where: { id: draft.id } })).personId).toBe(person.id);
    expect(await db.person.count({ where: { email: address } })).toBe(before);
    await expect(staff.prepare(bossId, { organizationId: labsId, displayName: "Duplicate", email: address, roleId, scopeDecisionReference: "scope-review-003" })).rejects.toThrow();
    const foreign = await db.person.create({ data: { displayName: "Foreign synthetic person", email: email(), memberships: { create: { organizationId: foreignId } } } });
    await expect(staff.prepare(bossId, { organizationId: labsId, existingPersonId: foreign.id, roleId, scopeDecisionReference: "scope-review-004" })).rejects.toThrow();
    expect(await db.user.count({ where: { personId: foreign.id } })).toBe(0);
    const privileged = await db.person.create({ data: { displayName: "Role-bearing synthetic person", email: email(), memberships: { create: { organizationId: companyId } } } });
    const privilegedMembership = await db.membership.findFirstOrThrow({ where: { personId: privileged.id, organizationId: companyId } });
    const companyRole = await db.role.findFirstOrThrow({ where: { organizationId: companyId, name: "Senior Academic Advisor" } });
    await db.membershipRole.create({ data: { membershipId: privilegedMembership.id, roleId: companyRole.id } });
    expect((await staff.options(bossId, labsId)).existingPeople.some(row => row.id === privileged.id)).toBe(false);
    await expect(staff.prepare(bossId, { organizationId: labsId, existingPersonId: privileged.id, roleId, scopeDecisionReference: "scope-review-007" })).rejects.toThrow();
  });
  it("requires Boss-reviewed manager decisions before an older draft can be invited", async () => {
    const draft = await staff.prepare(bossId, { organizationId: labsId, displayName: "Pending synthetic developer", email: email(), roleId, scopeDecisionReference: "scope-review-005" });
    await expect(invite.send(bossId, { userId: draft.id, verificationEvidence: "synthetic identity checked" })).rejects.toThrow();
    await staff.reviewDraft(bossId, { userId: draft.id, scopeDecisionReference: "scope-review-006", managerUserId: managerId, managerDecisionReference: "manager-review-006" });
    expect((await db.user.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("INACTIVE");
    expect(await db.auditEvent.count({ where: { entityId: draft.id, action: "staff.onboarding_decisions_reviewed" } })).toBe(1);
    await invite.send(bossId, { userId: draft.id, verificationEvidence: "synthetic identity checked" });
    expect((await db.emailAuthChallenge.findFirstOrThrow({ where: { userId: draft.id, purpose: "STAFF_INVITE" } })).status).toBe("SENT");
  });
});
