import assert from "node:assert/strict";

const base = "https://maxpase.com";
let cookie: string | undefined, logoutForm: FormData | undefined, stage = "readiness";
const decode = (s: string) => s.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
function actionForm(html: string) {
  const form = new FormData();
  for (const input of html.matchAll(/<input\b[^>]*>/g)) {
    const name = input[0].match(/name="([^"]+)"/)?.[1];
    if (name?.startsWith("$ACTION")) form.append(decode(name), decode(input[0].match(/value="([^"]*)"/)?.[1] ?? ""));
  }
  assert.ok([...form.keys()].some(k => k.startsWith("$ACTION")));
  return form;
}
function findLogout(html: string) {
  const form = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].find(m => /Sign out/.test(m[0]));
  return form ? actionForm(form[0]) : undefined;
}
const request = (path: string, init: RequestInit = {}) => fetch(base + path, { ...init, redirect: "manual", signal: AbortSignal.timeout(30000) });
async function main() {
  assert.match(process.env.BOSS_PIN ?? "", /^[0-9]{6}$/);
  assert.equal((await request("/api/ready")).status, 200);
  stage = "PIN form";
  const page = await request("/login"); assert.equal(page.status, 200);
  const html = await page.text(); assert.match(html, /name="pin"/);
  const form = actionForm(html); form.set("email", "boss@maxpase.com"); form.set("pin", process.env.BOSS_PIN!);
  stage = "authentication";
  const signed = await request("/login", { method: "POST", body: form, headers: { origin: base } });
  assert.equal(signed.status, 303); assert.equal(new URL(signed.headers.get("location")!, base).pathname, "/app/boss");
  const session = signed.headers.getSetCookie().find(c => c.startsWith("maxpase_session=")); assert.ok(session);
  assert.match(session, /;\s*Secure/i); assert.match(session, /;\s*HttpOnly/i); assert.doesNotMatch(session, /;\s*Domain=/i);
  cookie = session.split(";")[0];
  for (const view of ["overview", "companies", "brands", "people", "projects", "goals", "operations", "decisions", "attention", "communications", "graph", "audit", "system", "briefing", "risks", "opportunities", "changes"]) {
    stage = "command center " + view;
    const response = await request("/app/boss?view=" + view, { headers: { cookie } }); assert.equal(response.status, 200);
    const body = await response.text(); logoutForm ??= findLogout(body);
    assert.match(body, /Master Command Center/); assert.doesNotMatch(body, /Boss Panel unavailable/);
  }
  stage = "logout"; assert.ok(logoutForm);
  const loggedOut = await request("/app/boss", { method: "POST", body: logoutForm, headers: { cookie, origin: base } }); assert.equal(loggedOut.status, 303);
  assert.equal((await request("/app/boss", { headers: { cookie } })).status, 307);
  cookie = undefined;
  console.log("PASS production readiness, real Boss PIN sign-in, secure host-only cookie, all 17 command-center views and logout/session revocation. No secrets displayed; not browser/device acceptance.");
}
main().catch(() => { console.error(`Production Boss smoke failed at ${stage}; no credential, cookie or response body displayed.`); process.exitCode = 1; }).finally(async () => {
  delete process.env.BOSS_PIN;
  if (cookie) {
    try {
      logoutForm ??= findLogout(await (await request("/app/boss", { headers: { cookie } })).text());
      assert.ok(logoutForm);
      const response = await request("/app/boss", { method: "POST", body: logoutForm, headers: { cookie, origin: base } }); assert.equal(response.status, 303);
    } catch { console.error("Production smoke session cleanup needs operator review; no secret displayed."); process.exitCode = 1; }
  }
});
