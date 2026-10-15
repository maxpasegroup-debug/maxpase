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
import { createOperationsService } from "../src/server/domain/operations-service";

async function main() {
  const directory = mkdtempSync(join(tmpdir(), "nicejobs-employee-browser-")), file = join(directory, "test.db");
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
      const user = await db.user.create({ data: { email: name + "@phase05-fixture.invalid", personId: person.id, timezone: "Asia/Kolkata" } });
      const role = await db.role.create({ data: { key: person.id, name: "Explicit test capabilities", organizationId: org, permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
      await db.membership.create({ data: { personId: person.id, organizationId: org, roles: { create: { roleId: role.id } } } }); return user;
    }
    const candidate = await human("candidate", career, ["organization.read", "nicejobs.application.self", "nicejobs.onboarding.self", "notification.read"]);
    const interviewer = await human("interviewer", labs, ["nicejobs.application.read", "nicejobs.interview.read", "nicejobs.interview.evaluate", "nicejobs.ojt.review", "notification.read"]);
    const approver = await human("approver", labs, ["nicejobs.application.read", "nicejobs.management.review", "nicejobs.management.approve", "nicejobs.management.reject", "nicejobs.readiness.review", "approval.read", "approval.decide", "request.read", "control.read", "notification.read"]);
    const control = await operations.saveControl(boss.userId, { organizationId: labs, name: "Isolated hiring approval", kind: "HUMAN_DECISION", requiredPermission: "nicejobs.management.approve", stages: [[{ approverUserId: approver.id, requiredPermission: "nicejobs.management.approve" }]] });
    const trainingQuiz = { form: { fields: [{ key: "safe", label: "Synthetic safety question", type: "BOOLEAN", required: true }] }, assessment: { questions: [{ field: "safe", operator: "EQ", value: true, weight: 1, required: true }], passMark: 100 }, maxAttempts: 2 };
    const training = { orientation: { modules: [{ key: "welcome", title: "Synthetic introductory module", order: 1, lessons: [{ key: "intro", title: "Synthetic introduction lesson", type: "TEXT", text: "Browser fixture only, not real company content", completion: "ACKNOWLEDGE", order: 1 }, { key: "quiz", title: "Synthetic quiz", type: "QUIZ", completion: "QUIZ", quiz: trainingQuiz, order: 2 }] }] }, ojt: { stages: [{ key: "practice", title: "Synthetic practice stage", order: 1, activities: [{ key: "practice_evidence", title: "Synthetic practice", type: "PRACTICE", order: 1, instruction: "Describe fixture practice", expectedOutcome: "Independent fixture review", evidenceRequired: true, reviewRequired: true, maxAttempts: 2, dueDays: 1 }] }], assessment: { kind: "HUMAN", criteria: "Verify synthetic practice", maxAttempts: 2 } }, readiness: { requireAssessment: true, criteria: "All fixture requirements must be complete" } };
    const config = { ...training, schemaVersion: 1, application: { fields: [{ key: "experience", label: "Experience", type: "NUMBER", required: true }] }, eligibility: { rules: [{ field: "experience", operator: "GTE", value: 1 }] }, screening: { questions: [{ field: "experience", operator: "GTE", value: 1, weight: 1 }], passMark: 80 }, interview: { enabled: true, type: "VIDEO", duration: 30, questions: [{ key: "evidence", question: "Isolated interview evidence", type: "TEXT", required: true, order: 1, weight: 1 }] }, management: { policies: [{ divisionId: labs, controlPointId: control.id }] }, offer: { title: "Isolated fixture offer", content: { terms: "Test terms only; not a real employment offer", expectations: "Isolated test expectations" }, validityDays: 2, declineReasonRequired: true } };
    const job = await jobs.create(boss.userId, { code: "BROWSER-PHASE05", title: "Isolated recruitment position with a deliberately long title for mobile validation", visibility: "PUBLIC", divisionIds: [labs], configuration: config });
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
    const workerKeys = ["nicejobs.workspace.self", "nicejobs.work.perform", "nicejobs.report.self", "nicejobs.blocker.self", "nicejobs.work.read", "notification.read", "reminder.manage", "sia.access.read"];
    const workerRole = await db.role.create({ data: { key: "worker-fixture", name: "Explicit worker fixture", organizationId: labs, permissions: { create: workerKeys.map(key => ({ permission: { connect: { key } } })) } } });
    await db.membership.create({ data: { personId: candidate.personId!, organizationId: labs, roles: { create: { roleId: workerRole.id } } } });
    const identity = await db.siaIdentity.create({ data: { name: "Isolated shared SIA", title: "Worker assistance fixture" } });
    const agentRole = await db.role.create({ data: { key: "worker-agent-fixture", name: "Scoped worker assistance", principalType: "AGENT", organizationId: labs, permissions: { create: workerKeys.filter(key => ["nicejobs.workspace.self", "nicejobs.report.self", "nicejobs.blocker.self", "nicejobs.work.read", "notification.read"].includes(key)).map(key => ({ permission: { connect: { key } } })) } } });
    await db.siaRoleAssignment.create({ data: { siaId: identity.id, roleId: agentRole.id, organizationId: labs } }); await db.siaTool.create({ data: { siaId: identity.id, key: "get_worker_day", name: "Worker day", permissionKey: "nicejobs.workspace.self", enabled: true } });
    const corporate = await auth.create(boss.userId, secret), portal = await auth.create(candidate.id, secret, undefined, undefined, "jobs");
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", DATABASE_URL: "file:" + file.replaceAll("\\", "/"), AUTH_SECRET: secret, AUTH_COOKIE_SECURE: "false", APP_ORIGIN: base }; delete env.BOSS_PIN;
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
      diagnostic = page; const f = page.locator("form").filter({ has: page.getByRole("button", { name: label, exact: true }) });
      for (const [field, value] of Object.entries(values)) { const input = f.getByLabel(field, { exact: true }); if (await input.evaluate((e: Element) => e.tagName) === "SELECT") await input.selectOption(value); else await input.fill(value); }
      await f.locator('input[type="checkbox"][name="confirmed"]').check(); await f.getByRole("button", { name: label, exact: true }).click();
    }
    stage = "explicit readiness-backed activation";
    await manager.goto(base + "/app/nicejobs?view=activation&applicationReference=" + app.reference, { waitUntil: "networkidle" }); await submit(manager, "Activate worker", { "Reason": "Isolated human activation" }); await recorded(async () => await db.niceJobsAssignment.count({ where: { status: "ACTIVE", onboardingId: { not: null } } }) === 1);
    const assignment = await db.niceJobsAssignment.findFirstOrThrow({ where: { profile: { personId: candidate.personId! }, status: "ACTIVE" } }), managerPath = "/app/nicejobs?view=worker-detail&assignmentId=" + assignment.id;
    stage = "real production task assignment and required completion evidence";
    await manager.goto(base + managerPath, { waitUntil: "networkidle" }); await manager.getByText("Assign task", { exact: true }).first().click(); const taskForm = manager.locator("form").filter({ has: manager.getByRole("button", { name: "Assign task", exact: true }) }); await taskForm.getByLabel("Require completion evidence", { exact: true }).check();
    await submit(manager, "Assign task", { "Task": "Isolated production task with a long title for responsive workforce validation", "Instructions": "Complete only this synthetic fixture work", "Priority": "HIGH", "Reason": "Explicit browser task assignment" }); await recorded(async () => await db.task.count() === 1);
    await worker.goto(base + "/sites/jobs/gateway", { waitUntil: "networkidle" }); assert.ok((await worker.locator("main").innerText()).includes("My Day"));
    await worker.getByText("Start or complete task", { exact: true }).click(); await submit(worker, "Start task"); await recorded(async () => (await db.task.findFirstOrThrow()).status === "IN_PROGRESS"); await worker.getByText("Start or complete task", { exact: true }).waitFor({ state: "hidden" }); assert.equal(await worker.getByRole("button", { name: "Complete task", exact: true }).isEnabled(), true);
    await worker.goto(base + "/sites/jobs/gateway?view=my-work", { waitUntil: "networkidle" }); await worker.getByText("Complete task", { exact: true }).first().click(); await submit(worker, "Complete task", { "Completion evidence": "Actual synthetic completed-work evidence" }); await recorded(async () => (await db.task.findFirstOrThrow()).status === "COMPLETED"); assert.equal(await db.taskEvidence.count(), 1);
    stage = "daily report and blocker workflows";
    await worker.goto(base + "/sites/jobs/gateway?view=my-day", { waitUntil: "networkidle" }); await submit(worker, "Submit today's report", { "Notes": "Synthetic actual day report" }); await recorded(async () => await db.niceJobsDailyReport.count() === 1); await worker.getByRole("button", { name: "Correct today's report", exact: true }).waitFor(); assert.equal(await worker.getByRole("button", { name: "Correct today's report", exact: true }).isEnabled(), true);
    await worker.goto(base + "/sites/jobs/gateway?view=my-day", { waitUntil: "networkidle" }); await worker.getByText("I'm blocked", { exact: true }).click(); await submit(worker, "Report blocker", { "Reason": "Need fixture resource", "What is blocking you?": "Worker-level blocker, not a production incident" }); await recorded(async () => await db.executionBlocker.count() === 1);
    await manager.goto(base + managerPath, { waitUntil: "networkidle" }); await submit(manager, "Resolve blocker", { "Reason": "Fixture information provided" }); await recorded(async () => (await db.executionBlocker.findFirstOrThrow()).status === "RESOLVED");
    stage = "governed worker SIA conversation";
    await worker.goto(base + "/sites/jobs/gateway?view=worker-sia", { waitUntil: "networkidle" }); diagnostic = worker; await worker.getByRole("button", { name: "Show my tasks", exact: true }).click(); await recorded(async () => await db.siaRun.count({ where: { userId: candidate.id, toolKey: "get_worker_day", status: "SUCCEEDED" } }) === 1); await worker.getByText("No pending work.", { exact: true }).waitFor(); await worker.getByText("Read-only deterministic assistance; no model-generated completion or business action.", { exact: true }).waitFor(); assert.ok((await worker.locator("main").innerText()).includes("Isolated production task with a long title for responsive workforce validation"));
    assert.equal(await db.siaAction.count(), 0);
    stage = "responsive workforce and employee workspace";
    for (const width of [320, 390, 768, 1440]) {
      for (const [name, page, path] of [["my-day", worker, "/sites/jobs/gateway?view=my-day"], ["my-work", worker, "/sites/jobs/gateway?view=my-work&workView=completed"], ["workforce", manager, "/app/nicejobs?view=active-workforce&status=ACTIVE"]] as const) { await page.setViewportSize({ width, height: 1000 }); await page.goto(base + path, { waitUntil: "networkidle" }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), name + " overflow " + width); await page.screenshot({ path: resolve(".next/nicejobs-phase05-" + name + "-" + width + ".png"), fullPage: true }); screenshots++; }
    }
    assert.equal(errors, 0); writeFileSync(resolve("docs/audit/NICE_JOBS_PHASE_05_BROWSER.json"), JSON.stringify({ status: "PASS", recordedAt: new Date().toISOString(), browser: await browser.version(), isolated: true, workflows: ["real-service readiness fixture", "human activation", "canonical task assignment/start/evidence/completion", "daily report", "worker blocker and human resolution", "governed worker SIA run", "default My Day", "session replay protection"], screenshots, widths: [320, 390, 768, 1440], noPageOverflow: true, pageErrors: errors, limitations: "Local Chrome and simulated viewports only; no physical devices, screen readers, production TLS or deployment." }, null, 2) + "\n");
    console.log("PASS Phase05 isolated activation/work/report/blocker/SIA browser workflows; " + screenshots + " captures");
  } catch (e) { console.error("Phase05 browser failed at " + stage); if (e instanceof Error) console.error(e.message); if (diagnostic) { console.error(await diagnostic.locator("main").innerText()); await diagnostic.screenshot({ path: resolve(".next/nicejobs-phase05-failure.png"), fullPage: true }); } process.exitCode = 1; }
  finally { await browser?.close(); if (server?.pid) { if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" }); else server.kill(); } await db.$disconnect(); closeSync(log); if (resolve(directory).startsWith(resolve(tmpdir(), "nicejobs-employee-browser-"))) rmSync(directory, { recursive: true, force: true }); }
}
main();
