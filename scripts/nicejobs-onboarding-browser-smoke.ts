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
import { createOperationsService } from "../src/server/domain/operations-service";

async function main() {
  const directory = mkdtempSync(join(tmpdir(), "nicejobs-onboarding-browser-")), file = join(directory, "test.db");
  const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
  const base = "http://127.0.0.1:3006", secret = randomBytes(32).toString("base64url");
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
  const log = openSync(join(directory, "server.log"), "w");
  let server: ReturnType<typeof spawn> | undefined, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let stage = "fixture", screenshots = 0, errors = 0;
  try {
    const sql = new DatabaseSync(file); for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8")); sql.close();
    const boss = await provisionBoss(db, { BOSS_PIN: String(randomInt(100000, 1000000)) });
    const jobs = createNiceJobsService(db), applications = createApplicationService(db), auth = createAuthenticationService(db), operations = createOperationsService(db);
    const labs = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id, career = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-career-hub" } })).id;
    async function human(name: string, org: string, keys: string[]) {
      const person = await db.person.create({ data: { displayName: name + " with a deliberately long fixture name" } });
      const user = await db.user.create({ data: { email: name + "@phase04-fixture.invalid", personId: person.id, timezone: "Asia/Kolkata" } });
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
    const job = await jobs.create(boss.userId, { code: "BROWSER-PHASE04", title: "Isolated recruitment position with a deliberately long title for mobile validation", visibility: "PUBLIC", divisionIds: [labs], configuration: config });
    await jobs.changeJob(boss.userId, { id: job.id, revision: 0, to: "PUBLISHED", reason: "Isolated publication" });
    let application = await applications.create(candidate.id, { versionId: job.id, divisionId: labs });
    application = await applications.mutate(candidate.id, { reference: application.reference, revision: 0, action: "SUBMIT", answers: { experience: 2 } });
    for (const action of ["ELIGIBILITY", "SCREENING", "SHORTLIST"]) application = await applications.mutate(boss.userId, { reference: application.reference, revision: application.revision, action, reason: "Isolated human review" });
    const past = new Date(Date.now() - 7200000), recruitment = createRecruitmentService(db, () => past);
    await recruitment.mutate(boss.userId, { reference: application.reference, revision: application.revision, operation: "CREATE_INTERVIEW", interviewerIds: [interviewer.id], reason: "Isolated interview assignment" });
    const app = await db.niceJobsApplication.findUniqueOrThrow({ where: { reference: application.reference } }), interview = await db.niceJobsInterview.findFirstOrThrow({ where: { applicationId: app.id } });
    await recruitment.mutate(boss.userId, { reference: application.reference, revision: app.revision, operation: "SCHEDULE", interviewReference: interview.reference, recordRevision: interview.revision, scheduledAt: new Date(Date.now() - 3600000).toISOString(), instructions: "Candidate-visible fixture instructions", reason: "Isolated historical schedule" });
    const corporate = await auth.create(boss.userId, secret), portal = await auth.create(candidate.id, secret, undefined, undefined, "jobs"), evaluator = await auth.create(interviewer.id, secret), decision = await auth.create(approver.id, secret);
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", DATABASE_URL: "file:" + file.replaceAll("\\", "/"), AUTH_SECRET: secret, AUTH_COOKIE_SECURE: "false", APP_ORIGIN: base }; delete env.BOSS_PIN;
    server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3006"], { env, stdio: ["ignore", log, log], windowsHide: true });
    stage = "readiness";
    for (let n = 0; ; n++) { if (server.exitCode !== null) throw new Error("Owned fixture server exited"); try { if ((await fetch(base + "/login", { signal: AbortSignal.timeout(5000) })).ok) break; } catch { /* Owned server startup only. */ } if (n > 60) throw new Error("Fixture unavailable"); await new Promise(r => setTimeout(r, 1000)); }
    stage = "HTTP realm isolation";
    const request = (path: string, cookie?: string) => fetch(base + path, { redirect: "manual", headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(45000) });
    assert.equal((await request("/app/nicejobs?view=applications")).status, 307);
    assert.equal((await request("/sites/jobs/gateway?view=my-applications")).status, 307);
    assert.equal((await request("/app/nicejobs?view=applications", "maxpase_session=" + portal.token)).status, 307);
    assert.equal((await request("/sites/jobs/gateway?view=my-applications", "nice_jobs_session=" + corporate.token)).status, 307);
    browser = await chromium.launch({ headless: true, channel: "chrome" });
    async function actor(token: string, own: boolean) { const context = await browser!.newContext({ viewport: { width: own ? 390 : 1440, height: 1000 } }); await context.addCookies([{ name: own ? "nice_jobs_session" : "maxpase_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]); const page = await context.newPage(); page.on("pageerror", () => errors++); page.on("dialog", (dialog: { accept: () => Promise<void> }) => dialog.accept()); page.setDefaultTimeout(45000); return page; }
    const page = await actor(portal.token, true), manager = await actor(corporate.token, false), reviewer = await actor(evaluator.token, false), decider = await actor(decision.token, false);
    const managementPath = `/app/nicejobs?view=applications&companyId=${app.companyId}&divisionId=${labs}&reference=${app.reference}`, candidatePath = `/sites/jobs/gateway?view=my-applications&reference=${app.reference}`;
    const recorded = async (check: () => Promise<boolean>) => { for (let n = 0; n < 90; n++) { if (await check()) return; await new Promise(r => setTimeout(r, 500)); } throw new Error("Fixture mutation not recorded"); };
    stage = "candidate privacy";
    await page.goto(base + candidatePath, { waitUntil: "networkidle" }); assert.ok((await page.locator("main").innerText()).includes("Candidate-visible fixture instructions")); assert.ok(!(await page.locator("main").innerText()).includes("Isolated interview evidence"));
    stage = "private interviewer evaluation";
    await reviewer.goto(base + managementPath, { waitUntil: "networkidle" }); await reviewer.getByText("Submit private evaluation", { exact: true }).click(); const evaluation = reviewer.locator("form").filter({ has: reviewer.getByRole("button", { name: "Submit evaluation", exact: true }) }); await evaluation.getByLabel("Private reason / notes").fill("PRIVATE-BROWSER-NOTES"); await evaluation.getByLabel("Isolated interview evidence", { exact: true }).fill("Private fixture answer"); await evaluation.getByLabel("Score (0-10)").fill("8"); await evaluation.getByLabel("Recommendation").selectOption("RECOMMEND"); await evaluation.getByRole("button", { name: "Submit evaluation", exact: true }).click(); await recorded(async () => await db.niceJobsInterviewEvaluation.count() === 1);
    stage = "interview completion and human approval";
    await manager.goto(base + managementPath, { waitUntil: "networkidle" }); await manager.getByText("Scheduling and attendance", { exact: true }).click(); const completion = manager.locator("form").filter({ has: manager.getByRole("button", { name: "COMPLETE INTERVIEW", exact: true }) }); await completion.getByLabel("Private reason / notes").fill("Attendance verified in fixture"); await completion.getByRole("button", { name: "COMPLETE INTERVIEW", exact: true }).click(); await recorded(async () => (await db.niceJobsApplication.findUniqueOrThrow({ where: { id: app.id } })).status === "MANAGEMENT_REVIEW");
    await manager.goto(base + managementPath, { waitUntil: "networkidle" }); const start = manager.locator("form").filter({ has: manager.getByRole("button", { name: "Request management approval", exact: true }) }); await start.getByLabel("Private reason / notes").fill("Human review requested"); await start.getByRole("button", { name: "Request management approval", exact: true }).click(); await recorded(async () => !!(await db.niceJobsApplication.findUniqueOrThrow({ where: { id: app.id } })).reviewRequestId);
    await decider.goto(base + managementPath, { waitUntil: "networkidle" }); const approve = decider.locator("form").filter({ has: decider.getByRole("button", { name: "Approve", exact: true }) }); await approve.getByLabel("Private reason / notes").fill("Independent fixture decision"); await approve.getByLabel("Candidate-visible message").fill("Released fixture approval"); await approve.getByRole("button", { name: "Approve", exact: true }).click(); await recorded(async () => (await db.niceJobsApplication.findUniqueOrThrow({ where: { id: app.id } })).status === "APPROVED");
    stage = "prepare review issue offer";
    for (const [label, status] of [["Prepare offer", "DRAFT"], ["Confirm offer reviewed", "READY"], ["Issue offer", "ISSUED"]]) { await manager.goto(base + managementPath, { waitUntil: "networkidle" }); if (label !== "Prepare offer") await manager.getByText("Offer controls", { exact: true }).click(); const form = manager.locator("form").filter({ has: manager.getByRole("button", { name: label, exact: true }) }); await form.getByLabel("Private reason / notes").fill("Explicit fixture " + label); await form.getByRole("button", { name: label, exact: true }).click(); await recorded(async () => !!await db.niceJobsOffer.findFirst({ where: { applicationId: app.id, status } })); }
    stage = "offer acceptance and privacy";
    await page.goto(base + candidatePath, { waitUntil: "networkidle" }); const publicText = await page.locator("main").innerText(); for (const privateText of ["PRIVATE-BROWSER-NOTES", "Independent fixture decision", "Private fixture answer"]) assert.ok(!publicText.includes(privateText)); assert.ok(publicText.includes("Test terms only"));
    for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); await page.screenshot({ path: resolve(`.next/nicejobs-phase04-offer-${width}.png`), fullPage: true }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Candidate overflow " + width); screenshots++; }
    await page.getByRole("button", { name: "Accept offer", exact: true }).click(); await recorded(async () => (await db.niceJobsApplication.findUniqueOrThrow({ where: { id: app.id } })).status === "OFFER_ACCEPTED"); assert.equal(await db.niceJobsAssignment.count(), 0); assert.equal(await db.niceJobsWorkerProfile.count(), 0);
    stage = "context-preserving interviewer search and assignment";
    const other = await human("other-candidate", career, ["organization.read", "nicejobs.application.self"]);
    let second = await applications.create(other.id, { versionId: job.id, divisionId: labs }); second = await applications.mutate(other.id, { reference: second.reference, revision: 0, action: "SUBMIT", answers: { experience: 2 } });
    for (const action of ["ELIGIBILITY", "SCREENING", "SHORTLIST"]) second = await applications.mutate(boss.userId, { reference: second.reference, revision: second.revision, action, reason: "Second isolated shortlist" });
    const secondPath = `/app/nicejobs?view=applications&companyId=${app.companyId}&divisionId=${labs}&reference=${second.reference}`;
    await manager.goto(base + secondPath, { waitUntil: "networkidle" }); await manager.getByText("Prepare interview", { exact: true }).click(); await manager.getByLabel("Find interviewer", { exact: true }).fill("interviewer"); await manager.getByRole("button", { name: "Search", exact: true }).click(); await manager.waitForURL((url: URL) => url.searchParams.get("interviewerSearch") === "interviewer"); assert.equal(new URL(manager.url()).searchParams.get("reference"), second.reference); assert.equal(new URL(manager.url()).searchParams.get("companyId"), app.companyId);
    await manager.getByText("Prepare interview", { exact: true }).click(); const prepare = manager.locator("form").filter({ has: manager.getByRole("button", { name: "Create interview", exact: true }) }); await prepare.getByLabel("Private reason / notes").fill("Selected actual scoped interviewer"); await prepare.getByLabel("Interviewers", { exact: true }).selectOption(interviewer.id); await prepare.getByRole("button", { name: "Create interview", exact: true }).click(); await recorded(async () => (await db.niceJobsApplication.findUniqueOrThrow({ where: { reference: second.reference } })).status === "INTERVIEW");
    stage = "filters, responsive management and configuration";
    const draft = await jobs.create(boss.userId, { code: "BROWSER-CONFIG04", title: "Isolated draft", divisionIds: [labs] });
    for (const width of [320, 390, 768, 1440]) { await manager.setViewportSize({ width, height: 1000 }); for (const [view, path] of [["pipeline", `/app/nicejobs?view=applications&companyId=${app.companyId}&divisionId=${labs}&status=OFFER_ACCEPTED&interviewFrom=${interview.scheduledAt?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10)}`], ["management", managementPath], ["configuration", `/app/nicejobs?view=templates&versionId=${draft.id}`]]) { await manager.goto(base + path, { waitUntil: "networkidle" }); if (view === "configuration") await manager.getByText("Interview, approval and offer configuration", { exact: true }).click(); assert.ok(await manager.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), view + " overflow " + width); await manager.screenshot({ path: resolve(`.next/nicejobs-phase04-${view}-${width}.png`), fullPage: true }); screenshots++; } }

    stage = "onboarding enrollment and orientation";
    const onboardingPath = "/sites/jobs/gateway?view=my-onboarding&reference=" + app.reference;
    const reviewPath = "/app/nicejobs?view=my-reviews&reference=" + app.reference;
    const adminPath = "/app/nicejobs?view=onboarding&companyId=" + app.companyId + "&divisionId=" + labs + "&reference=" + app.reference;
    const enrollment = () => db.niceJobsOnboarding.findFirstOrThrow({ where: { applicationId: app.id } });
    async function trainingSubmit(actorPage: Awaited<ReturnType<typeof actor>>, label: string, values: Record<string, string> = {}) {
      const f = actorPage.locator("form").filter({ has: actorPage.getByRole("button", { name: label, exact: true }) });
      for (const [name, value] of Object.entries(values)) {
        const field = f.getByLabel(name, { exact: true });
        if (await field.evaluate((el: HTMLElement) => el.tagName === "SELECT")) await field.selectOption(value); else await field.fill(value);
      }
      await f.getByRole("checkbox").check();
      await f.getByRole("button", { name: label, exact: true }).click();
    }
    await page.goto(base + candidatePath, { waitUntil: "networkidle" }); await trainingSubmit(page, "Enroll in onboarding");
    await recorded(async () => !!await db.niceJobsOnboarding.findFirst({ where: { applicationId: app.id } }));
    await page.goto(base + onboardingPath, { waitUntil: "networkidle" }); await trainingSubmit(page, "Start orientation"); await recorded(async () => (await enrollment()).status === "ORIENTATION");
    await page.goto(base + onboardingPath, { waitUntil: "networkidle" }); await trainingSubmit(page, "Complete requirement"); await recorded(async () => await db.niceJobsTrainingSubmission.count() === 1);
    await page.goto(base + onboardingPath, { waitUntil: "networkidle" }); await trainingSubmit(page, "Submit assessment", { "Synthetic safety question *": "true" }); await recorded(async () => await db.niceJobsTrainingSubmission.count() === 2);
    await page.goto(base + onboardingPath, { waitUntil: "networkidle" }); await trainingSubmit(page, "Finish orientation"); await recorded(async () => !!(await enrollment()).orientationCompletedAt);
    stage = "authorized trainer and readiness assignments";
    await manager.goto(base + adminPath, { waitUntil: "networkidle" }); await manager.getByText("Assign trainer or mentor", { exact: true }).click(); await trainingSubmit(manager, "Assign reviewer", { "Reviewer": interviewer.id, "Private decision reason": "Independent browser trainer assignment" }); await recorded(async () => (await enrollment()).reviewerUserId === interviewer.id);
    await manager.goto(base + adminPath, { waitUntil: "networkidle" }); await manager.getByText("Assign readiness reviewer", { exact: true }).click(); await trainingSubmit(manager, "Assign readiness reviewer", { "Reviewer": approver.id, "Private decision reason": "Independent readiness assignment" }); await recorded(async () => (await enrollment()).readinessReviewerUserId === approver.id);
    stage = "OJT evidence and assigned review";
    await page.goto(base + onboardingPath, { waitUntil: "networkidle" }); await trainingSubmit(page, "Start OJT"); await recorded(async () => (await enrollment()).status === "OJT");
    await page.goto(base + onboardingPath, { waitUntil: "networkidle" }); await trainingSubmit(page, "Submit evidence", { "Practice evidence": "Synthetic browser practice response" }); await recorded(async () => await db.niceJobsTrainingSubmission.count() === 3);
    await reviewer.goto(base + reviewPath, { waitUntil: "networkidle" }); await trainingSubmit(reviewer, "Save review", { "Decision": "APPROVED", "Private decision reason": "PRIVATE-TRAINER-BROWSER-NOTES", "Candidate-visible feedback": "Released practical review feedback" }); await recorded(async () => await db.niceJobsTrainingReview.count() === 1);
    await page.goto(base + onboardingPath, { waitUntil: "networkidle" }); assert.ok(!(await page.locator("main").innerText()).includes("PRIVATE-TRAINER-BROWSER-NOTES")); await trainingSubmit(page, "Submit evidence", { "Practice evidence": "Synthetic practical assessment response" }); await recorded(async () => await db.niceJobsTrainingSubmission.count() === 4);
    await reviewer.goto(base + reviewPath, { waitUntil: "networkidle" }); await trainingSubmit(reviewer, "Save review", { "Decision": "PASS", "Private decision reason": "Verified against configured synthetic rubric", "Candidate-visible feedback": "Practical assessment passed" }); await recorded(async () => await db.niceJobsTrainingReview.count() === 2);
    stage = "independent human readiness without activation";
    await page.goto(base + onboardingPath, { waitUntil: "networkidle" }); await trainingSubmit(page, "Request readiness review"); await recorded(async () => (await enrollment()).status === "READINESS_REVIEW");
    await decider.goto(base + reviewPath, { waitUntil: "networkidle" }); await trainingSubmit(decider, "Save readiness decision", { "Decision": "READY", "Private decision reason": "Verified all retained completion evidence", "Candidate-visible feedback": "Ready but not activated" }); await recorded(async () => (await enrollment()).status === "READY");
    assert.equal(await db.niceJobsAssignment.count(), 0); assert.equal(await db.niceJobsWorkerProfile.count(), 0); assert.equal(await db.task.count(), 0);
    stage = "responsive onboarding, reviews and training configuration";
    const trainingDraft = await jobs.create(boss.userId, { code: "TRAINING-CONFIG04", title: "Synthetic training configuration draft", divisionIds: [labs], configuration: config });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto(base + onboardingPath, { waitUntil: "networkidle" }); assert.ok((await page.locator("main").innerText()).includes("Not activated")); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); await page.screenshot({ path: resolve(".next/nicejobs-phase04-onboarding-" + width + ".png"), fullPage: true }); screenshots++;
      await manager.setViewportSize({ width, height: 1000 });
      for (const [view, path] of [["onboarding-list", "/app/nicejobs?view=onboarding&companyId=" + app.companyId + "&divisionId=" + labs + "&status=READY"], ["training-configuration", "/app/nicejobs?view=templates&versionId=" + trainingDraft.id]]) {
        await manager.goto(base + path, { waitUntil: "networkidle" }); if (view === "training-configuration") await manager.getByText("Orientation, OJT and readiness configuration", { exact: true }).click(); assert.ok(await manager.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), view + " overflow " + width); await manager.screenshot({ path: resolve(".next/nicejobs-phase04-" + view + "-" + width + ".png"), fullPage: true }); screenshots++;
      }
    }

    assert.equal(errors, 0);
    const report = { status: "PASS", recordedAt: new Date().toISOString(), browser: await browser.version(), isolated: true, HTTP: ["anonymous denied", "corporate/portal session replay denied"], workflows: ["private interviewer evaluation", "attendance completion", "independent human approval", "offer preparation", "offer review", "offer issuance", "candidate privacy", "candidate acceptance", "no workforce activation", "filtered management pipeline", "draft configuration rendering"], screenshots, widths: [320, 390, 768, 1440], noPageOverflow: true, pageErrors: errors, limitations: "Local dev server and simulated viewports only. No physical devices, screen readers, production TLS or production deployment. Isolated reviewed sessions; no production credentials used." };
    report.workflows.push("context-preserving interviewer search and assignment", "onboarding enrollment", "ordered orientation acknowledgement", "server-graded quiz", "authorized trainer assignment", "OJT evidence and review", "human practical assessment", "independent readiness decision", "zero workforce activation and production tasks", "responsive training configuration");
    writeFileSync(resolve("docs/audit/NICE_JOBS_PHASE_03_BROWSER.json"), JSON.stringify(report, null, 2) + "\n"); console.log("PASS isolated Phase04 authenticated HTTP and interview/approval/offer browser workflows; 28 responsive captures");
  } catch (e) { console.error("Phase04 browser failed at " + stage); if (e instanceof Error) console.error(e.message); process.exitCode = 1; }
  finally { if (browser) await browser.close(); if (server?.pid && server.exitCode === null) { if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" }); else server.kill("SIGTERM"); } closeSync(log); await db.$disconnect(); if (resolve(directory).startsWith(resolve(tmpdir(), "nicejobs-onboarding-browser-"))) rmSync(directory, { recursive: true, force: true }); else { console.error("Unsafe fixture cleanup refused"); process.exitCode = 1; } }
}
void main();
