import assert from "node:assert/strict";

const base = process.env.MAXPASE_SMOKE_URL ?? "http://127.0.0.1:3000";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error("Hardening smoke is local-only");
async function main() {
  const live = await fetch(base + "/api/health");
  assert.equal(live.status, 200); assert.deepEqual(await live.json(), { status: "alive" });
  assert.equal(live.headers.get("cache-control"), "no-store");
  assert.equal(live.headers.get("x-content-type-options"), "nosniff");
  assert.equal(live.headers.get("x-frame-options"), "DENY");
  assert.equal(live.headers.get("referrer-policy"), "no-referrer");
  assert.match(live.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  const ready = await fetch(base + "/api/ready");
  const expected = process.env.MAXPASE_EXPECT_READY === "false" ? 503 : 200;
  assert.equal(ready.status, expected);
  const payload = await ready.json(); assert.equal(payload.status, expected === 200 ? "ready" : "unavailable");
  assert.doesNotMatch(JSON.stringify(payload), /AUTH_SECRET|DATABASE_URL|password|Prisma|stack|file:/i);
  assert.equal(ready.headers.get("cache-control"), "no-store");
  const protectedPage = await fetch(base + "/app/executive", { redirect: "manual" });
  assert.equal(protectedPage.status, 307); assert.match(protectedPage.headers.get("location") ?? "", /\/login$/);
  const forged = await fetch(base + "/app/executive?organizationId=forged", { redirect: "manual", headers: { cookie: (process.env.AUTH_COOKIE_NAME ?? "maxpase_session") + "=forged" } });
  assert.equal(forged.status, 307); assert.match(forged.headers.get("location") ?? "", /\/login$/);
  const login = await fetch(base + "/login"); assert.equal(login.status, 200);
  const webhook = await fetch(base + "/api/integrations/nonexistent/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(17000) });
  assert.equal(webhook.status, 400); assert.deepEqual(await webhook.json(), { error: "Webhook rejected" });
  console.log("PASS local HTTP health/readiness, safe headers, public login, missing/forged-session redirects and oversized webhook rejection; not deployed/browser acceptance");
}
main().catch(() => { console.error("Hardening HTTP smoke failed; no production endpoint was accessed."); process.exitCode = 1; });
