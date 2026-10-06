import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { BOSS_EMAIL } from "../src/server/group/identity";
import { createAuthenticationService } from "../src/server/auth/service";
import { config } from "../src/server/config";

process.loadEnvFile(".env");
const db = new PrismaClient();
const authenticationService = createAuthenticationService(db);
const base = process.env.MAXPASE_SMOKE_URL ?? "http://127.0.0.1:3000";
const target = new URL(base);
assert.equal(target.protocol, "http:"); assert.ok(["127.0.0.1", "localhost"].includes(target.hostname)); assert.equal(target.origin, base);
let issuedToken: string | undefined;
const decode = (s: string) => s.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
async function main() {
  assert.match(process.env.BOSS_PIN ?? "", /^[0-9]{6}$/);
  const landing = await fetch(base); assert.equal(landing.status, 200);
  const landingHtml = await landing.text(); assert.match(landingHtml, /MAXPASE/); assert.match(landingHtml, /href="\/login"/);
  const image = await fetch(base + "/images/group-workspace.jpg"); assert.equal(image.status, 200); assert.ok((await image.arrayBuffer()).byteLength > 10000);
  const login = await fetch(base + "/login"); assert.equal(login.status, 200);
  const html = await login.text(); assert.match(html, /name="pin"/); assert.doesNotMatch(html, /name="pin"[^>]*value=/);
  const form = new FormData();
  for (const input of html.matchAll(/<input\b[^>]*>/g)) {
    const name = input[0].match(/name="([^"]+)"/)?.[1];
    if (name?.startsWith("$ACTION")) form.append(decode(name), decode(input[0].match(/value="([^"]*)"/)?.[1] ?? ""));
  }
  assert.ok([...form.keys()].some(k => k.startsWith("$ACTION")));
  form.set("email", BOSS_EMAIL); form.set("pin", process.env.BOSS_PIN!);
  const response = await fetch(base + "/login", { method: "POST", body: form, headers: { origin: process.env.APP_ORIGIN ?? base }, redirect: "manual" });
  assert.equal(response.status, 303); assert.match(response.headers.get("location") ?? "", /\/app\/boss$/);
  const cookie = response.headers.getSetCookie().map(v => v.split(";")[0]).join("; "); assert.ok(cookie);
  issuedToken = response.headers.getSetCookie().find(v => v.startsWith(config.AUTH_COOKIE_NAME + "="))?.split(";")[0].slice(config.AUTH_COOKIE_NAME.length + 1);
  assert.ok(issuedToken);
  const headers = { cookie };
  for (const view of ["overview", "companies", "brands", "people", "projects", "goals", "operations", "decisions", "attention", "communications", "graph", "audit", "system", "briefing", "risks", "opportunities", "changes"]) {
    const page = await fetch(base + "/app/boss?view=" + view, { headers }); assert.equal(page.status, 200);
    const body = await page.text(); assert.match(body, /Master Command Center/); assert.doesNotMatch(body, /Boss Panel unavailable/);
  }
  const aira = await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" }, select: { id: true } });
  const scoped = await fetch(base + "/app/boss?companyId=" + aira.id, { headers }); assert.equal(scoped.status, 200);
  const denied = await fetch(base + "/app/boss?companyId=forged", { headers }); assert.match(await denied.text(), /Boss Panel unavailable/);
  await authenticationService.revoke(issuedToken!, config.AUTH_SECRET); issuedToken = undefined;
  const revoked = await fetch(base + "/app/boss", { headers, redirect: "manual" }); assert.equal(revoked.status, 307);
  console.log("PASS local landing/image, actual PIN form submission, authenticated 17 Boss views, company context, forged scope denial and session revocation; no secret output or production/browser acceptance.");
}
main().catch(() => { console.error("Boss login HTTP smoke failed; no credential or response body is displayed."); process.exitCode = 1; }).finally(async () => { if (issuedToken) await authenticationService.revoke(issuedToken, config.AUTH_SECRET); delete process.env.BOSS_PIN; await db.$disconnect(); });
