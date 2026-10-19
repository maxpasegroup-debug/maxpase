import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync, openSync, closeSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomInt, randomBytes } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import { provisionBoss } from "../src/server/group/provision";
import { createAuthenticationService } from "../src/server/auth/service";
import { createNiceJobsService } from "../src/server/nicejobs/service";
import { createApplicationService } from "../src/server/nicejobs/applications";
import { createRecruitmentService } from "../src/server/nicejobs/recruitment";
import { createOnboardingService } from "../src/server/nicejobs/onboarding";
import { createPerformanceService } from "../src/server/nicejobs/performance";
import { createEmployeeService } from "../src/server/nicejobs/employee";
import { createOperationsService } from "../src/server/domain/operations-service";

async function main() {
  const directory = mkdtempSync(join(tmpdir(), "nicejobs-performance-browser-")), file = join(directory, "test.db");
  const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
  const base = "http://127.0.0.1:3006", secret = randomBytes(32).toString("base64url");
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
  const log = openSync(join(directory, "server.log"), "w");
  let server: ReturnType<typeof spawn> | undefined, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let diagnostic: { locator: (selector: string) => { innerText: () => Promise<string> }; screenshot: (options: { path: string; fullPage: boolean }) => Promise<unknown> } | undefined;
  let stage = "fixture", screenshots = 0, errors = 0;
  try {
    const sql = new DatabaseSync(file); for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8")); sql.close();
    const boss = await provisionBoss(db, { BOSS_PIN: String(randomInt(100000, 1000000)) });
    const jobs = createNiceJobsService(db), applications = createApplicationService(db), auth = createAuthenticationService(db), operations = createOperationsService(db);
    const labs = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id, career = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-career-hub" } })).id;
    async function human(name: string, org: string, keys: string[]) {
      const person = await db.person.create({ data: { displayName: name + " with a deliberately long fixture name" } });
      const user = await db.user.create({ data: { email: name + "@phase08-fixture.invalid", personId: person.id, timezone: "Asia/Kolkata" } });
      const role = await db.role.create({ data: { key: person.id, name: "Explicit test capabilities", organizationId: org, permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
      await db.membership.create({ data: { personId: person.id, organizationId: org, roles: { create: { roleId: role.id } } } }); return user;
    }
    const candidate = await human("candidate", career, ["organization.read", "nicejobs.application.self", "nicejobs.onboarding.self", "notification.read"]);
    const interviewer = await human("interviewer", labs, ["nicejobs.application.read", "nicejobs.interview.read", "nicejobs.interview.evaluate", "nicejobs.ojt.review", "notification.read"]);
    const approver = await human("approver", labs, ["nicejobs.knowledge.read", "nicejobs.knowledge.review", "nicejobs.application.read", "nicejobs.management.review", "nicejobs.management.approve", "nicejobs.management.reject", "nicejobs.readiness.review", "approval.read", "approval.decide", "request.read", "control.read", "notification.read"]);
    const control = await operations.saveControl(boss.userId, { organizationId: labs, name: "Isolated hiring approval", kind: "HUMAN_DECISION", requiredPermission: "nicejobs.management.approve", stages: [[{ approverUserId: approver.id, requiredPermission: "nicejobs.management.approve" }]] });
    const trainingQuiz = { form: { fields: [{ key: "safe", label: "Synthetic safety question", type: "BOOLEAN", required: true }] }, assessment: { questions: [{ field: "safe", operator: "EQ", value: true, weight: 1, required: true }], passMark: 100 }, maxAttempts: 2 };
    const training = { orientation: { modules: [{ key: "welcome", title: "Synthetic introductory module", order: 1, lessons: [{ key: "intro", title: "Synthetic introduction lesson", type: "TEXT", text: "Browser fixture only, not real company content", completion: "ACKNOWLEDGE", order: 1 }, { key: "quiz", title: "Synthetic quiz", type: "QUIZ", completion: "QUIZ", quiz: trainingQuiz, order: 2 }] }] }, ojt: { stages: [{ key: "practice", title: "Synthetic practice stage", order: 1, activities: [{ key: "practice_evidence", title: "Synthetic practice", type: "PRACTICE", order: 1, instruction: "Describe fixture practice", expectedOutcome: "Independent fixture review", evidenceRequired: true, reviewRequired: true, maxAttempts: 2, dueDays: 1 }] }], assessment: { kind: "HUMAN", criteria: "Verify synthetic practice", maxAttempts: 2 } }, readiness: { requireAssessment: true, criteria: "All fixture requirements must be complete" } };
    const config = { ...training, schemaVersion: 1, application: { fields: [{ key: "experience", label: "Experience", type: "NUMBER", required: true }] }, eligibility: { rules: [{ field: "experience", operator: "GTE", value: 1 }] }, screening: { questions: [{ field: "experience", operator: "GTE", value: 1, weight: 1 }], passMark: 80 }, interview: { enabled: true, type: "VIDEO", duration: 30, questions: [{ key: "evidence", question: "Isolated interview evidence", type: "TEXT", required: true, order: 1, weight: 1 }] }, management: { policies: [{ divisionId: labs, controlPointId: control.id }] }, offer: { title: "Isolated fixture offer", content: { terms: "Test terms only; not a real employment offer", expectations: "Isolated test expectations" }, validityDays: 2, declineReasonRequired: true } };
    const job = await jobs.create(boss.userId, { code: "BROWSER-PHASE06", title: "Isolated recruitment position with a deliberately long title for mobile validation", visibility: "PUBLIC", divisionIds: [labs], configuration: config });
    await jobs.changeJob(boss.userId, { id: job.id, revision: 0, to: "PUBLISHED", reason: "Isolated publication" });
    let application = await applications.create(candidate.id, { versionId: job.id, divisionId: labs });
    application = await applications.mutate(candidate.id, { reference: application.reference, revision: 0, action: "SUBMIT", answers: { experience: 2 } });
    for (const action of ["ELIGIBILITY", "SCREENING", "SHORTLIST"]) application = await applications.mutate(boss.userId, { reference: application.reference, revision: application.revision, action, reason: "Isolated human review" });
    const past = new Date(Date.now() - 7200000), recruitment = createRecruitmentService(db, () => past);
    await recruitment.mutate(boss.userId, { reference: application.reference, revision: application.revision, operation: "CREATE_INTERVIEW", interviewerIds: [interviewer.id], reason: "Isolated interview assignment" });
    const app = await db.niceJobsApplication.findUniqueOrThrow({ where: { reference: application.reference } }), interview = await db.niceJobsInterview.findFirstOrThrow({ where: { applicationId: app.id } });
    await recruitment.mutate(boss.userId, { reference: application.reference, revision: app.revision, operation: "SCHEDULE", interviewReference: interview.reference, recordRevision: interview.revision, scheduledAt: new Date(Date.now() - 3600000).toISOString(), instructions: "Candidate-visible fixture instructions", reason: "Isolated historical schedule" });

    const fixtureRecruitment = createRecruitmentService(db);
    async function hiring(operation: string, actorId = boss.userId, extra = {}) { const a = await db.niceJobsApplication.findUniqueOrThrow({ where: { id: app.id } }); return fixtureRecruitment.mutate(actorId, { reference: a.reference, revision: a.revision, operation, reason: "Isolated human fixture preparation", ...extra }); }
    let round = await db.niceJobsInterview.findUniqueOrThrow({ where: { id: interview.id } });
    await hiring("EVALUATE", interviewer.id, { interviewReference: round.reference, recordRevision: round.revision, answers: { evidence: "Synthetic hiring evaluation" }, scores: { evidence: 8 }, recommendation: "RECOMMEND" });
    round = await db.niceJobsInterview.findUniqueOrThrow({ where: { id: interview.id } }); await hiring("COMPLETE_INTERVIEW", boss.userId, { interviewReference: round.reference, recordRevision: round.revision }); await hiring("START_REVIEW");
    const reviewedApp = await db.niceJobsApplication.findUniqueOrThrow({ where: { id: app.id } }), hiringApproval = await db.siaApproval.findFirstOrThrow({ where: { requestId: reviewedApp.reviewRequestId, status: "PENDING" } });
    await hiring("DECIDE", approver.id, { approvalId: hiringApproval.id, decision: "APPROVED" }); await hiring("PREPARE_OFFER");
    for (const operation of ["READY_OFFER", "ISSUE_OFFER", "ACCEPT_OFFER"]) { const offer = await db.niceJobsOffer.findFirstOrThrow({ where: { applicationId: app.id } }); await hiring(operation, operation === "ACCEPT_OFFER" ? candidate.id : boss.userId, { offerReference: offer.reference, recordRevision: offer.revision }); }
    const onboarding = createOnboardingService(db);
    async function train(operation: string, extra = {}, userId = candidate.id) {
      const e = await db.niceJobsOnboarding.findFirst({ where: { applicationId: app.id } }), a = await db.niceJobsApplication.findUniqueOrThrow({ where: { id: app.id } });
      return onboarding.mutate(userId, { applicationReference: app.reference, revision: e?.revision ?? a.revision, operation, idempotencyKey: crypto.randomUUID(), ...(userId !== candidate.id ? { reason: "Isolated readiness fixture" } : {}), ...extra }, userId === candidate.id);
    }
    const progress = (key: string) => db.niceJobsTrainingProgress.findFirstOrThrow({ where: { onboarding: { applicationId: app.id }, key } });
    await train("ENROLL"); await train("START_ORIENTATION"); await train("COMPLETE_LESSON", { progressId: (await progress("intro")).id, acknowledged: true }); await train("COMPLETE_LESSON", { progressId: (await progress("quiz")).id, answers: { safe: true } }); await train("FINISH_ORIENTATION");
    await train("ASSIGN_REVIEWER", { reviewerKind: "OJT", reviewerUserId: interviewer.id }, boss.userId); await train("ASSIGN_REVIEWER", { reviewerKind: "READINESS", reviewerUserId: approver.id }, boss.userId); await train("START_OJT");
    for (const [operation, key] of [["SUBMIT_ACTIVITY", "practice_evidence"], ["SUBMIT_ASSESSMENT", "ojt_assessment"]]) { const p = await progress(key); await train(operation, { progressId: p.id, evidence: { text: "Synthetic readiness evidence" } }); const s = await db.niceJobsTrainingSubmission.findFirstOrThrow({ where: { progressId: p.id }, orderBy: { attempt: "desc" } }); await train("REVIEW", { submissionId: s.id, outcome: operation === "SUBMIT_ACTIVITY" ? "APPROVED" : "PASS" }, interviewer.id); }
    await train("REQUEST_READINESS"); await train("DECIDE_READINESS", { outcome: "READY" }, approver.id);
    const workerKeys = ["nicejobs.performance.self.read", "nicejobs.pip.self.read", "nicejobs.pip.self.respond", "nicejobs.sop.read", "nicejobs.resource.read", "nicejobs.message.read", "nicejobs.knowledge.ack", "nicejobs.lead.self.read", "nicejobs.lead.perform", "nicejobs.workspace.self", "nicejobs.work.perform", "nicejobs.report.self", "nicejobs.blocker.self", "nicejobs.work.read", "notification.read", "reminder.manage", "sia.access.read"];
    const workerRole = await db.role.create({ data: { key: "worker-fixture", name: "Explicit worker fixture", organizationId: labs, permissions: { create: workerKeys.map(key => ({ permission: { connect: { key } } })) } } });
    await db.membership.create({ data: { personId: candidate.personId!, organizationId: labs, roles: { create: { roleId: workerRole.id } } } });
    const identity = await db.siaIdentity.create({ data: { name: "Isolated shared SIA", title: "Worker assistance fixture" } });
    const agentRole = await db.role.create({ data: { key: "worker-agent-fixture", name: "Scoped worker assistance", principalType: "AGENT", organizationId: labs, permissions: { create: workerKeys.filter(key => ["nicejobs.performance.self.read", "nicejobs.pip.self.read", "nicejobs.sop.read", "nicejobs.resource.read", "nicejobs.message.read", "nicejobs.knowledge.ack", "nicejobs.lead.self.read", "nicejobs.workspace.self", "nicejobs.report.self", "nicejobs.blocker.self", "nicejobs.work.read", "notification.read"].includes(key) && key !== "nicejobs.knowledge.ack").map(key => ({ permission: { connect: { key } } })) } } });
    await db.siaRoleAssignment.create({ data: { siaId: identity.id, roleId: agentRole.id, organizationId: labs } }); await db.siaTool.create({ data: { siaId: identity.id, key: "get_worker_day", name: "Worker day", permissionKey: "nicejobs.workspace.self", enabled: true } });
    const corporate = await auth.create(boss.userId, secret), portal = await auth.create(candidate.id, secret, undefined, undefined, "jobs");
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", MAXPASE_PORTAL_SMOKE: "true", DATABASE_URL: "file:" + file.replaceAll("\\", "/"), AUTH_SECRET: secret, AUTH_COOKIE_SECURE: "false", APP_ORIGIN: base }; delete env.BOSS_PIN;
    server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3006"], { env, stdio: ["ignore", log, log], windowsHide: true });
    for (let n = 0; ; n++) { if (server.exitCode !== null) throw new Error("Owned fixture server exited"); try { if ((await fetch(base + "/login", { signal: AbortSignal.timeout(5000) })).ok) break; } catch { /* Owned startup only. */ } if (n > 60) throw new Error("Fixture unavailable"); await new Promise(r => setTimeout(r, 1000)); }
    stage = "HTTP session isolation";
    const request = (path: string, cookie?: string) => fetch(base + path, { redirect: "manual", headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(45000) });
    for (const path of ["/app/nicejobs?view=active-workforce", "/sites/jobs/gateway?view=my-day"]) assert.equal((await request(path)).status, 307);
    assert.equal((await request("/app/nicejobs?view=active-workforce", "maxpase_session=" + portal.token)).status, 307); assert.equal((await request("/sites/jobs/gateway?view=my-day", "nice_jobs_session=" + corporate.token)).status, 307);
    browser = await chromium.launch({ headless: true, channel: "chrome" });
    async function actor(token: string, own: boolean) { const context = await browser!.newContext({ viewport: { width: own ? 390 : 1440, height: 1000 } }); await context.addCookies([{ name: own ? "nice_jobs_session" : "maxpase_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]); const page = await context.newPage(); page.on("pageerror", () => errors++); page.setDefaultTimeout(45000); return page; }
    const worker = await actor(portal.token, true), manager = await actor(corporate.token, false);
    const recorded = async (check: () => Promise<boolean>) => { for (let n = 0; n < 90; n++) { if (await check()) return; await new Promise(r => setTimeout(r, 500)); } throw new Error("Fixture mutation not recorded"); };
    async function submit(page: Awaited<ReturnType<typeof actor>>, label: string, values: Record<string, string> = {}) {
      diagnostic = page; const f = page.locator("form:visible").filter({ has: page.getByRole("button", { name: label, exact: true }) });
      for (const [field, value] of Object.entries(values)) { const input = f.getByLabel(field, { exact: true }); if (await input.evaluate((e: Element) => e.tagName) === "SELECT") await input.selectOption(value); else await input.fill(value); }
      await f.locator('input[type="checkbox"][name="confirmed"]').check(); await f.getByRole("button", { name: label, exact: true }).click();
    }
    stage = "explicit readiness-backed activation";
    await manager.goto(base + "/app/nicejobs?view=activation&applicationReference=" + app.reference, { waitUntil: "networkidle" }); await submit(manager, "Activate worker", { "Reason": "Isolated human activation", "Start date and time (UTC)": new Date(Date.now()-86400000).toISOString().slice(0,16) }); await recorded(async () => await db.niceJobsAssignment.count({ where: { status: "ACTIVE", onboardingId: { not: null } } }) === 1);
    const assignment = await db.niceJobsAssignment.findFirstOrThrow({ where: { profile: { personId: candidate.personId! }, status: "ACTIVE" } });

    const employee = createEmployeeService(db), performance = createPerformanceService(db), input = (operation: string, data = {}) => ({ operation, confirmed: true, idempotencyKey: crypto.randomUUID(), ...data });
    const task = await employee.mutate(boss.userId, input("ASSIGN_TASK", { assignmentId: assignment.id, title: "Recorded fixture work with a deliberately long description for evidence validation", description: "Synthetic operational evidence, not a real job KPI", priority: "NORMAL", reason: "Isolated actual task creation" }));
    const taskRow = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    await employee.mutate(candidate.id, input("TASK_STATE", { taskId: taskRow.id, revision: taskRow.revision, to: "COMPLETED", evidence: { text: "Recorded canonical task completion" } }));
    const managerPath = "/app/nicejobs?view=", workerPath = "/sites/jobs/gateway?view=", managerDetail = (id: string) => managerPath + "performance-detail&snapshotId=" + id;
    async function fill(page: Awaited<ReturnType<typeof actor>>, label: string, value: string) { const el = page.locator("form:visible").getByLabel(label, { exact: true }); if (await el.evaluate((e: Element) => e.tagName) === "SELECT") await el.selectOption(value); else await el.fill(value); }
    async function saveEditor(page: Awaited<ReturnType<typeof actor>>) { const f = page.locator("form:visible").filter({ has: page.getByRole("button", { name: "Save", exact: true }) }); await f.locator('input[name="confirmed"]').check(); await f.getByRole("button", { name: "Save", exact: true }).click(); }
    stage = "framework configuration and publication";
    await manager.goto(base + managerPath + "performance-frameworks", { waitUntil: "networkidle" });
    await manager.getByText("Create performance framework", { exact: true }).click();
    for (const [label, value] of Object.entries({ "Framework name": "Synthetic evidence-based framework with a deliberately long name", "Division": labs, "Published job version": job.id, "Measurement period": "CUSTOM", "Period timezone": "UTC", "Effective date (UTC)": new Date().toISOString().slice(0, 10) + "T00:00", "Metric key": "DONE", "Metric name": "Recorded task completions", "Definition": "Isolated metric configuration; not an official job target", "Unit": "count", "Category": "COMPLETION", "Evidence source": "TASK_COMPLETED", "Calculation": "COUNT", "Preferred direction": "HIGHER", "Visibility": "WORKER", "Expected minimum": "2", "Attention minimum": "1" })) await fill(manager, label, value);
    await saveEditor(manager); await recorded(async () => await db.niceJobsPerformanceVersion.count() === 1);
    const framework = await db.niceJobsPerformanceVersion.findFirstOrThrow();
    await manager.goto(base + managerPath + "performance-frameworks", { waitUntil: "networkidle" }); await submit(manager, "Publish framework", { "Reason": "Explicit isolated publication" }); await recorded(async () => (await db.niceJobsPerformanceVersion.findUniqueOrThrow({ where: { id: framework.id } })).status === "PUBLISHED");
    stage = "closed custom-period report generation";
    await new Promise(r => setTimeout(r, 1200));
    await manager.goto(base + managerPath + "performance", { waitUntil: "networkidle" }); await manager.getByText("Generate a recorded performance report", { exact: true }).click();
    const endValue = new Date().toISOString().slice(0, 19).replace(/:00$/, "");
    await submit(manager, "Generate snapshot", { "Worker": assignment.id, "Published framework version": framework.id, "Period start": new Date().toISOString().slice(0, 10) + "T00:00", "Period end": endValue });
    await recorded(async () => await db.niceJobsPerformanceSnapshot.count() === 1);
    const snapshot = await db.niceJobsPerformanceSnapshot.findFirstOrThrow(); assert.equal(JSON.parse(snapshot.results)[0].actual, 1); assert.ok(!JSON.stringify(await performance.detail(candidate.id, snapshot.id)).includes("PRIVATE-"));
    stage = "human feedback, private notes and attention";
    await manager.goto(base + managerDetail(snapshot.id), { waitUntil: "networkidle" }); await manager.getByText("Review performance", { exact: true }).click();
    const reviewForm = manager.locator("form:visible").filter({ has: manager.getByRole("button", { name: "Save review", exact: true }) }); await reviewForm.getByLabel("Release feedback to worker").check();
    await submit(manager, "Save review", { "Worker feedback": "Released fixture support feedback", "Support or next action": "Review the recorded task evidence with your manager", "Private management note": "PRIVATE-PERFORMANCE-BROWSER-CANARY", "Existing support task": task.id });
    await recorded(async () => await db.niceJobsPerformanceReview.count() === 1);
    await manager.goto(base + managerDetail(snapshot.id), { waitUntil: "networkidle" }); await manager.getByText("Record attention for this metric", { exact: true }).click(); await submit(manager, "Record attention", { "Reason": "PRIVATE-ATTENTION-BROWSER-CANARY" }); await recorded(async () => await db.niceJobsPerformanceAttention.count() === 1); assert.equal(await db.niceJobsPip.count(), 0);
    stage = "human PIP creation, activation and release";
    await manager.goto(base + managerDetail(snapshot.id), { waitUntil: "networkidle" }); await manager.getByText("Create an improvement plan", { exact: true }).click();
    const bossPerson = (await db.user.findUniqueOrThrow({ where: { id: boss.userId } })).personId!;
    const startAt = new Date().toISOString().slice(0, 16), dueAt = new Date(Date.now() + 86400000).toISOString().slice(0, 16), reviewAt = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16);
    for (const [label, value] of Object.entries({ "Plan title": "Synthetic improvement and support plan with a long descriptive title", "Responsible manager": bossPerson, "Management reason": "PRIVATE-PIP-REASON-BROWSER-CANARY", "Worker-visible guidance": "Released synthetic improvement guidance", "Private management note": "PRIVATE-PIP-BROWSER-CANARY", "Start date (UTC)": startAt, "Review date (UTC)": reviewAt, "Objective key": "SUPPORT", "Objective": "Review actual recorded work and request the configured manager support", "Evidence-backed baseline": "One recorded canonical task completion", "Expected improvement": "Explicit human-configured improvement expectation", "Objective evidence source": "TASK_COMPLETED", "Objective due date (UTC)": dueAt, "Objective review date (UTC)": reviewAt })) await fill(manager, label, value);
    await manager.getByLabel("Require worker acknowledgement").check(); await manager.getByRole("button", { name: "Add support action", exact: true }).click(); await fill(manager, "Support action", "Review existing task guidance"); await fill(manager, "Existing supporting work or resource", "TASK:" + task.id);
    await saveEditor(manager); await recorded(async () => await db.niceJobsPip.count() === 1); const pip = await db.niceJobsPip.findFirstOrThrow();
    const managerPip = managerPath + "pip-detail&pipId=" + pip.id, workerPip = workerPath + "worker-pip&pipId=" + pip.id;
    await manager.goto(base + managerPip, { waitUntil: "networkidle" }); await submit(manager, "Activate plan", { "Reason": "Explicit human activation" }); await recorded(async () => (await db.niceJobsPip.findUniqueOrThrow({ where: { id: pip.id } })).status === "ACTIVE");
    await worker.goto(base + workerPip, { waitUntil: "networkidle" }); assert.ok((await worker.locator("main").innerText()).includes("not available"));
    await manager.goto(base + managerPip, { waitUntil: "networkidle" }); await submit(manager, "Release plan to worker", { "Reason": "Explicit human release" }); await recorded(async () => (await db.niceJobsPip.findUniqueOrThrow({ where: { id: pip.id } })).released);
    stage = "worker report, exact evidence and released plan response";
    const workerDetail = workerPath + "worker-performance-detail&snapshotId=" + snapshot.id;
    await worker.goto(base + workerDetail, { waitUntil: "networkidle" }); let body = await worker.locator("main").innerText(); assert.ok(body.includes("Recorded task completions")); assert.ok(!body.includes("PRIVATE-"));
    await worker.getByText("Recorded evidence (1)", { exact: true }).click(); await worker.getByRole("link", { name: "Open evidence", exact: true }).click(); await worker.waitForURL(/performance-evidence/); assert.ok((await worker.locator("main").innerText()).includes("Recorded fixture work"));
    await worker.goto(base + workerPip, { waitUntil: "networkidle" }); body = await worker.locator("main").innerText(); assert.ok(body.includes("Released synthetic improvement guidance")); assert.ok(!body.includes("PRIVATE-")); await submit(worker, "Acknowledge plan"); await recorded(async () => !!(await db.niceJobsPip.findUniqueOrThrow({ where: { id: pip.id } })).acknowledgedAt);
    await worker.getByText("Provide comments and evidence", { exact: true }).click(); await fill(worker, "Your comments", "Actual worker evidence submission"); await fill(worker, "Supporting evidence", "TASK:" + task.id); await saveEditor(worker); await recorded(async () => await db.niceJobsPipReview.count({ where: { pipId: pip.id, kind: "WORKER" } }) === 1);
    stage = "read-only grounded performance assistance";
    await worker.goto(base + workerPath + "worker-sia", { waitUntil: "networkidle" }); await worker.getByRole("button", { name: "How am I doing?", exact: true }).click(); await worker.getByText("Released manager feedback", { exact: true }).waitFor(); body = await worker.locator("main").innerText(); assert.ok(body.includes("Recorded task completions")); assert.ok(body.includes("Released synthetic improvement guidance")); assert.ok(!body.includes("PRIVATE-")); assert.equal(await db.siaAction.count(), 0);
    stage = "human PIP review and completion";
    await manager.goto(base + managerPip, { waitUntil: "networkidle" }); await manager.getByText("Record plan review", { exact: true }).click();
    for (const [label, value] of Object.entries({ "Review outcome": "MEETS_EXPECTATION", "Review comments": "Explicit isolated human review", "Private management note": "PRIVATE-PIP-REVIEW-BROWSER-CANARY", "Next support action": "Continue supported work", "Supporting evidence": "TASK:" + task.id })) await fill(manager, label, value);
    await manager.getByLabel("Release review feedback to worker").check(); await saveEditor(manager); await recorded(async () => (await db.niceJobsPip.findUniqueOrThrow({ where: { id: pip.id } })).status === "UNDER_REVIEW");
    await manager.goto(base + managerPip, { waitUntil: "networkidle" }); await manager.getByText("Complete reviewed plan", { exact: true }).click(); await submit(manager, "Complete plan", { "Reason": "Explicit reviewed completion", "Human-reviewed outcome": "Isolated improvement outcome, not an employment decision" }); await recorded(async () => (await db.niceJobsPip.findUniqueOrThrow({ where: { id: pip.id } })).status === "COMPLETED"); assert.equal((await db.niceJobsAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).status, "ACTIVE");
    assert.equal(await db.auditEvent.count({ where: { action: "nicejobs.performance.pip_complete", entityId: pip.id } }), 1); assert.equal(await db.communicationMessage.count(), 0);
    stage = "scoped report filters and executive summary";
    const companyId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
    const from = snapshot.periodStart.toISOString().slice(0, 10), until = new Date(snapshot.periodStart.getTime() + 86400000).toISOString().slice(0, 10);
    await manager.goto(base + managerPath + "performance&companyId=" + companyId, { waitUntil: "networkidle" });
    const filters = manager.locator("form.nj-filters");
    for (const [name, value] of Object.entries({ divisionId: labs, jobId: job.templateId, assignmentId: assignment.id, status: "ATTENTION", sort: "PERIOD_DESC" })) await filters.locator('[name="' + name + '"]').selectOption(value);
    await filters.locator('[name="from"]').fill(from); await filters.locator('[name="until"]').fill(until); await filters.getByRole("button", { name: "Filter", exact: true }).click(); await manager.waitForLoadState("networkidle");
    assert.ok(manager.url().includes("companyId=" + companyId)); assert.equal(await manager.locator('[name="assignmentId"]').first().inputValue(), assignment.id);
    await manager.locator('a[href*="view=performance-detail"]').click(); await manager.getByRole("link", { name: "Back to reports", exact: true }).click(); await manager.waitForLoadState("networkidle"); assert.equal(await manager.locator('[name="divisionId"]').first().inputValue(), labs); assert.equal(await manager.locator('[name="status"]').inputValue(), "ATTENTION");
    await manager.goto(base + managerPath + "performance&companyId=" + companyId + "&divisionId=" + labs + "&from=" + from + "&until=" + until, { waitUntil: "networkidle" }); await manager.getByRole("heading", { name: "Authorized division and job summary", exact: true }).waitFor(); assert.ok((await manager.locator("main").innerText()).includes("1 snapshots"));
    await manager.goto(base + managerPath + "pips&companyId=" + companyId + "&divisionId=" + labs + "&pipStatus=COMPLETED&search=Synthetic", { waitUntil: "networkidle" }); assert.equal(await manager.locator('[name="pipStatus"]').inputValue(), "COMPLETED"); assert.ok((await manager.locator("main").innerText()).includes(pip.title));
    await worker.goto(base + workerPath + "worker-performance&search=Synthetic", { waitUntil: "networkidle" }); assert.ok((await worker.locator("main").innerText()).includes("Synthetic evidence-based framework"));
    stage = "responsive worker and management performance views";
    const evidencePath = workerPath + "worker-performance-evidence&snapshotId=" + snapshot.id + "&evidenceType=TASK&evidenceId=" + task.id;
    const views: [string, Awaited<ReturnType<typeof actor>>, string, string?][] = [["worker-reports", worker, workerPath + "worker-performance"], ["worker-metrics-attention", worker, workerDetail], ["worker-evidence", worker, evidencePath], ["worker-pip", worker, workerPip], ["worker-sia", worker, workerPath + "worker-sia"], ["manager-reports", manager, managerPath + "performance"], ["manager-frameworks", manager, managerPath + "performance-frameworks"], ["manager-metrics-review", manager, managerDetail(snapshot.id)], ["manager-pip-history", manager, managerPip], ["manager-feedback-editor", manager, managerDetail(snapshot.id), "Review performance"], ["manager-pip-editor", manager, managerDetail(snapshot.id), "Create an improvement plan"]];
    for (const width of [320, 390, 768, 1440]) for (const [name, page, path, open] of views) { diagnostic = page; await page.setViewportSize({ width, height: 1000 }); await page.goto(base + path, { waitUntil: "networkidle" }); if (open) await page.getByText(open, { exact: true }).click(); if (name === "worker-sia") { await page.getByRole("button", { name: "How am I doing?", exact: true }).click(); await page.getByText("Released manager feedback", { exact: true }).waitFor(); } assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), name + " overflow " + width); await page.screenshot({ path: resolve(".next-portal-smoke/nicejobs-phase08-" + name + "-" + width + ".png"), fullPage: true }); screenshots++; }
    await worker.goto(base + workerPath + "worker-performance", { waitUntil: "networkidle" }); await worker.keyboard.press("Tab"); assert.ok(await worker.evaluate(() => document.activeElement?.tagName !== "BODY")); assert.equal(errors, 0);
    writeFileSync(resolve("docs/audit/NICE_JOBS_PHASE_08_BROWSER.json"), JSON.stringify({ status: "PASS", recordedAt: new Date().toISOString(), browser: await browser.version(), isolated: true, workflows: ["canonical readiness activation", "framework create and publish", "custom-period snapshot generation", "manager review and private notes", "explicit attention", "human PIP create/activate/release/review/complete", "worker report and exact evidence", "released worker plan acknowledgement and evidence", "grounded read-only SIA", "corporate/jobs session isolation", "scoped filters and context-preserving drilldown", "explicit-period executive aggregation", "PIP status and worker-framework search"], screenshots, widths: [320, 390, 768, 1440], noPageOverflow: true, pageErrors: errors, limitations: "Local Chrome and simulated viewports only. Physical devices, screen readers, complete keyboard/usability and production NOT RUN." }, null, 2) + "\n");
    console.log("PASS Phase08 browser workflows; " + screenshots + " responsive captures");
  } catch (error) { console.error("BLOCKED browser stage: " + stage); console.error(error instanceof Error ? error.message : "Browser check failed"); if (diagnostic) { console.error((await diagnostic.locator("main").innerText()).slice(-3000)); await diagnostic.screenshot({ path: resolve(".next-portal-smoke/nicejobs-phase08-failure.png"), fullPage: true }); } throw error; }
  finally { await browser?.close(); if (server?.pid) { if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" }); else server.kill(); } await db.$disconnect(); closeSync(log); if (process.platform === "win32") await new Promise(r => setTimeout(r, 500)); if (resolve(directory).startsWith(resolve(tmpdir(), "nicejobs-performance-browser-"))) rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
}
main().catch(() => { process.exitCode = 1; });
