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

async function main() {
  const directory = mkdtempSync(join(tmpdir(), "nicejobs-applications-browser-")), file = join(directory, "test.db");
  const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
  const base = "http://127.0.0.1:3006", secret = randomBytes(32).toString("base64url");
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
  const log = openSync(join(directory, "server.log"), "w");
  let server: ReturnType<typeof spawn> | undefined, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let stage = "fixture", screenshots = 0, errors = 0;
  try {
    const sql = new DatabaseSync(file);
    for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
    sql.close();
    const boss = await provisionBoss(db, { BOSS_PIN: String(randomInt(100000, 1000000)) });
    const jobs = createNiceJobsService(db), auth = createAuthenticationService(db);
    const labs = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id;
    const career = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-career-hub" } })).id;
    const person = await db.person.create({ data: { displayName: "Isolated candidate with a deliberately long name for responsive validation" } });
    const candidate = await db.user.create({ data: { email: "candidate@fixture.invalid", personId: person.id } });
    const role = await db.role.create({ data: { key: "fixture-candidate", name: "Reviewed candidate", organizationId: career, permissions: { create: ["organization.read", "nicejobs.application.self", "notification.read"].map(key => ({ permission: { connect: { key } } })) } } });
    await db.membership.create({ data: { personId: person.id, organizationId: career, roles: { create: { roleId: role.id } } } });
    const job = await jobs.create(boss.userId, { code: "BROWSER-PHASE02", title: "Isolated application screening position with a deliberately long job title", visibility: "PUBLIC", divisionIds: [labs], configuration: { schemaVersion: 1, application: { fields: [{ key: "experience", label: "Experience", type: "NUMBER", required: true }, { key: "answer", label: "Screening answer", type: "SELECT", options: ["Yes", "No"], required: true }] }, eligibility: { rules: [{ field: "experience", operator: "GTE", value: 2 }] }, screening: { questions: [{ field: "answer", operator: "EQ", value: "Yes", weight: 1 }], passMark: 80 } } });
    await jobs.changeJob(boss.userId, { id: job.id, revision: 0, to: "PUBLISHED", reason: "Isolated publication" });
    const corporate = await auth.create(boss.userId, secret), portal = await auth.create(candidate.id, secret, undefined, undefined, "jobs");
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", DATABASE_URL: "file:" + file.replaceAll("\\", "/"), AUTH_SECRET: secret, AUTH_COOKIE_SECURE: "false", APP_ORIGIN: base }; delete env.BOSS_PIN;
    server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3006"], { env, stdio: ["ignore", log, log], windowsHide: true });
    stage = "readiness";
    for (let i = 0; ; i++) {
      if (server.exitCode !== null) throw new Error("Owned fixture server exited; possible port conflict");
      try { if ((await fetch(base + "/login", { signal: AbortSignal.timeout(5000) })).ok) break; } catch { /* Owned server startup only. */ }
      if (i > 60) throw new Error("Fixture server unavailable"); await new Promise(r => setTimeout(r, 1000));
    }
    stage = "HTTP realm isolation";
    const request = (path: string, cookie?: string) => fetch(base + path, { redirect: "manual", headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(45000) });
    assert.equal((await request("/app/nicejobs?view=applications")).status, 307);
    assert.equal((await request("/sites/jobs/gateway?view=my-applications")).status, 307);
    assert.equal((await request("/app/nicejobs?view=applications", "maxpase_session=" + portal.token)).status, 307);
    assert.equal((await request("/sites/jobs/gateway?view=my-applications", "nice_jobs_session=" + corporate.token)).status, 307);
    browser = await chromium.launch({ headless: true, channel: "chrome" });
    const context = await browser.newContext({ viewport: { width: 390, height: 1000 } });
    await context.addCookies([{ name: "nice_jobs_session", value: portal.token, url: base, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage(); page.on("pageerror", () => errors++); page.setDefaultTimeout(45000);
    const visit = async (path: string) => { const response = await page.goto(base + path, { waitUntil: "networkidle" }); assert.equal(response?.status(), 200); };
    const recorded = async (check: () => Promise<boolean>) => { for (let i = 0; i < 90; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 500)); } throw new Error("Fixture mutation was not recorded"); };
    stage = "candidate application";
    await visit("/sites/jobs/gateway?view=opportunities"); await page.getByRole("button", { name: "Start application", exact: true }).click();
    await recorded(async () => await db.niceJobsApplication.count() === 1);
    const application = await db.niceJobsApplication.findFirstOrThrow();
    await visit(`/sites/jobs/gateway?view=my-applications&reference=${application.reference}`);
    await page.getByLabel("Experience").fill("3"); await page.getByLabel("Screening answer").selectOption("Yes");
    await page.getByRole("button", { name: "Review application", exact: true }).click();
    await page.getByRole("heading", { name: "Review your application" }).waitFor();
    assert.equal((await db.niceJobsApplication.findUniqueOrThrow({ where: { id: application.id } })).status, "DRAFT");
    await page.getByRole("button", { name: "Submit application", exact: true }).click();
    await recorded(async () => (await db.niceJobsApplication.findUniqueOrThrow({ where: { id: application.id } })).status === "SUBMITTED");
    const submitted = await db.niceJobsApplication.findUniqueOrThrow({ where: { id: application.id } }); assert.match(submitted.applicationId!, /^NJ-\d{4}-\d{6}$/);
    await visit(`/sites/jobs/gateway?view=my-applications&reference=${application.reference}`);
    assert.ok(!(await page.locator("main").innerText()).includes("Decision history"));
    assert.equal(await page.getByRole("link", { name: "Applications", exact: true }).count(), 0);
    stage = "management decisions";
    const managed = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await managed.addCookies([{ name: "maxpase_session", value: corporate.token, url: base, httpOnly: true, sameSite: "Lax" }]);
    const manager = await managed.newPage(); manager.on("pageerror", () => errors++); manager.setDefaultTimeout(45000);
    const managementPath = `/app/nicejobs?view=applications&companyId=${submitted.companyId}&divisionId=${labs}&reference=${application.reference}`;
    for (const [label, operation, expected] of [["Evaluate eligibility", "ELIGIBILITY", "SCREENING"], ["Evaluate screening", "SCREENING", "SCREENING"], ["Shortlist", "SHORTLIST", "SHORTLISTED"]]) {
      await manager.goto(base + managementPath, { waitUntil: "networkidle" });
      await manager.locator("summary").filter({ hasText: new RegExp("^" + label + "$") }).click();
      const form = manager.locator("form").filter({ has: manager.locator(`input[name="operation"][value="${operation}"]`) });
      await form.getByLabel("Management-only reason").fill("Explicit isolated management evidence");
      manager.once("dialog", (dialog: { accept: () => Promise<void> }) => dialog.accept());
      await form.getByRole("button", { name: label, exact: true }).click();
      await recorded(async () => !!await db.niceJobsApplicationHistory.findFirst({ where: { applicationId: application.id, action: operation } }));
      assert.equal((await db.niceJobsApplication.findUniqueOrThrow({ where: { id: application.id } })).status, expected);
    }
    assert.equal(await db.niceJobsAssignment.count(), 0);
    stage = "draft configuration editor";
    const draft = await jobs.create(boss.userId, { code: "BROWSER-CONFIG", title: "Isolated configuration fixture", visibility: "PUBLIC", divisionIds: [labs] });
    await manager.goto(base + `/app/nicejobs?view=templates&versionId=${draft.id}`, { waitUntil: "networkidle" });
    await manager.locator("summary").filter({ hasText: /^Application and screening configuration$/ }).click();
    const config = manager.locator("form").filter({ has: manager.locator('input[name="operation"][value="CONFIGURE"]') });
    await config.getByRole("button", { name: "Add field", exact: true }).click();
    await config.getByLabel("Label", { exact: true }).fill("Isolated answer"); await config.getByLabel(/^Answer type/).selectOption("NUMBER");
    await config.getByRole("button", { name: "Add eligibility rule", exact: true }).click(); await config.getByLabel("Expected answer").fill("2");
    await config.getByRole("button", { name: "Add screening question", exact: true }).click(); await config.getByLabel("Expected answer").nth(1).fill("2");
    await config.getByLabel("Pass mark (%)").fill("80"); await config.getByRole("button", { name: "Save application configuration", exact: true }).click();
    await recorded(async () => !!(await db.niceJobsVersion.findUniqueOrThrow({ where: { id: draft.id } })).configuration);
    const configuration = JSON.parse((await db.niceJobsVersion.findUniqueOrThrow({ where: { id: draft.id } })).configuration!);
    assert.equal(configuration.application.fields[0].type, "NUMBER"); assert.equal(configuration.screening.passMark, 80);
    stage = "responsive captures";
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await manager.setViewportSize({ width, height: 1000 });
      for (const [view, actor, path] of [["opportunities", page, "/sites/jobs/gateway?view=opportunities"], ["candidate", page, `/sites/jobs/gateway?view=my-applications&reference=${application.reference}`], ["pipeline", manager, `/app/nicejobs?view=applications&status=SHORTLISTED&divisionId=${labs}`], ["management", manager, managementPath]] as const) {
        await actor.goto(base + path, { waitUntil: "networkidle" });
        assert.ok(await actor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${view} overflow at ${width}`);
        await actor.screenshot({ path: resolve(`.next/nicejobs-phase02-${view}-${width}.png`), fullPage: true, animations: "disabled" }); screenshots++;
      }
    }
    assert.equal(errors, 0);
    const report = { status: "PASS", recordedAt: new Date().toISOString(), browser: await browser.version(), isolated: true, HTTP: ["anonymous denied", "corporate/portal replay denied"], workflows: ["candidate creates draft", "review remains draft", "reviews and submits", "human eligibility", "human screening", "human shortlist", "candidate privacy and navigation", "no workforce activation", "draft configuration editor"], screenshots, widths: [320, 390, 768, 1440], noPageOverflow: true, pageErrors: errors, limitations: "Local development server and simulated viewports only. No physical devices, live TLS, production or screen-reader acceptance. Sessions generated using existing authentication service in an isolated fixture." };
    writeFileSync(resolve("docs/audit/NICE_JOBS_PHASE_02_BROWSER.json"), JSON.stringify(report, null, 2) + "\n");
    console.log("PASS isolated Phase 02 HTTP realm isolation, candidate submission, management decisions and 16 responsive captures");
  } catch (e) {
    console.error("Phase 02 browser smoke failed at " + stage); if (e instanceof Error) console.error(e.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (server?.pid && server.exitCode === null) { if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" }); else server.kill("SIGTERM"); }
    closeSync(log); await db.$disconnect();
    if (resolve(directory).startsWith(resolve(tmpdir(), "nicejobs-applications-browser-"))) rmSync(directory, { recursive: true, force: true });
    else { console.error("Unsafe fixture cleanup refused"); process.exitCode = 1; }
  }
}
void main();
