import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync, mkdirSync, openSync, closeSync, writeFileSync } from "node:fs";
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
  const directory = mkdtempSync(join(tmpdir(), "nicejobs-browser-")), file = join(directory, "test.db");
  const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
  const base = "http://127.0.0.1:3006", secret = randomBytes(32).toString("base64url");
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
  const output = resolve(directory, "screenshots"), log = openSync(join(directory, "server.log"), "w");
  let server: ReturnType<typeof spawn> | undefined, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let stage = "fixture", screenshots = 0, errors = 0;
  try {
    const sql = new DatabaseSync(file);
    for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
    sql.close();
    const boss = await provisionBoss(db, { BOSS_PIN: String(randomInt(100000, 1000000)) });
    const service = createNiceJobsService(db), auth = createAuthenticationService(db);
    const jobs = await service.seedKnown(boss.userId), job = jobs.find(j => j.title === "Business Development Manager")!;
    const labs = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id;
    const worker = await db.person.create({ data: { displayName: "Isolated workforce person with a deliberately long management reference name" } });
    await db.membership.create({ data: { personId: worker.id, organizationId: labs } });
    const corporate = await auth.create(boss.userId, secret), portal = await auth.create(boss.userId, secret, undefined, undefined, "jobs");
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", DATABASE_URL: "file:" + file.replaceAll("\\", "/"), AUTH_SECRET: secret, AUTH_COOKIE_SECURE: "false", APP_ORIGIN: base };
    delete env.BOSS_PIN;
    server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3006"], { env, stdio: ["ignore", log, log], windowsHide: true });
    stage = "readiness";
    for (let i = 0; ; i++) {
      if (server!.exitCode !== null) throw new Error("Owned fixture server exited; possible port conflict");
      try { if ((await fetch(base + "/login", { signal: AbortSignal.timeout(5000) })).ok) break; } catch { /* This owned local server is still starting. */ }
      if (i > 60) throw new Error("Fixture server unavailable");
      await new Promise(r => setTimeout(r, 1000));
    }
    stage = "HTTP access boundaries";
    const request = (path: string, cookie?: string) => fetch(base + path, { redirect: "manual", headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(45000) });
    assert.equal((await request("/app/nicejobs")).status, 307);
    assert.equal((await request("/sites/jobs/gateway?view=templates")).status, 307);
    assert.equal((await request("/app/nicejobs", "maxpase_session=" + portal.token)).status, 307);
    assert.equal((await request("/sites/jobs/gateway?view=templates", "nice_jobs_session=" + corporate.token)).status, 307);
    const correct = await request("/app/nicejobs", "maxpase_session=" + corporate.token);
    assert.equal(correct.status, 200); assert.ok((await correct.text()).includes("Academic Advisor"));
    browser = await chromium.launch({ headless: true, channel: "chrome" });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: "nice_jobs_session", value: portal.token, url: base, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage(); page.on("pageerror", () => errors++);
    page.setDefaultTimeout(45000);
    const recorded = async (check: () => Promise<boolean>) => {
      for (let i = 0; i < 90; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 500)); }
      throw new Error("The fixture mutation was not confirmed in its database");
    };
    const visit = async (path: string) => { const r = await page.goto(base + path, { waitUntil: "networkidle" }); assert.equal(r?.status(), 200); };
    stage = "gateway navigation and draft detail";
    await visit("/sites/jobs/gateway"); await page.getByRole("link", { name: "Templates", exact: true }).click();
    await page.getByRole("link", { name: "Business Development Manager", exact: true }).click();
    await page.getByRole("heading", { name: "Business Development Manager", exact: true }).waitFor();
    await page.getByText("Not configured yet", { exact: true }).first().waitFor();
    stage = "draft edit";
    await page.getByText("Edit draft", { exact: true }).click();
    const edit = page.locator("form").filter({ has: page.locator('input[value="edit"][name="operation"]') });
    await edit.getByLabel("Description").fill("Explicit isolated draft description; no invented compensation or targets.");
    await edit.getByRole("button", { name: "Save", exact: true }).click();
    await edit.getByRole("status").waitFor();
    assert.equal((await service.detail(boss.userId, job.id)).version.description, "Explicit isolated draft description; no invented compensation or targets.");
    stage = "publication";
    const publish = page.locator("form").filter({ has: page.locator('input[value="PUBLISHED"][name="to"]') });
    await publish.getByLabel("Reason").fill("Human publication decision in an isolated fixture");
    page.once("dialog", (dialog: { accept: () => Promise<void> }) => dialog.accept());
    await publish.getByRole("button", { name: "Publish", exact: true }).click();
    await recorded(async () => !!(await db.niceJobsVersion.findUniqueOrThrow({ where: { id: job.id } })).publishedAt);
    await visit("/sites/jobs/gateway?view=published");
    assert.ok((await page.locator("main").innerText()).includes("Business Development Manager"));
    assert.ok(!(await page.locator("table").innerText()).includes("Academic Advisor"));
    stage = "prepare assignment";
    await visit(`/sites/jobs/gateway?view=workforce&divisionId=${labs}`);
    const assign = page.locator("form").filter({ has: page.locator('input[value="assign"][name="operation"]') });
    await assign.locator('select[name="personId"]').selectOption(worker.id);
    await assign.locator('select[name="versionId"]').selectOption(job.id);
    page.once("dialog", (dialog: { accept: () => Promise<void> }) => dialog.accept());
    await assign.getByRole("button", { name: "Prepare assignment", exact: true }).click();
    await recorded(async () => await db.niceJobsAssignment.count() === 1);
    assert.equal(await db.niceJobsAssignment.count(), 1);
    await visit(`/sites/jobs/gateway?view=workforce&divisionId=${labs}`);
    stage = "lifecycle and history audit";
    const lifecycle = page.locator("form").filter({ has: page.locator('input[value="lifecycle"][name="operation"]') });
    await lifecycle.getByLabel("Reason / evidence").fill("Human approval attestation, not an automated recruitment decision");
    page.once("dialog", (dialog: { accept: () => Promise<void> }) => dialog.accept());
    await lifecycle.getByRole("button", { name: "Record stage", exact: true }).click();
    await recorded(async () => (await db.niceJobsAssignment.findFirst())?.lifecycle === "APPROVED");
    assert.equal((await service.workforce(boss.userId)).records[0].lifecycle, "APPROVED");
    assert.ok(await db.auditEvent.findFirst({ where: { action: "nicejobs.worker.transitioned", actorUserId: boss.userId, organizationId: labs } }));
    stage = "responsive captures";
    mkdirSync(output, { recursive: true });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const view of ["templates", "published", "drafts", "workforce"]) {
        await visit(`/sites/jobs/gateway?view=${view}${view === "workforce" ? "&divisionId=" + labs : ""}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        await page.screenshot({ path: join(output, `${view}-${width}.png`), fullPage: true, animations: "disabled", timeout: 60000 }); screenshots++;
      }
    }
    assert.equal(errors, 0);
    const report = { status: "PASS", recordedAt: new Date().toISOString(), browser: await browser.version(), isolated: true, HTTP: ["corporate authorized and anonymous", "portal authorized and anonymous", "corporate/portal replay rejected"], workflows: ["gateway entry", "draft edit", "publication", "prepared assignment", "human lifecycle attestation", "actor/scope audit"], screenshots, widths: [320, 390, 768, 1440], noPageOverflow: true, pageErrors: errors, limitations: "Development-mode loopback and simulated viewports only. Screenshots are transient private fixture artifacts and are removed during cleanup. No production, live TLS, physical device or screen-reader acceptance." };
    writeFileSync(resolve("docs/audit/NICE_JOBS_PHASE_01_BROWSER.json"), JSON.stringify(report, null, 2) + "\n");
    console.log("PASS isolated Nice Jobs HTTP, realm replay, management actions, audit and 16 responsive captures");
  } catch (e) {
    console.error("Nice Jobs isolated smoke failed at " + stage + "; no production service was accessed.");
    if (e instanceof Error) console.error(e.message);
    if (browser) await browser.contexts()[0]?.pages()[0]?.screenshot({ path: resolve(".next/nicejobs-fixture-failure.png"), fullPage: true });
    process.exitCode = 1;
  }
  finally {
    await browser?.close();
    if (server?.pid && server.exitCode === null) {
      try { if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" }); else server.kill("SIGTERM"); } catch { /* Only this owned fixture process is targeted. */ }
      await new Promise<void>(r => { if (server!.exitCode !== null) r(); else { server!.once("exit", () => r()); setTimeout(r, 5000); } });
    }
    closeSync(log); await db.$disconnect();
    assert.ok(directory.startsWith(join(tmpdir(), "nicejobs-browser-")));
    rmSync(directory, { recursive: true, force: true });
  }
}
void main();
