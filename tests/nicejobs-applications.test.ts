import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeGroupStructure } from "@/server/group/structure";
import { workforcePermissions } from "@/server/authorization/registry";
import { createNiceJobsService } from "@/server/nicejobs/service";
import { createApplicationService } from "@/server/nicejobs/applications";
import { configuration } from "@/server/nicejobs/input";
import { applicationConfiguration, validateAnswers, evaluate } from "@/server/nicejobs/application-configuration";
import { validRecipient } from "@/server/domain/operations-scope";
import { createOperationsService } from "@/server/domain/operations-service";

const directory = mkdtempSync(join(tmpdir(), "nicejobs-phase02-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") }), jobs = createNiceJobsService(db), applications = createApplicationService(db);
let company: string, labs: string, startup: string, career: string, foreign: string;
let manager: string, reader: string, candidate: string, other: string, outsider: string, roleId: string;
let versionId: string;
const config = { schemaVersion: 1, application: { fields: [{ key: "experience", label: "Experience", type: "NUMBER", required: true }, { key: "answer", label: "Screening answer", type: "SELECT", options: ["Yes", "No"], required: true }], rejectionCategories: ["Criteria not met"] }, eligibility: { rules: [{ field: "experience", operator: "GTE", value: 2 }] }, screening: { questions: [{ field: "answer", operator: "EQ", value: "Yes", weight: 3, required: true }], passMark: 80 } };
async function human(email: string, org: string, keys: string[], descendants = false) {
  const person = await db.person.create({ data: { displayName: email.split("@")[0] } });
  const user = await db.user.create({ data: { email, personId: person.id } });
  const role = await db.role.create({ data: { key: person.id, name: "Explicit test authority", organizationId: org, permissions: { create: [...new Set(keys)].map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { personId: person.id, organizationId: org, scope: descendants ? "DESCENDANTS" : "ORGANIZATION", roles: { create: { roleId: role.id } } } });
  return { id: user.id, roleId: role.id, personId: person.id };
}
async function publish(raw: unknown = config, code = "TEST-PHASE02") {
  const v = await jobs.create(manager, { code, title: "Isolated screening fixture", visibility: "PUBLIC", divisionIds: [labs], configuration: raw });
  await jobs.changeJob(manager, { id: v.id, revision: 0, to: "PUBLISHED", reason: "Isolated test publication" });
  return v.id;
}
async function submitted(userId = candidate, answers = { experience: 3, answer: "Yes" }) {
  const a = await applications.create(userId, { versionId, divisionId: labs });
  return applications.mutate(userId, { reference: a.reference, revision: 0, action: "SUBMIT", answers });
}
async function decision(a: Awaited<ReturnType<typeof submitted>>, action: string, extra = {}) {
  return applications.mutate(manager, { reference: a.reference, revision: a.revision, action, reason: "Human test review", ...extra });
}
beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  sql.close(); await db.$transaction(initializeGroupStructure);
  for (const p of workforcePermissions) await db.permission.upsert({ where: { key: p.key }, update: {}, create: p });
  await db.permission.upsert({ where: { key: "organization.read" }, update: {}, create: { key: "organization.read", name: "Read organization", scope: "GROUP" } });
  const org = async (slug: string) => (await db.organization.findUniqueOrThrow({ where: { slug } })).id;
  company = await org("aira-skill-city"); labs = await org("aira-labs"); startup = await org("aira-startup-school"); career = await org("aira-career-hub"); foreign = await org("pearn");
  const managedKeys = workforcePermissions.filter(p => p.key.startsWith("nicejobs.") || p.key === "person.read").map(p => p.key);
  const m = await human("manager@test.invalid", company, managedKeys, true); manager = m.id; roleId = m.roleId;
  reader = (await human("reader@test.invalid", labs, ["nicejobs.application.read"])).id;
  const candidateKeys = ["organization.read", "nicejobs.application.self", "notification.read"];
  candidate = (await human("candidate@test.invalid", career, candidateKeys)).id;
  other = (await human("other@test.invalid", career, candidateKeys)).id;
  outsider = (await human("outsider@test.invalid", foreign, [...managedKeys, ...candidateKeys], true)).id;
}, 30000);
beforeEach(async () => {
  await db.niceJobsApplicationHistory.deleteMany(); await db.niceJobsApplication.deleteMany(); await db.niceJobsApplicationSequence.deleteMany(); await db.notification.deleteMany(); await db.notificationPreference.deleteMany();
  await db.niceJobsTemplate.updateMany({ data: { publishedVersionId: null } }); await db.niceJobsVersionArea.deleteMany(); await db.niceJobsVersion.deleteMany(); await db.niceJobsTemplate.deleteMany();
  versionId = await publish();
});
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
describe("Nice Jobs applications and screening", () => {
  it("intentionally publishes the two accepted internal jobs for applications without inventing criteria", async () => {
    const known = await jobs.seedKnown(manager);
    for (const v of known) {
      const detail = await jobs.detail(manager, v.id);
      await expect(jobs.visibility(outsider, { id: v.id, revision: detail.version.template.revision, to: "PUBLIC", reason: "Forged publication audience" })).rejects.toThrow();
      await jobs.visibility(manager, { id: v.id, revision: detail.version.template.revision, to: "PUBLIC", reason: "Human audience decision in isolated test" });
      await jobs.changeJob(manager, { id: v.id, revision: v.revision, to: "PUBLISHED", reason: "Human publication" });
      const publicJob = (await applications.opportunities(candidate, { versionId: v.id })).records[0];
      const a = await applications.create(candidate, { versionId: v.id, divisionId: publicJob.areas[0].divisionId });
      const submitted = await applications.mutate(candidate, { reference: a.reference, revision: 0, action: "SUBMIT", answers: {} });
      expect(submitted.eligibilityStatus).toBe("NOT_CONFIGURED"); expect(submitted.screeningStatus).toBe("NOT_CONFIGURED");
      await expect(jobs.visibility(manager, { id: v.id, revision: detail.version.template.revision + 1, to: "INTERNAL", reason: "Published audience change" })).rejects.toThrow();
    }
    expect(known).toHaveLength(2);
  });
  it("lists only public current published opportunities and receives authenticated candidates without duplicate identities", async () => {
    const people = await db.person.count(), users = await db.user.count();
    expect((await applications.opportunities(candidate)).records.map(v => v.id)).toEqual([versionId]);
    const a = await submitted(); expect(a.applicationId).toMatch(/^NJ-\d{4}-000001$/);
    expect(await db.person.count()).toBe(people); expect(await db.user.count()).toBe(users); expect(await db.niceJobsAssignment.count()).toBe(0);
  });
  it("rejects draft, review, paused, archived, historical and internal job submissions", async () => {
    const draft = await jobs.create(manager, { code: "DRAFT-TEST", title: "Draft", divisionIds: [labs], visibility: "PUBLIC" });
    await expect(applications.create(candidate, { versionId: draft.id, divisionId: labs })).rejects.toThrow();
    await jobs.changeJob(manager, { id: draft.id, revision: 0, to: "REVIEW", reason: "Review test" });
    await expect(applications.create(candidate, { versionId: draft.id, divisionId: labs })).rejects.toThrow();
    let v = (await jobs.detail(manager, versionId)).version;
    await jobs.changeJob(manager, { id: v.id, revision: v.template.revision, to: "PAUSED", reason: "Pause test" });
    await expect(applications.create(candidate, { versionId, divisionId: labs })).rejects.toThrow();
    v = (await jobs.detail(manager, versionId)).version;
    await jobs.changeJob(manager, { id: v.id, revision: v.template.revision, to: "ARCHIVED", reason: "Archive test" });
    await expect(applications.create(candidate, { versionId, divisionId: labs })).rejects.toThrow();
    expect((await applications.opportunities(candidate)).records).toEqual([]);
  });
  it("enforces required fields server-side, resumes drafts and rejects unknown fields/types and forged results", async () => {
    const a = await applications.create(candidate, { versionId, divisionId: labs });
    await expect(applications.mutate(candidate, { reference: a.reference, revision: 0, action: "SUBMIT", answers: {} })).rejects.toThrow("Required");
    await expect(applications.mutate(candidate, { reference: a.reference, revision: 0, action: "SUBMIT", answers: { experience: "3", answer: "Yes" } })).rejects.toThrow();
    await expect(applications.mutate(candidate, { reference: a.reference, revision: 0, action: "SUBMIT", answers: { experience: 3, answer: "Yes", status: "SHORTLISTED" } })).rejects.toThrow();
    await expect(applications.mutate(candidate, { reference: a.reference, revision: 0, action: "SUBMIT", screeningStatus: "PASSED" })).rejects.toThrow();
    const saved = await applications.mutate(candidate, { reference: a.reference, revision: 0, action: "SAVE", answers: { experience: 3 } });
    expect((await applications.detail(candidate, a.reference, true)).answers).toEqual({ experience: 3 });
    const done = await applications.mutate(candidate, { reference: a.reference, revision: saved.revision, action: "SUBMIT", answers: { experience: 3, answer: "Yes" } });
    expect(done.status).toBe("SUBMITTED");
  });
  it("assigns unique database numbers and rejects duplicate submissions without consuming another number", async () => {
    const a = await submitted(), b = await submitted(other); expect(a.applicationId).not.toBe(b.applicationId);
    await expect(applications.mutate(candidate, { reference: a.reference, revision: 0, action: "SUBMIT", answers: { experience: 3, answer: "Yes" } })).rejects.toThrow();
    expect((await db.niceJobsApplicationSequence.findFirstOrThrow()).value).toBe(2);
  });
  it("permits only one concurrent submission, preserving numbering and one audited transition", async () => {
    const a = await applications.create(candidate, { versionId, divisionId: labs });
    const command = { reference: a.reference, revision: 0, action: "SUBMIT", answers: { experience: 3, answer: "Yes" } };
    const results = await Promise.allSettled([applications.mutate(candidate, command), applications.mutate(candidate, command)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await db.niceJobsApplicationSequence.findFirstOrThrow()).value).toBe(1);
    expect(await db.niceJobsApplicationHistory.count({ where: { action: "SUBMIT" } })).toBe(1);
  });
  it("pins historical applications to the immutable version while future versions allow separate applications", async () => {
    const a = await submitted(); const v = (await jobs.detail(manager, versionId)).version;
    const next = await jobs.newVersion(manager, versionId, v.template.revision);
    await jobs.changeJob(manager, { id: next.id, revision: 0, to: "PUBLISHED", reason: "Publish v2" });
    await expect(applications.create(other, { versionId, divisionId: labs })).rejects.toThrow();
    const second = await applications.create(candidate, { versionId: next.id, divisionId: labs });
    expect(second.reference).not.toBe(a.reference);
    expect((await db.niceJobsApplication.findUniqueOrThrow({ where: { reference: a.reference } })).versionId).toBe(versionId);
    expect((await applications.detail(manager, a.reference, false)).management?.version).toBe(1);
  });
  it("prevents cross-candidate IDOR and private enumeration, including human-readable IDs", async () => {
    const a = await submitted();
    await expect(applications.detail(other, a.reference, true)).rejects.toThrow();
    await expect(applications.detail(other, a.applicationId!, true)).rejects.toThrow();
    await expect(applications.mutate(other, { reference: a.reference, revision: a.revision, action: "WITHDRAW" })).rejects.toThrow();
    expect((await applications.list(other, true, { search: a.applicationId! })).records).toEqual([]);
  });
  it("enforces division and company management scope, active membership and active candidate identity", async () => {
    const a = await submitted();
    expect((await applications.list(reader, false)).records).toHaveLength(1);
    await expect(applications.list(reader, false, { divisionId: startup })).rejects.toThrow();
    await expect(applications.list(manager, false, { companyId: foreign })).rejects.toThrow();
    await expect(applications.detail(outsider, a.reference, false)).rejects.toThrow();
    await expect(applications.create(outsider, { versionId, divisionId: labs })).rejects.toThrow();
    const user = await db.user.findUniqueOrThrow({ where: { id: other } }); await db.person.update({ where: { id: user.personId! }, data: { status: "INACTIVE" } });
    try { await expect(applications.list(other, true)).rejects.toThrow(); } finally { await db.person.update({ where: { id: user.personId! }, data: { status: "ACTIVE" } }); }
  });
  it("evaluates configured eligibility and weighted screening, records evidence and stops at authorized shortlist", async () => {
    let a = await submitted(); a = await decision(a, "ELIGIBILITY"); expect(a).toMatchObject({ status: "SCREENING", eligibilityStatus: "ELIGIBLE" });
    a = await decision(a, "SCREENING"); expect(a.screeningStatus).toBe("PASSED");
    a = await decision(a, "SHORTLIST"); expect(a.status).toBe("SHORTLISTED");
    const history = (await applications.detail(manager, a.reference, false)).management!.history;
    expect(JSON.parse(history.find(h => h.action === "SCREENING")!.evidence!)).toMatchObject({ score: 100, passMark: 80, status: "PASSED" });
    expect(await db.niceJobsWorkerProfile.count()).toBe(0); expect(await db.niceJobsAssignment.count()).toBe(0);
  });
  it("does not shortlist ineligible, failed, unreviewed or unconfigured applications", async () => {
    let a = await submitted(candidate, { experience: 1, answer: "No" }); a = await decision(a, "ELIGIBILITY"); expect(a.eligibilityStatus).toBe("INELIGIBLE");
    await expect(decision(a, "SHORTLIST")).rejects.toThrow();
    let b = await submitted(other, { experience: 3, answer: "No" }); b = await decision(b, "ELIGIBILITY"); b = await decision(b, "SCREENING"); expect(b.screeningStatus).toBe("FAILED"); await expect(decision(b, "SHORTLIST")).rejects.toThrow();
  });
  it("allows authorized documented human review only after a recorded NEEDS_REVIEW evaluation", async () => {
    versionId = await publish({ ...config, eligibility: { rules: [{ field: "experience", operator: "GTE", value: 2, review: true }] }, screening: { questions: [{ field: "answer", operator: "EQ", value: "Yes", weight: 1, review: true }], passMark: 80 } }, "HUMAN-REVIEW");
    let a = await submitted();
    await expect(decision(a, "ELIGIBILITY_REVIEW", { reviewResult: "ELIGIBLE" })).rejects.toThrow();
    a = await decision(a, "ELIGIBILITY"); expect(a.eligibilityStatus).toBe("NEEDS_REVIEW");
    await expect(applications.mutate(candidate, { reference: a.reference, revision: a.revision, action: "ELIGIBILITY_REVIEW", reason: "Self-approval", reviewResult: "ELIGIBLE" })).rejects.toThrow();
    a = await decision(a, "ELIGIBILITY_REVIEW", { reviewResult: "ELIGIBLE" }); a = await decision(a, "SCREENING"); expect(a.screeningStatus).toBe("NEEDS_REVIEW");
    a = await decision(a, "SCREENING_REVIEW", { reviewResult: "PASSED" }); a = await decision(a, "SHORTLIST"); expect(a.status).toBe("SHORTLISTED");
    expect((await applications.detail(manager, a.reference, false)).management!.history.some(h => h.action === "SCREENING_REVIEW" && JSON.parse(h.evidence!).humanReview)).toBe(true);
  });
  it("handles genuinely missing eligibility and screening explicitly as NOT CONFIGURED", async () => {
    versionId = await publish(null, "NO-CRITERIA");
    let a = await submitted(candidate, {} as { experience: number; answer: string }); expect(a.eligibilityStatus).toBe("NOT_CONFIGURED"); expect(a.screeningStatus).toBe("NOT_CONFIGURED");
    a = await decision(a, "ELIGIBILITY"); expect(a).toMatchObject({ eligibilityStatus: "NOT_CONFIGURED", status: "ELIGIBILITY_REVIEW" }); await expect(decision(a, "SHORTLIST")).rejects.toThrow();
  });
  it("requires separate explicit management decision capabilities, never a role title or candidate permission", async () => {
    const a = await submitted();
    await expect(applications.mutate(candidate, { reference: a.reference, revision: a.revision, action: "REJECT", reason: "Forged decision" })).rejects.toThrow();
    await expect(applications.mutate(reader, { reference: a.reference, revision: a.revision, action: "ELIGIBILITY", reason: "Unauthorized" })).rejects.toThrow();
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "nicejobs.application.evaluate" } });
    await db.rolePermission.delete({ where: { roleId_permissionId: { roleId, permissionId: permission.id } } });
    try { await expect(decision(a, "ELIGIBILITY")).rejects.toThrow(); } finally { await db.rolePermission.create({ data: { roleId, permissionId: permission.id } }); }
  });
  it("preserves rejection reason/category and separates candidate messages from private evaluation/audit", async () => {
    let a = await submitted();
    await expect(decision(a, "REJECT")).rejects.toThrow("category");
    a = await decision(a, "REJECT", { category: "Criteria not met", candidateMessage: "Thank you for applying." });
    const own = await applications.detail(candidate, a.reference, true), management = await applications.detail(manager, a.reference, false);
    expect(own.management).toBeNull(); expect(own.candidateMessage).toBe("Thank you for applying."); expect(JSON.stringify(own)).not.toContain("Human test review"); expect(JSON.stringify(own)).not.toContain("passMark");
    expect(management.management!.history[0]).toMatchObject({ internalReason: "Human test review", action: "REJECT" });
    expect((await decision(a, "CLOSE")).status).toBe("CLOSED");
  });
  it("permits own withdrawal before shortlist and prevents withdrawal/decision replay and later irreversible changes", async () => {
    let a = await submitted(); const old = a;
    a = await applications.mutate(candidate, { reference: a.reference, revision: a.revision, action: "WITHDRAW" }); expect(a.status).toBe("WITHDRAWN");
    await expect(applications.mutate(candidate, { reference: old.reference, revision: old.revision, action: "WITHDRAW" })).rejects.toThrow();
    await expect(applications.mutate(candidate, { reference: a.reference, revision: a.revision, action: "WITHDRAW" })).rejects.toThrow();
    let b = await submitted(); b = await decision(b, "ELIGIBILITY"); b = await decision(b, "SCREENING"); b = await decision(b, "SHORTLIST");
    await expect(applications.mutate(candidate, { reference: b.reference, revision: b.revision, action: "WITHDRAW" })).rejects.toThrow(); await expect(decision(b, "REJECT")).rejects.toThrow();
  });
  it("uses database active uniqueness across divisions and configurable one-per-version terminal policy", async () => {
    let a = await submitted(); await expect(applications.create(candidate, { versionId, divisionId: labs })).rejects.toThrow("already exists");
    a = await applications.mutate(candidate, { reference: a.reference, revision: a.revision, action: "WITHDRAW" }); expect(a.status).toBe("WITHDRAWN"); expect(await applications.create(candidate, { versionId, divisionId: labs })).toMatchObject({ status: "DRAFT" });
    versionId = await publish({ ...config, application: { ...config.application, duplicatePolicy: "ONE_PER_VERSION" } }, "ONCE-PER-VERSION");
    const b = await submitted(); await applications.mutate(candidate, { reference: b.reference, revision: b.revision, action: "WITHDRAW" }); await expect(applications.create(candidate, { versionId, divisionId: labs })).rejects.toThrow("already exists");
  });
  it("rolls back mutation, numbering, history and notification when mandatory audit fails", async () => {
    const a = await applications.create(candidate, { versionId, divisionId: labs });
    await db.$executeRawUnsafe("CREATE TRIGGER phase02_audit_failure BEFORE INSERT ON AuditEvent BEGIN SELECT RAISE(ABORT, 'audit failure'); END");
    try { await expect(applications.mutate(candidate, { reference: a.reference, revision: 0, action: "SUBMIT", answers: { experience: 3, answer: "Yes" } })).rejects.toThrow(); } finally { await db.$executeRawUnsafe("DROP TRIGGER phase02_audit_failure"); }
    expect(await db.niceJobsApplicationSequence.count()).toBe(0); expect(await db.notification.count()).toBe(0); expect((await applications.detail(candidate, a.reference, true)).status).toBe("DRAFT"); expect(await db.niceJobsApplicationHistory.count()).toBe(1);
  });
  it("reuses recipient-scoped internal notifications and honors in-app opt-out without providers", async () => {
    const a = await submitted(); expect(await db.notification.count({ where: { recipientUserId: candidate } })).toBe(1); expect(await db.notification.count({ where: { recipientUserId: other } })).toBe(0);
    const notification = await db.notification.findFirstOrThrow(); expect(notification.resourceType).toBe("NICE_JOBS_APPLICATION");
    await expect(validRecipient(db, other, notification)).rejects.toThrow();
    await expect(validRecipient(db, candidate, { ...notification, organizationId: labs })).rejects.toThrow();
    const operations = createOperationsService(db);
    await expect(operations.markRead(other, notification.id)).rejects.toThrow();
    await operations.markRead(candidate, notification.id);
    await db.notificationPreference.create({ data: { userId: candidate, type: "NICE_JOBS_APPLICATION", channel: "IN_APP", enabled: false } });
    await decision(a, "ELIGIBILITY"); expect(await db.notification.count()).toBe(1);
  });
  it("reserves lifecycle event namespaces so reported events cannot forge recruitment decisions", async () => {
    const operations = createOperationsService(db);
    await expect(operations.registerEvent(manager, { organizationId: labs, resourceType: "ORGANIZATION", resourceId: labs, eventType: "nicejobs.application.shortlisted", reference: "forged-report", status: "SUCCEEDED" })).rejects.toThrow();
  });
  it("validates all supported field types and conditional requirements; document self-claims require review", () => {
    const form = applicationConfiguration.parse({ fields: [{ key: "yes", label: "Yes", type: "BOOLEAN", required: true }, { key: "detail", label: "Details", type: "TEXTAREA", required: true, when: { field: "yes", operator: "EQ", value: true } }, { key: "email", label: "Email", type: "EMAIL" }, { key: "phone", label: "Phone", type: "PHONE" }, { key: "date", label: "Date", type: "DATE" }, { key: "choices", label: "Choices", type: "MULTI_SELECT", options: ["A", "B"] }, { key: "doc", label: "Document", type: "DOCUMENT_REFERENCE" }, { key: "name", label: "Name", type: "TEXT" }] });
    expect(validateAnswers(form, { yes: false }, true)).toEqual({ yes: false }); expect(() => validateAnswers(form, { yes: true }, true)).toThrow("Required");
    expect(() => validateAnswers(form, { yes: false, detail: "Hidden" }, true)).toThrow("Inactive"); expect(() => validateAnswers(form, { yes: false, date: "2026-02-30" }, true)).toThrow();
    expect(validateAnswers(form, { yes: true, detail: "Visible", email: "candidate@test.invalid", phone: "+919876543210", date: "2026-10-07", choices: ["A"], doc: "reviewed:reference", name: "Name" }, true)).toHaveProperty("doc");
    expect(evaluate({ application: form, eligibility: { rules: [{ field: "doc", operator: "EQ", value: "reviewed:reference" }] } }, { doc: "reviewed:reference" }, "eligibility").status).toBe("NEEDS_REVIEW");
    expect(evaluate({ application: form, eligibility: { rules: [{ field: "doc", operator: "EQ", value: "reviewed:reference" }, { field: "yes", operator: "EQ", value: true }] } }, { doc: "reviewed:reference", yes: false }, "eligibility").status).toBe("INELIGIBLE");
    expect(configuration.safeParse({ ...config, eligibility: { rules: [{ field: "unknown", operator: "EQ", value: "x" }] } }).success).toBe(false);
  });
  it("paginates and filters a large scoped fixture with bounded output and stable indexed keysets", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: candidate } });
    const started = performance.now();
    await db.niceJobsApplication.createMany({ data: Array.from({ length: 5000 }, (_, i) => ({ id: `scale-${String(i).padStart(6, "0")}`, reference: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, applicationId: `NJ-2026-${String(i + 1).padStart(6, "0")}`, candidateId: user.personId!, creatorUserId: candidate, companyId: company, versionId, divisionId: labs, status: i % 2 ? "REJECTED" : "SUBMITTED", submittedAt: new Date() })) });
    const first = await applications.list(candidate, true, { status: "SUBMITTED", limit: 100 }), second = await applications.list(candidate, true, { status: "SUBMITTED", limit: 100, after: first.nextCursor! });
    expect(first.records).toHaveLength(100); expect(second.records).toHaveLength(100); expect(new Set([...first.records, ...second.records].map(r => r.reference)).size).toBe(200);
    expect((await applications.list(manager, false, { search: "NJ-2026-000010" })).records).toHaveLength(1); expect(performance.now() - started).toBeLessThan(30000);
  });
});
