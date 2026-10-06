/* global FormData, fetch, document, innerWidth, getComputedStyle, console, AbortSignal */
import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { resolve } from "node:path";

const base = process.env.BOSS_SMOKE_ORIGIN ?? "http://127.0.0.1:3000";
assert.ok(base === "https://maxpase.com" || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base));
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const output = resolve(".next/boss-reliability", new URL(base).hostname);
const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(45000) });
mkdirSync(output, { recursive: true });
const decode = s => s.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
function actionForm(html) {
  const form = new FormData();
  for (const match of html.matchAll(/<input\b[^>]*>/g)) {
    const name = match[0].match(/name="([^"]+)"/)?.[1];
    if (name?.startsWith("$ACTION")) form.set(decode(name), decode(match[0].match(/value="([^"]*)"/)?.[1] ?? ""));
  }
  assert.ok([...form.keys()].some(k => k.startsWith("$ACTION")));
  return form;
}
let browser, page, cookie, stage = "login", errors = 0, screenshots = 0;
let receipt;
const receiptPath = resolve(output, "verification-session.json");
const failedRequests = [];
try {
  assert.match(process.env.BOSS_PIN ?? "", /^\d{6}$/);
  const login = await request(base + "/login");
  assert.equal(login.status, 200);
  const form = actionForm(await login.text());
  form.set("email", "boss@maxpase.com"); form.set("pin", process.env.BOSS_PIN);
  delete process.env.BOSS_PIN;
  const signedIn = await request(base + "/login", { method: "POST", body: form, headers: { origin: base }, redirect: "manual" });
  form.delete("pin");
  assert.equal(signedIn.status, 303);
  assert.ok(signedIn.headers.get("location")?.includes("/app/boss"));
  cookie = signedIn.headers.getSetCookie().find(c => c.startsWith("maxpase_session="))?.split(";")[0];
  assert.ok(cookie);
  const claim = JSON.parse(Buffer.from(cookie.slice("maxpase_session=".length).split(".")[1], "base64url").toString("utf8"));
  assert.equal(typeof claim.sessionId, "string");
  receipt = { sessionId: claim.sessionId, userId: claim.sub, issuedAt: new Date(claim.iat * 1000).toISOString(), revoked: false };
  writeFileSync(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "maxpase_session", value: cookie.slice("maxpase_session=".length), url: base, secure: base.startsWith("https:"), httpOnly: true, sameSite: "Lax" }]);
  page = await context.newPage();
  page.on("requestfailed", r => failedRequests.push({ path: new URL(r.url()).pathname, error: r.failure()?.errorText }));
  page.on("pageerror", () => errors++);
  const views = ["overview", "companies", "brands", "people", "projects", "goals", "operations", "decisions", "attention", "communications", "graph", "audit", "system", "briefing", "risks", "opportunities", "changes"];
  for (const width of [1440, 768, 390, 320, 1920]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const view of width === 1440 ? views : ["overview", "brands", "projects", "system"]) {
      stage = `${width} ${view}`;
      const response = await page.goto(`${base}/app/boss?view=${view}`, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200);
      const titles = { overview: "Master Command Center", brands: "Brands & Domains", graph: "Business Graph", audit: "Audit & Security" };
      assert.equal(await page.locator("h1").first().innerText(), titles[view] ?? view[0].toUpperCase() + view.slice(1));
      assert.deepEqual(await page.locator(".workspace-sidebar .workspace-primary a").allTextContents(), ["Overview", "Companies", "Work", "Decisions", "People", "System"]);
      assert.ok(!(await page.locator(".workspace-header").innerText()).includes("Authenticated shell"));
      assert.ok(await page.locator(".boss-navigation a").count() <= 4);
      assert.ok(await page.locator(".boss-summary-text").evaluateAll(items => items.every(e => {
        const node = e.firstChild;
        return [...e.textContent.matchAll(/\S+/g)].every(word => {
          const range = document.createRange(); range.setStart(node, word.index); range.setEnd(node, word.index + word[0].length);
          return range.getClientRects().length === 1;
        });
      })));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (["overview", "companies", "brands"].includes(view)) assert.ok(!(await page.locator(".boss-view").innerText()).includes("NO DATA"));
      if (view === "briefing") {
        for (const row of await page.locator(".executive-view .business-table tbody tr").allTextContents()) {
          assert.ok(row.includes("readable metrics") && row.includes("Last record update"));
          if (row.includes("NO RECORDED WORK")) assert.ok(row.includes("Health not established: no recorded work"));
        }
      }
      if (view === "brands") {
        assert.ok(await page.locator(".boss-brands-table th").last().evaluate(e => e.getBoundingClientRect().width >= 189));
        assert.ok(await page.locator(".boss-brands-table td:last-child > span").evaluateAll(items => items.every(e => getComputedStyle(e).whiteSpace === "nowrap")));
        await page.locator(".boss-domain-evidence summary").first().click();
        const evidence = await page.locator(".boss-domain-evidence").first().innerText();
        for (const label of ["Responsible person", "Domain ownership", "Application route", "Certificate verification"]) assert.ok(evidence.includes(label));
        assert.ok(!evidence.includes("Domain verification: VERIFIED"));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      if (view === "overview") {
        const urgent = await page.locator(".boss-next-action").boundingBox();
        const inventory = await page.locator(".boss-inventory").boundingBox();
        assert.ok(urgent && inventory && urgent.y < inventory.y);
        assert.equal(await page.locator(".boss-attention-summary > a").count(), 6);
        assert.ok((await page.locator(".boss-view").innerText()).includes("Daily briefing"));
        assert.ok((await page.locator(".boss-view").innerText()).includes("Autonomous execution is disabled"));
      }
      if (view === "system") {
        const text = await page.locator(".boss-view").innerText();
        for (const heading of ["Measured on this request", "Operational assurance", "Deployment verification", "Autonomous execution", "DISABLED"]) assert.ok(text.includes(heading));
        assert.ok(!text.includes("LOCAL REQUEST SERVED") && !text.includes("LOCAL SCHEMA READY"));
      }
      await page.screenshot({ path: resolve(output, `${width}-${view}.png`), fullPage: true }); screenshots++;
      if (view === "brands" && width < 1000) {
        const scroll = page.locator('.table-scroll[aria-label="Brands and domains"]');
        await scroll.evaluate(e => { e.scrollLeft = e.scrollWidth; });
        assert.ok(await page.locator(".boss-brands-table td:last-child > span").first().evaluate(e => {
          const cell = e.getBoundingClientRect(), container = e.closest(".table-scroll").getBoundingClientRect();
          return cell.left >= container.left && cell.right <= container.right + 1;
        }));
        await page.screenshot({ path: resolve(output, `${width}-brands-scrolled.png`), fullPage: true }); screenshots++;
      }
    }
  }
  stage = "keyboard and mobile navigation";
  stage = "exact executive queues";
  await page.goto(base + "/app/boss?status=ACTIVE&from=2020-01-01&until=2030-01-01", { waitUntil: "networkidle" });
  const queues = await page.locator(".boss-attention-summary > a").evaluateAll(items => items.map(e => ({ href: e.getAttribute("href"), count: e.querySelector("strong").textContent })));
  for (const queue of queues) {
    await page.goto(base + queue.href, { waitUntil: "networkidle" });
    if (/^\d+$/.test(queue.count)) assert.equal(await page.locator(".boss-view > .executive-band .executive-list > li").count(), Number(queue.count));
    const item = page.locator(".boss-view > .executive-band .executive-list > li a").first();
    if (await item.count()) {
      await item.click(); await page.waitForLoadState("networkidle");
      assert.equal(await page.locator(".boss-view > .executive-band .executive-list > li").count(), 1);
      assert.ok(await page.getByRole("link", { name: "Open source record" }).count());
    }
    await page.getByRole("link", { name: "Back to overview", exact: true }).click();
    await page.waitForLoadState("networkidle");
    assert.equal(new URL(page.url()).searchParams.get("status"), "ACTIVE");
  }
  stage = "exact inventory counts";
  const inventories = await page.locator(".boss-inventory .boss-summary strong a").evaluateAll(items => items.map(e => ({ href: e.getAttribute("href"), count: Number(e.textContent) })));
  for (const inventory of inventories) {
    await page.goto(base + inventory.href, { waitUntil: "networkidle" });
    const kind = new URL(page.url()).searchParams.get("inventory");
    assert.equal(await page.locator(kind === "companies" ? ".boss-company" : ".boss-view > .executive-band .executive-list > li").count(), inventory.count);
    await page.getByRole("link", { name: "Back to overview", exact: true }).click();
    await page.waitForLoadState("networkidle");
    assert.equal(new URL(page.url()).searchParams.get("status"), "ACTIVE");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/app/boss", { waitUntil: "networkidle" });
  assert.ok((await page.locator(".workspace-header").innerText()).includes("IST"));
  const menu = page.getByRole("button", { name: "Open navigation" });
  assert.ok(await menu.evaluate(e => e.getBoundingClientRect().width >= 44 && e.getBoundingClientRect().height >= 44));
  stage = "mobile drawer opening";
  await menu.click();
  const drawer = page.getByRole("dialog", { name: "MAXPASE navigation" });
  assert.ok(await drawer.isVisible());
  assert.equal(await menu.getAttribute("aria-expanded"), "true");
  stage = "mobile drawer focus loop";
  for (let i = 0; i < 28; i++) {
    await page.keyboard.press("Tab");
    assert.ok(await drawer.evaluate(e => e.contains(document.activeElement)));
  }
  await page.screenshot({ path: resolve(output, "390-navigation-drawer.png"), fullPage: true }); screenshots++;
  stage = "mobile Escape and focus restoration";
  await page.keyboard.press("Escape");
  assert.ok(!(await drawer.isVisible()));
  assert.ok(await menu.evaluate(e => e === document.activeElement));
  stage = "mobile destination navigation";
  await menu.click();
  await drawer.locator(".workspace-primary a").filter({ hasText: "Companies" }).click();
  await page.waitForURL(url => url.searchParams.get("view") === "companies");
  assert.ok(!(await drawer.isVisible()));
  assert.ok(await page.locator(".workspace-breadcrumbs").innerText().then(s => s.includes("Companies")));
  stage = "keyboard skip link";
  await page.keyboard.press("Shift+Tab");
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  assert.ok(await page.locator("#main-content").evaluate(e => e === document.activeElement));
  stage = "account timezone persistence";
  await page.goto(base + "/app/account", { waitUntil: "networkidle" });
  assert.equal(await page.locator("#account-timezone").inputValue(), "Asia/Kolkata");
  if (process.env.BOSS_SMOKE_SKIP_PREFERENCES !== "true") try {
    stage = "UTC preference selection";
    await page.locator("#account-timezone").selectOption("UTC");
    stage = "UTC preference save";
    await page.getByRole("button", { name: "Save", exact: true }).click();
    stage = "UTC saved confirmation";
    await page.getByRole("status").filter({ hasText: "Timezone saved" }).waitFor();
    stage = "UTC persistence reload";
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("#account-timezone").inputValue(), "UTC");
    await page.goto(base + "/app/boss", { waitUntil: "networkidle" });
    assert.ok((await page.locator(".workspace-header").innerText()).includes("UTC"));
    assert.ok((await page.locator(".boss-selector time").innerText()).includes("UTC"));
  } finally {
    stage = "IST restoration page";
    await page.goto(base + "/app/account", { waitUntil: "networkidle" });
    stage = "IST restoration save";
    await page.locator("#account-timezone").selectOption("Asia/Kolkata");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    stage = "IST restoration confirmation";
    await page.getByRole("status").filter({ hasText: "Timezone saved" }).waitFor();
  }
  stage = "combined filter submission";
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/app/boss?view=projects", { waitUntil: "networkidle" });
  const company = await page.locator('.boss-selector option').evaluateAll(options => options.find(o => o.textContent.includes("AIRA"))?.value);
  assert.ok(company);
  await page.locator('.boss-selector select').selectOption(company);
  await Promise.all([page.waitForURL(url => url.searchParams.get("companyId") === company), page.locator('.boss-selector button').click()]);
  await page.locator('.executive-filters [name=status]').selectOption("ACTIVE");
  await page.locator('.executive-filters [name=from]').fill("2020-01-01");
  await page.locator('.executive-filters [name=until]').fill("2030-12-31");
  await Promise.all([page.waitForURL(url => url.searchParams.get("status") === "ACTIVE"), page.locator('.executive-filters button').click()]);
  const expected = { companyId: company, status: "ACTIVE", from: "2020-01-01", until: "2030-12-31" };
  function checkURL(view) {
    const params = new URL(page.url()).searchParams;
    assert.equal(params.get("view"), view);
    for (const [key, value] of Object.entries(expected)) assert.equal(params.get(key), value);
  }
  checkURL("projects");
  assert.ok((await page.locator(".workspace-context").innerText()).includes("AIRA"));
  assert.equal(await page.locator('.executive-filters [name=status]').inputValue(), "ACTIVE");
  for (const view of ["goals", "projects"]) {
    await Promise.all([page.waitForURL(url => url.searchParams.get("view") === view), page.locator(`.boss-navigation a[href*="view=${view}"]`).click()]);
    checkURL(view);
  }
  await Promise.all([page.waitForURL(url => url.searchParams.get("companyId") === company), page.locator('.boss-selector button').click()]);
  checkURL("projects");
  stage = "detailed module and predictable return";
  await page.locator(".workspace-sidebar .workspace-secondary summary").click();
  await page.locator(".workspace-sidebar .workspace-secondary a").filter({ hasText: /^My tasks$/ }).click();
  await page.waitForURL(url => url.pathname === "/app/operations/my-tasks");
  stage = "My Tasks module title";
  assert.equal(await page.locator("h1").first().innerText(), "My Tasks");
  await page.locator('.work-list-filter-panel > summary').click();
  await page.locator(".execution-filters [name=status]").selectOption("TODO");
  await page.locator(".execution-filters button").click();
  await page.waitForURL(url => url.searchParams.get("status") === "TODO");
  stage = "My Tasks return context";
  assert.ok((await page.locator(".workspace-context").innerText()).includes("AIRA"));
  await page.locator(".workspace-back").click();
  await page.waitForURL(url => url.pathname === "/app/boss");
  checkURL("projects");
  await page.locator(".workspace-sidebar .workspace-primary a").filter({ hasText: /^Decisions$/ }).click();
  await page.waitForURL(url => url.searchParams.get("view") === "decisions");
  await page.locator(".workspace-sidebar .workspace-secondary summary").click();
  await page.locator(".workspace-sidebar .workspace-secondary a").filter({ hasText: /^Approvals$/ }).click();
  await page.waitForURL(url => url.pathname === "/app/operations/approvals");
  stage = "Approvals module title";
  assert.equal(await page.locator("h1").first().innerText(), "Approval inbox");
  await page.locator(".workspace-back").click();
  await page.waitForURL(url => url.pathname === "/app/boss");
  checkURL("decisions");
  stage = "detailed executive navigation";
  await page.locator(".workspace-sidebar .workspace-secondary summary").click();
  await page.locator(".workspace-sidebar .workspace-secondary a").filter({ hasText: /^Performance indicators$/ }).click();
  await page.waitForURL(url => url.pathname === "/app/executive/kpis");
  assert.equal(await page.locator("h1").first().innerText(), "Performance indicators");
  assert.equal(await page.locator(".executive-navigation").count(), 0);
  await page.locator(".workspace-back").click();
  await page.waitForURL(url => url.pathname === "/app/boss");
  checkURL("decisions");
  stage = "Phase 4 authorized workflow surfaces";
  const operationalKinds = ["approvals", "requests", "my-tasks", "reminders", "escalations", "notifications", "activity"];
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const kind of operationalKinds) {
      stage = `${width} operational ${kind}`;
      const response = await page.goto(`${base}/app/operations/${kind}?organizationId=${encodeURIComponent(company)}&companyId=${encodeURIComponent(company)}&returnView=overview&bossCompanyId=${encodeURIComponent(company)}&bossStatus=ACTIVE`, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200);
      assert.ok(await page.locator('.work-list-filter-panel > summary').count());
      assert.ok(await page.locator('.saved-filter-panel > summary').count());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.ok((await page.locator('.workspace-context').innerText()).includes("AIRA"));
      assert.ok(await page.locator('.notification-indicator').count());
      if (kind === "approvals") {
        assert.equal(await page.locator('h1').innerText(), "Approval inbox");
        await page.locator('.work-list-filter-panel > summary').click();
        assert.equal(await page.locator('.execution-filters [name=approverUserId] option:checked').innerText(), "Assigned to me");
        await page.locator('.work-list-filter-panel > summary').click();
      }
      await page.screenshot({ path: resolve(output, `phase4-${kind}-${width}.png`), fullPage: true }); screenshots++;
    }
  }
  stage = "Phase 4 creation shortcut company context";
  await page.goto(`${base}/app/boss?companyId=${encodeURIComponent(company)}&status=ACTIVE`, { waitUntil: "networkidle" });
  await page.getByRole('navigation', { name: 'Authorized workflow shortcuts' }).getByRole('link', { name: 'New task', exact: true }).click();
  await page.waitForURL(url => url.pathname === "/app/execution/tasks");
  assert.equal(await page.locator('.business-form [name=organizationId]').inputValue(), company);
  assert.equal(new URL(page.url()).searchParams.get('bossStatus'), 'ACTIVE');
  await page.locator('.workspace-back').click();
  await page.waitForURL(url => url.pathname === '/app/boss');
  assert.equal(new URL(page.url()).searchParams.get('companyId'), company);
  assert.equal(new URL(page.url()).searchParams.get('status'), 'ACTIVE');
  stage = "invalid filter handling";
  await page.goto(`${base}/app/boss?view=projects&companyId=${encodeURIComponent(company)}&from=2026-02-30`);
  assert.equal(await page.locator("h1").first().innerText(), "Invalid filters");
  assert.equal(errors, 0);
  console.log(JSON.stringify({ status: "PASS", origin: base, views: views.length, screenshots, widths: [320, 390, 768, 1440, 1920], filters: "company, view, status and date persistence", pageErrors: errors, navigation: "six groups, drawer focus trap, Escape and keyboard skip link", moduleReturns: "My Tasks, Approvals and Performance indicators; independent task filter", timezone: process.env.BOSS_SMOKE_SKIP_PREFERENCES === "true" ? "IST verified read-only; preference mutation not run" : "persisted UTC and restored IST", output }));
} catch (error) {
  console.error(`Boss browser verification failed at ${stage} (${error.name}); credentials and cookies withheld.`);
  console.error(JSON.stringify({ failedRequests }));
  if (page) await page.screenshot({ path: resolve(output, "failure.png"), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  delete process.env.BOSS_PIN;
  if (cookie) {
    try {
      const html = await (await request(base + "/app/account", { headers: { cookie } })).text();
      const signout = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].find(m => /Sign out/.test(m[0]));
      assert.ok(signout);
      const result = await request(base + "/app/account", { method: "POST", body: actionForm(signout[0]), headers: { origin: base, cookie }, redirect: "manual" });
      assert.equal(result.status, 303);
      receipt.revoked = true;
      writeFileSync(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
      console.log("PASS verification session revoked.");
    } catch { console.error("Verification session cleanup requires review."); process.exitCode = 1; }
  }
  if (browser) await browser.close();
}
