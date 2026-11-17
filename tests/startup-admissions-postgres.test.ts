import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createPostgresFixture } from "./helpers/postgres-fixture";
import { workforcePermissions } from "@/server/authorization/registry";
import { provisionBoss } from "@/server/group/provision";
import { createStartupPublicAdmissions } from "@/server/portals/startup-public-admissions";
import { createStartupAdmissionsDesk } from "@/server/skillcity/startup-admissions-desk";
import { createStartupApplications } from "@/server/portals/startup-applications";
import { createStartupAdmissionIntakes } from "@/server/group/startup-admission-intakes";

const postgres = createPostgresFixture();
const db = postgres.db;
const authSecret = randomBytes(32).toString("base64url");
const otpSecret = randomBytes(32).toString("base64url");
const otpCode = "314159";
let clock = new Date();
const publicAdmissions = createStartupPublicAdmissions(db, {
  env: { AUTH_SECRET: authSecret, STARTUP_PUBLIC_OTP_SECRET: otpSecret, STARTUP_OTP_SIMULATOR_ENABLED: "true", STARTUP_OTP_SIMULATOR_CODE: otpCode },
  nodeEnv: "test", now: () => clock
});
const desk = createStartupAdmissionsDesk(db);
const leadership = createStartupApplications(db);
let bossUserId = "", companyId = "", startupDivisionId = "", brandId = "", officerUserId = "";
let applicantId = "", applicantCookie = "", appReference = "";
let programId = "", batchId = "", centreId = "";

beforeAll(async () => {
  await postgres.initialize();
  const boss = await provisionBoss(db, { BOSS_PIN: "481526" });
  bossUserId = boss.userId;
  companyId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" }, select: { id: true } })).id;
  startupDivisionId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-startup-school" }, select: { id: true } })).id;
  brandId = (await db.brand.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: companyId, slug: "startup-school" } }, select: { id: true } })).id;

  const product = await db.product.create({ data: { organizationId: companyId, divisionId: startupDivisionId, brandId, name: "Synthetic PBA product", slug: "pba", type: "PROGRAMME", lifecycle: "ACTIVE" } });
  const program = await db.program.create({ data: { companyOrganizationId: companyId, organizationId: startupDivisionId, brandId, productId: product.id, name: "PBA Starter", slug: `pba-starter-${randomUUID()}`, status: "ACTIVE", durationDays: 30, capacity: 1 } });
  programId = program.id;
  const location = await db.location.create({ data: { companyOrganizationId: companyId, organizationId: startupDivisionId, name: "Synthetic test centre", type: "OTHER", status: "ACTIVE", city: "Test City", region: "Test State" } });
  centreId = location.id;
  const batch = await db.batch.create({ data: { programId, name: "Synthetic open intake", status: "ACTIVE", startDate: new Date(clock.getTime() - 86400000), endDate: new Date(clock.getTime() + 86400000 * 30), capacity: 1, locationId: location.id } });
  batchId = batch.id;

  const person = await db.person.create({ data: { displayName: "Synthetic Admissions Officer" } });
  const officer = await db.user.create({ data: { email: `ao-${randomUUID()}@startup-test.invalid`, personId: person.id, emailVerifiedAt: clock } });
  officerUserId = officer.id;
  await db.employment.create({ data: { personId: person.id, companyId, status: "ACTIVE", startDate: clock, designation: "Administrative Officer", contactEmail: officer.email } });
  const role = await db.role.create({ data: { organizationId: companyId, key: "aira-administrative-officer", name: "Administrative Officer", principalType: "HUMAN", category: "Synthetic test role" } });
  const requiredPermissions = ["organization.read", "startup.application.read", "startup.application.triage"];
  for (const key of requiredPermissions) {
    const permission = workforcePermissions.find(item => item.key === key) ?? { key, name: key, scope: "GROUP" as const };
    const savedPermission = await db.permission.upsert({ where: { key }, create: permission, update: {} });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: savedPermission.id } });
  }
  const membership = await db.membership.create({ data: { organizationId: companyId, personId: person.id, scope: "DESCENDANTS" } });
  await db.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
}, 120000);

afterAll(() => postgres.dispose(), 30000);

describe("Startup Skool PostgreSQL admissions acceptance", () => {
  it("persists a public SIA application through OTP, status lookup, AO work and leadership review", async () => {
    const beforeUsers = await db.user.count();
    const draft = await publicAdmissions.createDraft(undefined, "acceptance-public-applicant");
    applicantCookie = draft.cookie;
    applicantId = draft.cookie.split(".")[0]!;
    appReference = (await db.startupPublicApplicant.findUniqueOrThrow({ where: { id: applicantId }, select: { reference: true } })).reference;
    await expect(publicAdmissions.readDraft(`${applicantId}.${randomBytes(32).toString("base64url")}`)).rejects.toThrow();

    const answers = {
      fullName: "Synthetic SIA Applicant", mobile: "+919876500001", email: "applicant@startup-test.invalid",
      state: "Test State", district: "Test District", programPreference: "PBA_30_DAYS" as const,
      entrepreneurialStage: "I have a business idea", businessInterest: "A local service business idea for this database acceptance run",
      goals: "Test how I can validate my business idea with customers", preferredCentre: "Synthetic test centre", referralInfo: "synthetic acceptance referral"
    };
    await publicAdmissions.updateDraft(applicantCookie, answers, "acceptance-public-applicant");
    expect((await publicAdmissions.readDraft(applicantCookie)).answers).toMatchObject({ fullName: answers.fullName, programPreference: answers.programPreference });
    const challenge = await publicAdmissions.sendOtp(applicantCookie, { mobile: answers.mobile }, "acceptance-public-applicant");
    expect(await db.startupOtpChallenge.count({ where: { applicantId, status: "SENT" } })).toBe(1);
    for (let attempt = 0; attempt < 5; attempt++) await expect(publicAdmissions.verifyOtp(applicantCookie, { challengeId: challenge.challengeId, code: "000000" }, "acceptance-public-applicant")).rejects.toThrow(/invalid|too many/i);
    expect(await db.startupOtpChallenge.findUniqueOrThrow({ where: { id: challenge.challengeId }, select: { attempts: true, status: true } })).toMatchObject({ attempts: 5, status: "LOCKED" });
    await expect(publicAdmissions.sendOtp(applicantCookie, { mobile: answers.mobile }, "acceptance-public-applicant")).rejects.toThrow();
    clock = new Date(clock.getTime() + 61_000);
    const replacement = await publicAdmissions.sendOtp(applicantCookie, { mobile: answers.mobile }, "acceptance-public-applicant");
    await publicAdmissions.verifyOtp(applicantCookie, { challengeId: replacement.challengeId, code: otpCode }, "acceptance-public-applicant");
    expect((await publicAdmissions.readDraft(applicantCookie)).verified).toBe(true);

    const open = await createStartupAdmissionIntakes(db).publicAvailability(clock);
    expect(open.programs.map(item => item.code)).toContain("PBA_30_DAYS");
    const receipt = await publicAdmissions.submit(applicantCookie, { ...answers, consent: true });
    expect(receipt).toMatchObject({ applicantName: answers.fullName, status: "SUBMITTED", duplicate: false });
    expect(await db.startupPublicApplicant.count({ where: { id: applicantId, status: "SUBMITTED", consentVersion: "startup-public-sia-v1", phoneVerifiedAt: { not: null } } })).toBe(1);
    expect(await db.user.count()).toBe(beforeUsers);
    expect((await publicAdmissions.submit(applicantCookie, { ...answers, consent: true })).duplicate).toBe(true);
    expect(await publicAdmissions.status(applicantCookie, { reference: receipt.reference })).toMatchObject({ reference: appReference, status: "SUBMITTED" });

    await desk.assignBoss(bossUserId, brandId, { caseId: `public:${applicantId}`, assignedUserId: officerUserId, reason: "Assign synthetic application to the test officer." });
    const inbox = await desk.page(officerUserId);
    expect(inbox.cases.map(item => item.id)).toContain(`public:${applicantId}`);
    await expect(desk.page("unassigned-synthetic-user")).rejects.toThrow();
    const otherBrandId = (await db.brand.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: companyId, slug: "aira-labs" } }, select: { id: true } })).id;
    await expect(leadership.reviewForBoss(bossUserId, otherBrandId, { id: `public:${applicantId}`, version: 0, decision: "APPROVED", reason: "Cross-brand review must be denied." })).rejects.toThrow();
    await desk.addFollowup(officerUserId, { caseId: `public:${applicantId}`, contactMethod: "CALL", outcome: "CONTACTED", note: "Synthetic acceptance contact attempt recorded.", nextFollowUpAt: new Date(clock.getTime() + 86400000).toISOString() });
    expect(await db.startupAdmissionFollowUp.count({ where: { applicantId, actorUserId: officerUserId, status: "OPEN" } })).toBe(1);
    const savedFollowup = await db.startupAdmissionFollowUp.findFirstOrThrow({ where: { applicantId, actorUserId: officerUserId }, select: { id: true, note: true } });
    const taskView = await desk.page(officerUserId, { tasks: "all" });
    expect(taskView.followups.some(item => item.caseId === `public:${applicantId}` && item.note === savedFollowup.note)).toBe(true);
    await desk.completeFollowup(officerUserId, { caseId: `public:${applicantId}`, followUpId: savedFollowup.id });
    expect(await db.startupAdmissionFollowUp.count({ where: { id: savedFollowup.id, status: "COMPLETED" } })).toBe(1);
    await desk.forward(officerUserId, { caseId: `public:${applicantId}`, outcome: "READY_FOR_LEADERSHIP_REVIEW", reviewNote: "Synthetic review complete; verified contact, programme, and location.", contactVerified: "yes", programReviewed: "yes", locationReviewed: "yes" });
    const inReview = await db.startupPublicApplicant.findUniqueOrThrow({ where: { id: applicantId }, select: { status: true, version: true } });
    expect(inReview.status).toBe("IN_REVIEW");
    await expect(leadership.reviewForBoss(bossUserId, brandId, { id: `public:${applicantId}`, version: inReview.version - 1, decision: "APPROVED", reason: "Stale version must not be accepted." })).rejects.toThrow();
    await leadership.reviewForBoss(bossUserId, brandId, { id: `public:${applicantId}`, version: inReview.version, decision: "APPROVED", reason: "Synthetic acceptance decision after independent review." });
    await expect(leadership.reviewForBoss(bossUserId, brandId, { id: `public:${applicantId}`, version: inReview.version, decision: "REJECTED", reason: "A duplicate decision must be rejected." })).rejects.toThrow();
    const final = await db.startupPublicApplicant.findUniqueOrThrow({ where: { id: applicantId }, select: { status: true, events: { select: { action: true, actorUserId: true } } } });
    expect(final.status).toBe("APPROVED");
    expect(final.events.some(event => event.action === "PUBLIC_APPLICATION_FORWARDED_TO_LEADERSHIP" && event.actorUserId === officerUserId)).toBe(true);
    expect(final.events.some(event => event.action === "PUBLIC_APPLICATION_APPROVED" && event.actorUserId === bossUserId)).toBe(true);
    expect(await db.batchParticipant.count({ where: { batchId } })).toBe(0);
  }, 120000);

  it("rejects an expired OTP and hides closed or capacity-full intakes", async () => {
    const draft = await publicAdmissions.createDraft(undefined, "acceptance-expired-otp");
    const expired = await publicAdmissions.sendOtp(draft.cookie, { mobile: "+919876500002" }, "acceptance-expired-otp");
    clock = new Date(clock.getTime() + 11 * 60_000);
    await db.batch.update({ where: { id: batchId }, data: { status: "PLANNED" } });
    const closed = await createStartupAdmissionIntakes(db).publicAvailability(clock);
    expect(closed.programs).toEqual([]);
    await db.batch.update({ where: { id: batchId }, data: { status: "ACTIVE", capacity: 1, startDate: new Date(clock.getTime() + 86400000) } });
    const notStarted = await createStartupAdmissionIntakes(db).publicAvailability(clock);
    expect(notStarted.programs).toEqual([]);
    await db.batch.update({ where: { id: batchId }, data: { status: "ACTIVE", capacity: 1, startDate: new Date(clock.getTime() - 86400000) } });
    await db.location.update({ where: { id: centreId }, data: { status: "PLANNED" } });
    const inactiveCentre = await createStartupAdmissionIntakes(db).publicAvailability(clock);
    expect(inactiveCentre.programs).toEqual([]);
    await db.location.update({ where: { id: centreId }, data: { status: "ACTIVE" } });
    await db.batch.update({ where: { id: batchId }, data: { status: "ACTIVE", capacity: 0 } });
    const full = await createStartupAdmissionIntakes(db).publicAvailability(clock);
    expect(full.programs).toEqual([]);
    const intakes = createStartupAdmissionIntakes(db);
    const current = await intakes.list(bossUserId, brandId);
    const row = current.batches.find(item => item.id === batchId)!;
    const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
    await intakes.save(bossUserId, brandId, { id: batchId, version: row.updatedAt.toISOString(), programId, name: row.name, startDate: dateOnly(clock), endDate: dateOnly(new Date(clock.getTime() + 86400000 * 30)), capacity: 1, locationId: centreId, open: false });
    expect(await db.batch.findUniqueOrThrow({ where: { id: batchId }, select: { status: true } })).toMatchObject({ status: "PLANNED" });
    await expect(publicAdmissions.verifyOtp(draft.cookie, { challengeId: expired.challengeId, code: otpCode }, "acceptance-expired-otp")).rejects.toThrow(/invalid or expired/i);
    expect((await publicAdmissions.readDraft(draft.cookie)).verified).toBe(false);
  });

  it("records reject, clarification and return decisions with actor history and replay protection", async () => {
    const decisions = ["REJECTED", "CLARIFICATION_REQUIRED", "RETURNED_TO_AO"] as const;
    for (const [index, decision] of decisions.entries()) {
      const mobile = `+9198765000${String(index + 10)}`;
      const row = await db.startupPublicApplicant.create({ data: {
        organizationId: companyId,
        reference: `SIA-${randomBytes(9).toString("hex").toUpperCase()}`,
        possessionSecretHash: randomBytes(32).toString("hex"),
        fullName: `Synthetic ${decision} applicant`, mobile, normalizedMobile: mobile,
        programPreference: "PBA_30_DAYS", status: "IN_REVIEW", phoneVerifiedAt: clock,
        consentVersion: "startup-public-sia-v1", consentedAt: clock, submittedAt: clock,
        expiresAt: new Date(clock.getTime() + 86400000)
      } });
      await db.startupAdmissionAssignment.create({ data: { applicantId: row.id, assignedUserId: officerUserId, status: "ACTIVE" } });
      await leadership.reviewForBoss(bossUserId, brandId, { id: `public:${row.id}`, version: 0, decision, reason: `Synthetic leadership decision: ${decision}.` });
      const saved = await db.startupPublicApplicant.findUniqueOrThrow({ where: { id: row.id }, select: { status: true, events: { where: { action: `PUBLIC_APPLICATION_${decision}` }, select: { actorUserId: true } } } });
      expect(saved.status).toBe(decision);
      expect(saved.events).toEqual([{ actorUserId: bossUserId }]);
      await expect(leadership.reviewForBoss(bossUserId, brandId, { id: `public:${row.id}`, version: 0, decision: "APPROVED", reason: "A duplicate decision must not be recorded." })).rejects.toThrow();
    }
    expect(await db.startupPublicApplicant.count({ where: { status: { in: [...decisions] } } })).toBe(decisions.length);
  });
});
