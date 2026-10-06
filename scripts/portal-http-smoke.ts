import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { request } from "node:http";
import { PrismaClient } from "@prisma/client";
import { initializeGroupStructure } from "../src/server/group/structure";
import { hashPassword } from "../src/server/auth/password";
import { portalSites } from "../src/server/portals/sites";

const temporary = mkdtempSync(join(tmpdir(), "maxpase-portal-http-")), file = join(temporary, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
const port = 3029, base = `http://127.0.0.1:${port}`, password = randomBytes(24).toString("base64url");
let server: ChildProcess | undefined, stage = "fixture";
async function http(path: string, host: string, options: { method?: string; body?: Buffer; headers?: Record<string, string> } = {}) {
  return new Promise<{ status: number; headers: import("node:http").IncomingHttpHeaders; body: string }>((ok, fail) => {
    const req = request(base + path, { method: options.method ?? "GET", headers: { host, ...options.headers } }, res => {
      let body = ""; res.on("data", data => body += data); res.on("end", () => ok({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on("error", fail); req.setTimeout(60000, () => req.destroy(new Error("Local request timed out"))); req.end(options.body);
  });
}
const decode = (s: string) => s.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
async function main() {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  sql.close(); await db.$transaction(initializeGroupStructure);
  const person = await db.person.create({ data: { displayName: "Disposable HTTP fixture" } });
  const email = "http-" + randomBytes(8).toString("hex") + "@test.invalid";
  await db.user.create({ data: { email, personId: person.id, passwordHash: await hashPassword(password) } });
  for (const site of portalSites) {
    const division = await db.organization.findUniqueOrThrow({ where: { slug: site.divisionSlug } });
    const permission = await db.permission.upsert({ where: { key: "organization.read" }, update: {}, create: { key: "organization.read", name: "Read organization", scope: "GROUP" } });
    const role = await db.role.create({ data: { organizationId: division.id, key: "http-fixture", name: "Disposable HTTP fixture", permissions: { create: { permissionId: permission.id } } } });
    await db.membership.create({ data: { personId: person.id, organizationId: division.id, roles: { create: { roleId: role.id } } } });
  }
  try { await http("/api/health", "127.0.0.1:" + port); throw new Error("Smoke port already occupied"); } catch (e) { if (!(e instanceof Error) || !("code" in e) || e.code !== "ECONNREFUSED") throw e; }
  stage = "server";
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], { windowsHide: true, stdio: "ignore", env: { ...process.env, NODE_ENV: "development", DATABASE_URL: "file:" + file.replaceAll("\\", "/"), AUTH_SECRET: randomBytes(32).toString("base64url"), AUTH_COOKIE_SECURE: "false", APP_ORIGIN: base, MAXPASE_PORTAL_SMOKE: "true" } });
  for (let attempt = 0; ; attempt++) { try { if ((await http("/api/health", "127.0.0.1:" + port)).status === 200) break; } catch { /* Bounded server startup retry. */ } if (attempt >= 60) throw new Error("Local startup unavailable"); await new Promise(r => setTimeout(r, 1000)); }
  for (const site of portalSites) {
    stage = site.id + " landing";
    const landing = await http("/", site.domain); assert.equal(landing.status, 200); assert.ok(landing.body.includes(`<title>${site.name}</title>`));
    assert.equal((await http("/app/boss", site.domain)).status, 404);
    const anon = await http("/gateway", site.domain); assert.equal(anon.status, 307); assert.equal(anon.headers.location, `https://${site.domain}/login`);
    const login = await http("/login", site.domain); assert.equal(login.status, 200); assert.ok(login.body.includes('name="password"'));
    const form = new FormData();
    for (const input of login.body.matchAll(/<input\b[^>]*>/g)) {
      const name = input[0].match(/name="([^"]+)"/)?.[1];
      if (name?.startsWith("$ACTION")) form.append(decode(name), decode(input[0].match(/value="([^"]*)"/)?.[1] ?? ""));
    }
    form.set("site", site.id); form.set("email", email); form.set("password", password);
    const encoded = new Request(base + "/login", { method: "POST", body: form });
    stage = site.id + " login";
    const response = await http("/login", site.domain, { method: "POST", body: Buffer.from(await encoded.arrayBuffer()), headers: { origin: "https://" + site.domain, "content-type": encoded.headers.get("content-type")! } });
    stage = `${site.id} login status ${response.status}, redirect ${response.headers.location ?? "none"}, denied ${response.body.includes("Invalid credentials or gateway access unavailable.")}`;
    assert.equal(response.status, 303); assert.equal(response.headers.location, "/gateway");
    const cookie = response.headers["set-cookie"]?.find(v => v.startsWith(site.cookie + "="))?.split(";")[0]; assert.ok(cookie);
    assert.ok(response.headers["set-cookie"]!.every(v => !/;\s*Domain=/i.test(v)));
    stage = site.id + " gateway";
    for (const view of ["overview", "programs", "projects", "tasks", "goals"]) { const gateway = await http("/gateway?view=" + view, site.domain, { headers: { cookie } }); assert.equal(gateway.status, 200); assert.ok(gateway.body.includes("Your gateway") || gateway.body.includes('aria-label="Gateway views"')); }
    const other = portalSites.find(s => s.id !== site.id)!;
    const replay = await http("/gateway", other.domain, { headers: { cookie: other.cookie + "=" + cookie.split("=").slice(1).join("=") } }); assert.equal(replay.status, 307);
    console.log(`PASS local Host-header routing, real form authentication, five gateway views and cross-brand replay denial: ${site.domain}`);
  }
  stage = "maxpase routing";
  const groupLanding = await http("/", "maxpase.com"); assert.equal(groupLanding.status, 200); assert.ok(groupLanding.body.includes("MAXPASE"));
  const groupLogin = await http("/login", "maxpase.com"); assert.equal(groupLogin.status, 200); assert.ok(groupLogin.body.includes('name="pin"'));
  const groupAnonymous = await http("/app/boss", "maxpase.com"); assert.equal(groupAnonymous.status, 307); assert.equal(new URL(groupAnonymous.headers.location!).pathname, "/login");
  console.log("PASS local MAXPASE Host-header landing, distinct PIN form and protected command-center redirect; no Boss credential provisioned in fixture.");
  console.log("PASS isolated four-AIRA-domain HTTP smoke; disposable database only, no production requests or browser/device acceptance.");
}
main().catch(() => { console.error(`Portal HTTP smoke failed at ${stage}; no credential or response body displayed.`); process.exitCode = 1; }).finally(async () => {
  if (server?.pid) { try { if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 10000 }); else server.kill("SIGTERM"); } catch { /* Process may already have exited; verify the listener separately if cleanup is blocked. */ } }
  await db.$disconnect(); rmSync(temporary, { recursive: true, force: true });
  if (server) { const output = resolve(".next-portal-smoke"); assert.equal(output, join(process.cwd(), ".next-portal-smoke")); rmSync(output, { recursive: true, force: true }); }
});
