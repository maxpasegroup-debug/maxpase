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
import { createKnowledgeService } from "../src/server/nicejobs/knowledge";
import { createOperationsService } from "../src/server/domain/operations-service";

async function main() {
  const directory = mkdtempSync(join(tmpdir(), "nicejobs-knowledge-browser-")), file = join(directory, "test.db");
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
      const user = await db.user.create({ data: { email: name + "@phase07-fixture.invalid", personId: person.id, timezone: "Asia/Kolkata" } });
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
    const workerKeys = ["nicejobs.sop.read", "nicejobs.resource.read", "nicejobs.message.read", "nicejobs.knowledge.ack", "nicejobs.lead.self.read", "nicejobs.lead.perform", "nicejobs.workspace.self", "nicejobs.work.perform", "nicejobs.report.self", "nicejobs.blocker.self", "nicejobs.work.read", "notification.read", "reminder.manage", "sia.access.read"];
    const workerRole = await db.role.create({ data: { key: "worker-fixture", name: "Explicit worker fixture", organizationId: labs, permissions: { create: workerKeys.map(key => ({ permission: { connect: { key } } })) } } });
    await db.membership.create({ data: { personId: candidate.personId!, organizationId: labs, roles: { create: { roleId: workerRole.id } } } });
    const identity = await db.siaIdentity.create({ data: { name: "Isolated shared SIA", title: "Worker assistance fixture" } });
    const agentRole = await db.role.create({ data: { key: "worker-agent-fixture", name: "Scoped worker assistance", principalType: "AGENT", organizationId: labs, permissions: { create: workerKeys.filter(key => ["nicejobs.sop.read", "nicejobs.resource.read", "nicejobs.message.read", "nicejobs.knowledge.ack", "nicejobs.lead.self.read", "nicejobs.workspace.self", "nicejobs.report.self", "nicejobs.blocker.self", "nicejobs.work.read", "notification.read"].includes(key) && key !== "nicejobs.knowledge.ack").map(key => ({ permission: { connect: { key } } })) } } });
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
      diagnostic = page; const f = page.locator("form").filter({ has: page.getByRole("button", { name: label, exact: true }) });
      for (const [field, value] of Object.entries(values)) { const input = f.getByLabel(field, { exact: true }); if (await input.evaluate((e: Element) => e.tagName) === "SELECT") await input.selectOption(value); else await input.fill(value); }
      await f.locator('input[type="checkbox"][name="confirmed"]').check(); await f.getByRole("button", { name: label, exact: true }).click();
    }
    stage = "explicit readiness-backed activation";
    await manager.goto(base + "/app/nicejobs?view=activation&applicationReference=" + app.reference, { waitUntil: "networkidle" }); await submit(manager, "Activate worker", { "Reason": "Isolated human activation" }); await recorded(async () => await db.niceJobsAssignment.count({ where: { status: "ACTIVE", onboardingId: { not: null } } }) === 1);
    const assignment = await db.niceJobsAssignment.findFirstOrThrow({ where: { profile: { personId: candidate.personId! }, status: "ACTIVE" } });

    const knowledge = createKnowledgeService(db);
    const reviewerSession = await auth.create(approver.id, secret), reviewer = await actor(reviewerSession.token, false);
    const waitCount = (kind: string, n: number) => recorded(async () => await db.niceJobsKnowledge.count({where:{kind}}) === n);
    const managerDetail = (id:string) => base + "/app/nicejobs?view=knowledge-detail&management=true&versionId=" + id;
    const workerDetail = (id:string) => "/sites/jobs/gateway?view=knowledge-detail&versionId=" + id;
    async function publishUI(id:string) {
      await manager.goto(managerDetail(id),{waitUntil:"networkidle"});await submit(manager,"Submit for review");await recorded(async()=> (await db.niceJobsKnowledgeVersion.findUniqueOrThrow({where:{id}})).status==="IN_REVIEW");
      await reviewer.goto(managerDetail(id),{waitUntil:"networkidle"});await submit(reviewer,"Record independent review",{"Review reason":"Independent browser fixture review"});await recorded(async()=>!!(await db.niceJobsKnowledgeVersion.findUniqueOrThrow({where:{id}})).reviewedAt);
      await manager.goto(managerDetail(id),{waitUntil:"networkidle"});await submit(manager,"Publish version");await recorded(async()=> (await db.niceJobsKnowledgeVersion.findUniqueOrThrow({where:{id}})).status==="PUBLISHED");
    }
    stage="resource draft creation, review and publication";
    await manager.goto(base+"/app/nicejobs?view=content-management&kind=RESOURCE",{waitUntil:"networkidle"});await manager.getByText("Create resource",{exact:true}).click();
    await submit(manager,"Create draft",{"Title":"Isolated resource with a deliberately long title for responsive validation","Description":"Authorized fixture resource","Purpose":"Browser validation only","Company or division":labs,"Resource type":"REFERENCE","Reference text":"Synthetic reference material; not official operating policy"});
    await waitCount("RESOURCE",1);const resource=await db.niceJobsKnowledgeVersion.findFirstOrThrow({where:{content:{kind:"RESOURCE"}}});await publishUI(resource.id);
    stage="resource versioning and preserved historical reference";
    await manager.goto(managerDetail(resource.id),{waitUntil:"networkidle"});await submit(manager,"Create next draft");await recorded(async()=>await db.niceJobsKnowledgeVersion.count({where:{contentId:resource.contentId}})===2);
    const resourceNext=await db.niceJobsKnowledgeVersion.findFirstOrThrow({where:{contentId:resource.contentId,number:2}});await manager.goto(managerDetail(resourceNext.id),{waitUntil:"networkidle"});await submit(manager,"Save draft",{"Title":"Updated isolated resource"});await recorded(async()=>(await db.niceJobsKnowledgeVersion.findUniqueOrThrow({where:{id:resourceNext.id}})).revision===1);await publishUI(resourceNext.id);
    stage="structured SOP creation, review and publication";
    await manager.goto(base+"/app/nicejobs?view=content-management&kind=SOP",{waitUntil:"networkidle"});await manager.getByText("Create SOP",{exact:true}).click();
    const sopTitle="Isolated SOP with a deliberately long title for narrow-screen validation";
    await submit(manager,"Create draft",{"Title":sopTitle,"Description":"Explicit fixture instructions","Purpose":"Validate structured SOP publication","Company or division":labs,"Step 1 title":"Record fixture work","Step 1 instruction":"Record the actual authorized action. If blocked, ask the configured manager.","Step 1 Resource":resourceNext.id});
    await waitCount("SOP",1);const sop=await db.niceJobsKnowledgeVersion.findFirstOrThrow({where:{content:{kind:"SOP"}}});await publishUI(sop.id);
    stage="internal communication creation and publication";
    await manager.goto(base+"/app/nicejobs?view=content-management&kind=COMMUNICATION",{waitUntil:"networkidle"});await manager.getByText("Create communication",{exact:true}).click();
    const messageTitle="Isolated SOP change announcement";
    const messageForm=manager.locator("form").filter({has:manager.getByRole("button",{name:"Create draft",exact:true})});await messageForm.getByLabel("Require acknowledgement").check();
    await submit(manager,"Create draft",{"Title":messageTitle,"Description":"New authorized fixture SOP","Purpose":"Explicit internal update","Company or division":labs,"Message type":"SOP_CHANGE","Message":"Synthetic notice: review the linked published fixture SOP.","Related published SOP":sop.id,"Priority":"HIGH"});await waitCount("COMMUNICATION",1);
    const message=await db.niceJobsKnowledgeVersion.findFirstOrThrow({where:{content:{kind:"COMMUNICATION"}}});await publishUI(message.id);
    stage="worker authorized libraries, read and acknowledgement";
    await worker.goto(base+workerDetail(message.id),{waitUntil:"networkidle"});assert.equal(await db.niceJobsKnowledgeReceipt.count(),0);await submit(worker,"Mark read");await recorded(async()=>!!(await db.niceJobsKnowledgeReceipt.findFirst({where:{versionId:message.id,assignmentId:assignment.id}}))?.readAt);
    await worker.goto(base+workerDetail(message.id),{waitUntil:"networkidle"});await submit(worker,"Acknowledge this version");await recorded(async()=>!!(await db.niceJobsKnowledgeReceipt.findFirst({where:{versionId:message.id,assignmentId:assignment.id}}))?.acknowledgedAt);
    await worker.goto(base+workerDetail(sop.id),{waitUntil:"networkidle"});assert.ok((await worker.locator("main").innerText()).includes("Record the actual authorized action"));await worker.getByRole("link",{name:"Updated isolated resource",exact:true}).click();await worker.waitForURL(/knowledge-detail/);
    assert.equal((await knowledge.detail(candidate.id,resource.id)).version.body,"Synthetic reference material; not official operating policy");
    stage="grounded read-only knowledge assistance";
    await worker.goto(base+"/sites/jobs/gateway?view=worker-sia",{waitUntil:"networkidle"});await worker.getByRole("button",{name:"Show my SOP",exact:true}).click();await recorded(async()=>await db.siaRun.count({where:{userId:candidate.id,status:"SUCCEEDED"}})===1);await worker.getByText("Read-only deterministic assistance; no model-generated completion or business action.",{exact:true}).waitFor();assert.ok((await worker.locator("main").innerText()).includes(sopTitle));assert.equal(await db.siaAction.count(),0);assert.equal(await db.communicationMessage.count(),0);
    stage="responsive worker and manager content views";
    const views=[
      ["my-day",worker,"/sites/jobs/gateway?view=my-day"],["sop-library",worker,"/sites/jobs/gateway?view=worker-sops"],["sop-detail",worker,workerDetail(sop.id)],["resource-library",worker,"/sites/jobs/gateway?view=worker-resources"],["resource-detail",worker,workerDetail(resourceNext.id)],["messages",worker,"/sites/jobs/gateway?view=worker-messages"],["message-detail",worker,workerDetail(message.id)],["sia",worker,"/sites/jobs/gateway?view=worker-sia"],["manager-sops",manager,"/app/nicejobs?view=content-management&kind=SOP"],["manager-resources",manager,"/app/nicejobs?view=content-management&kind=RESOURCE"],["manager-messages",manager,"/app/nicejobs?view=content-management&kind=COMMUNICATION"]
    ] as const;
    for(const width of [320,390,768,1440])for(const [name,page,path]of views){diagnostic=page;await page.setViewportSize({width,height:1000});await page.goto(base+path,{waitUntil:"networkidle"});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),name+" overflow "+width);await page.screenshot({path:resolve(".next-portal-smoke/nicejobs-phase07-"+name+"-"+width+".png"),fullPage:true});screenshots++;}
    await worker.keyboard.press("Tab");assert.ok(await worker.evaluate(()=>document.activeElement!==document.body));assert.equal(errors,0);
    writeFileSync(resolve("docs/audit/NICE_JOBS_PHASE_07_BROWSER.json"),JSON.stringify({status:"PASS",recordedAt:new Date().toISOString(),browser:await browser.version(),isolated:true,workflows:["canonical readiness activation","resource create/edit/review/publish and version history","structured SOP create/review/publish","internal communication publication with SOP reference","worker resource/SOP navigation","explicit worker read and acknowledgement","grounded read-only SIA","corporate/jobs session isolation"],screenshots,widths:[320,390,768,1440],noPageOverflow:true,pageErrors:errors,limitations:"Local Chrome and simulated viewports only. Physical devices, screen readers, complete keyboard/usability and production NOT RUN."},null,2)+"\n");
    console.log("PASS Phase07 browser workflows; "+screenshots+" responsive captures");
  } catch (e) { console.error("Phase07 browser failed at " + stage); if (e instanceof Error) console.error(e.message); if (diagnostic) { console.error(await diagnostic.locator("main").innerText()); await diagnostic.screenshot({ path: resolve(".next-portal-smoke/nicejobs-phase07-failure.png"), fullPage: true }); } process.exitCode = 1; }
  finally { await browser?.close(); if (server?.pid) { if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" }); else server.kill(); } await db.$disconnect(); closeSync(log); if (process.platform === "win32") await new Promise(r => setTimeout(r, 500)); if (resolve(directory).startsWith(resolve(tmpdir(), "nicejobs-knowledge-browser-"))) rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
}
main();
