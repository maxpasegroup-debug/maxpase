import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";
import { initializeGroupStructure } from "@/server/group/structure";
import { hashPassword } from "@/server/auth/password";
import { createAuthenticationService } from "@/server/auth/service";
import { createPortalService } from "@/server/portals/service";
import { requirePortalAccess } from "@/server/portals/policy";
import { portalSites, siteByHost, portalHostAllowed, validatePortalOrigin } from "@/server/portals/sites";
import { signPortalContext, verifyPortalContext } from "@/server/portals/context-proof";

const directory = mkdtempSync(join(tmpdir(), "maxpase-portals-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
const password = randomBytes(24).toString("base64url"), secret = randomBytes(32).toString("base64url");
const auth = createAuthenticationService(db), service = createPortalService(db);
const priorSecret = process.env.AUTH_SECRET;
let userId: string, startupId: string, labsId: string, membershipId: string, labsMembershipId: string, roleId: string;
const credentials = () => ({ email: "portal-member@test.invalid", password });
beforeAll(async () => {
  process.env.AUTH_SECRET = secret;
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  sql.close(); await db.$transaction(initializeGroupStructure);
  startupId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-startup-school" } })).id;
  labsId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id;
  const person = await db.person.create({ data: { displayName: "Portal test member" } });
  userId = (await db.user.create({ data: { email: credentials().email, personId: person.id, passwordHash: await hashPassword(password) } })).id;
  for (const division of [startupId, labsId]) {
    const role = await db.role.create({ data: { organizationId: division, key: "portal-test-member", name: "Portal test member", permissions: { create: await Promise.all(["organization.read", "program.read", "project.read", "task.read", "goal.read"].map(async key => ({ permission: { connect: { id: (await db.permission.upsert({ where: { key }, create: { key, name: key, scope: "GROUP" }, update: {} })).id } } }))) } } });
    const member = await db.membership.create({ data: { personId: person.id, organizationId: division, roles: { create: { roleId: role.id } } } });
    if (division === startupId) { membershipId = member.id; roleId = role.id; } else labsMembershipId = member.id;
  }
}, 30000);
beforeEach(async () => { await db.securityRateBucket.deleteMany(); });
afterAll(async () => { if (priorSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = priorSecret; await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("Separate brand domains and authenticated gateways", () => {
  it("rejects every cross-realm session pair across corporate and all four portal audiences", async () => {
    const person = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { personId: true } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "organization.read" } });
    const members: string[] = [], roles: string[] = [];
    const realms = [undefined, "skillcity", "startup", "labs", "jobs"] as const;
    const tokens: string[] = [];
    try {
      for (const slug of ["aira-skill-city", "aira-career-hub"]) {
        const org = await db.organization.findUniqueOrThrow({ where: { slug } });
        const role = await db.role.create({ data: { organizationId: org.id, key: "launch-realm-fixture", name: "Isolated realm fixture", permissions: { create: { permissionId: permission.id } } } });
        roles.push(role.id);
        const member = await db.membership.create({ data: { personId: person.personId!, organizationId: org.id, roles: { create: { roleId: role.id } } } });
        members.push(member.id);
      }
      for (const realm of realms) tokens.push((await auth.create(userId, secret, undefined, 300000, realm)).token);
      for (const [i, source] of realms.entries()) {
        for (const [j, target] of realms.entries()) {
          if (i === j) expect(await auth.validate(tokens[i], secret, target)).toMatchObject({ userId });
          else {
            expect(await auth.validate(tokens[i], secret, target)).toBeNull();
            await auth.revoke(tokens[i], secret, target);
            expect(await auth.validate(tokens[i], secret, source)).not.toBeNull();
          }
        }
      }
    } finally {
      for (const [i, realm] of realms.entries()) if (tokens[i]) await auth.revoke(tokens[i], secret, realm);
      await db.membership.deleteMany({ where: { id: { in: members } } });
      await db.role.deleteMany({ where: { id: { in: roles } } });
    }
  });
  it("keeps MAXPASE routing separate and requires company authority for Skill City", async () => {
    const group = await middleware(new NextRequest("https://maxpase.com/", { headers: { host: "maxpase.com" } }));
    expect(group.headers.get("x-middleware-rewrite")).toBeNull();
    expect(group.headers.get("x-middleware-request-x-maxpase-portal")).toBeNull();
    expect((await middleware(new NextRequest("https://maxpase.com/app/boss", { headers: { host: "maxpase.com" } }))).headers.get("location")).toBe("https://maxpase.com/login");
    expect(await auth.loginPortal(credentials(), secret, "skillcity")).toBeNull();
    const company = await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "organization.read" } });
    const person = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const role = await db.role.create({ data: { organizationId: company.id, key: "skillcity-test", name: "Company portal fixture", permissions: { create: { permissionId: permission.id } } } });
    const member = await db.membership.create({ data: { personId: person.personId!, organizationId: company.id, roles: { create: { roleId: role.id } } } });
    try {
      const session = await auth.loginPortal(credentials(), secret, "skillcity"); expect(session).not.toBeNull();
      for (const realm of [undefined, "startup", "labs", "jobs"] as const) expect(await auth.validate(session!.token, secret, realm)).toBeNull();
      expect((await requirePortalAccess(db, userId, "skillcity")).companyId).toBe(company.id);
      const programs = (await service.dashboard(userId, "skillcity", "programs")).programs;
      expect(programs).toEqual([]);
      await db.membership.update({ where: { id: member.id }, data: { status: "SUSPENDED" } });
      await expect(requirePortalAccess(db, userId, "skillcity")).rejects.toThrow();
      await auth.revoke(session!.token, secret, "skillcity");
    } finally { await db.membership.delete({ where: { id: member.id } }); await db.role.delete({ where: { id: role.id } }); }
  });
  it("maps only exact canonical/www hosts and rejects suffixes, paths and forwarded-host tricks", async () => {
    for (const site of portalSites) {
      expect(siteByHost(site.domain)?.id).toBe(site.id); expect(siteByHost("www." + site.domain)?.id).toBe(site.id);
      expect(siteByHost(site.domain.toUpperCase() + ":443")?.id).toBe(site.id);
      expect(siteByHost(site.domain + ".attacker.invalid")).toBeUndefined(); expect(siteByHost(site.domain + "/path")).toBeUndefined();
    }
    const request = new NextRequest("http://localhost:3000/", { headers: { host: "localhost:3000", "x-forwarded-host": "airalabs.online" } });
    expect((await middleware(request)).headers.get("x-middleware-rewrite")).toBeNull();
    const spoofed = await middleware(new NextRequest("http://localhost:3000/sites/startup/login", { headers: { host: "localhost:3000", "x-forwarded-host": "airastartupskool.com", "x-maxpase-portal": "startup" } }));
    expect(spoofed.headers.get("x-middleware-request-x-forwarded-host")).toBe("localhost:3000");
    expect(spoofed.headers.get("x-middleware-request-x-maxpase-portal")).toBeNull();
  });
  it("rewrites domain landing/login/gateway paths without dropping query and blocks corporate routes", async () => {
    for (const site of portalSites) {
      for (const path of ["/", "/login", "/gateway?view=tasks"]) {
        const r = await middleware(new NextRequest("https://" + site.domain + path, { headers: { host: site.domain, cookie: site.cookie + "=candidate" } }));
        expect(r.headers.get("x-middleware-rewrite")).toContain(`/sites/${site.id}`);
        expect(r.headers.get("x-middleware-request-x-maxpase-portal")).toBe(site.id);
        expect(r.headers.get("x-middleware-request-x-forwarded-host")).toBe(site.domain);
        if (path.includes("?")) expect(r.headers.get("x-middleware-rewrite")).toContain("?view=tasks");
      }
      expect((await middleware(new NextRequest("https://" + site.domain + "/app/boss", { headers: { host: site.domain } }))).status).toBe(404);
      expect((await middleware(new NextRequest("https://" + site.domain + "/sites/labs", { headers: { host: site.domain } }))).status).toBe(404);
      expect((await middleware(new NextRequest("https://" + site.domain + "/gateway", { headers: { host: site.domain } }))).headers.get("location")).toBe("https://" + site.domain + "/login");
    }
  });
  it("preserves authenticated internal forwarding context but rejects forged, tampered and expired envelopes", async () => {
    const site = portalSites[0], proof = await signPortalContext(site, site.domain, secret);
    expect((await verifyPortalContext(proof, secret))?.site.id).toBe(site.id);
    expect(await verifyPortalContext(proof, randomBytes(32).toString("hex"))).toBeNull();
    expect(await verifyPortalContext(proof, secret, Date.now() + 121000)).toBeNull();
    const parts = proof.split("."); const modified = btoa(JSON.stringify({ id: "labs", host: "airalabs.online", time: Date.now() })) + "." + parts[1];
    expect(await verifyPortalContext(modified, secret)).toBeNull();
    const forwarded = await middleware(new NextRequest("http://localhost:3000/sites/startup/login", { headers: { host: "localhost:3000", "x-maxpase-portal-context": proof } }));
    expect(forwarded.headers.get("x-middleware-request-x-maxpase-portal-context")).toBe(proof);
    expect(forwarded.headers.get("x-middleware-request-x-forwarded-host")).toBe(site.domain);
    const invalid = await middleware(new NextRequest("http://localhost:3000/sites/startup/login", { headers: { host: "localhost:3000", "x-maxpase-portal-context": modified } }));
    expect(invalid.headers.get("x-middleware-request-x-maxpase-portal-context")).toBeNull();
  });
  it("enforces HTTPS and exact same-site mutation origin; local previews exist only outside production", () => {
    for (const site of portalSites) {
      expect(() => validatePortalOrigin(site, site.domain, "https://" + site.domain, false)).not.toThrow();
      expect(() => validatePortalOrigin(site, site.domain, "http://" + site.domain, false)).toThrow();
      expect(() => validatePortalOrigin(site, site.domain, "https://attacker.invalid", false)).toThrow();
      expect(() => validatePortalOrigin(site, site.domain, null, false)).toThrow();
      expect(portalHostAllowed(site, "localhost:3000", false)).toBe(false);
      expect(() => validatePortalOrigin(site, "localhost:3000", "http://localhost:3000", true)).not.toThrow();
      expect(portalHostAllowed(site, portalSites.find(s => s.id !== site.id)!.domain, false)).toBe(false);
    }
  });
  it("verifies credentials and binds sessions to one brand, never accepting group or sibling tokens", async () => {
    const login = await auth.loginPortal(credentials(), secret, "startup"); expect(!!login).toBe(true);
    expect(await auth.validate(login!.token, secret, "startup")).toMatchObject({ userId });
    expect(await auth.validate(login!.token, secret, "labs")).toBeNull(); expect(await auth.validate(login!.token, secret)).toBeNull();
    const group = await auth.login(credentials(), secret); expect(await auth.validate(group!.token, secret, "startup")).toBeNull();
    expect(await auth.loginPortal({ ...credentials(), password: randomBytes(20).toString("hex") }, secret, "startup")).toBeNull();
    expect((await db.auditEvent.findFirst({ where: { actorUserId: userId, action: "auth.login", organizationId: startupId } }))?.result).toBe("SUCCESS");
  });
  it("requires current membership/permission and denies a valid password on an unauthorized gateway", async () => {
    const count = await db.session.count(); expect(await auth.loginPortal(credentials(), secret, "jobs")).toBeNull(); expect(await db.session.count()).toBe(count);
    const login = await auth.loginPortal(credentials(), secret, "startup");
    await db.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } });
    try { expect(await auth.validate(login!.token, secret, "startup")).not.toBeNull(); await expect(requirePortalAccess(db, userId, "startup")).rejects.toThrow(); await expect(service.dashboard(userId, "startup")).rejects.toThrow(); }
    finally { await db.membership.update({ where: { id: membershipId }, data: { status: "ACTIVE" } }); }
  });
  it("keeps concurrent brand sessions separate and revokes only the matching brand session", async () => {
    const startup = await auth.loginPortal(credentials(), secret, "startup"), labs = await auth.loginPortal(credentials(), secret, "labs");
    await auth.revoke(startup!.token, secret, "labs"); expect(await auth.validate(startup!.token, secret, "startup")).not.toBeNull();
    await auth.revoke(startup!.token, secret, "startup"); expect(await auth.validate(startup!.token, secret, "startup")).toBeNull(); expect(await auth.validate(labs!.token, secret, "labs")).not.toBeNull();
  });
  it("returns only authorized division work/programs, never sibling content or sensitive raw records", async () => {
    await db.task.create({ data: { organizationId: startupId, title: "Startup authorized work", description: "Internal metadata not displayed" } });
    await db.task.create({ data: { organizationId: labsId, title: "Labs private work" } });
    const companyId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
    await db.program.create({ data: { companyOrganizationId: companyId, organizationId: startupId, name: "Startup authorized program", slug: "portal-startup-program" } });
    await db.program.create({ data: { companyOrganizationId: companyId, organizationId: labsId, name: "Labs private program", slug: "portal-labs-program" } });
    const data = await service.dashboard(userId, "startup");
    expect(data.records.map(r => r.title)).toEqual(["Startup authorized work"]); expect(data.programs.map(p => p.name)).toEqual(["Startup authorized program"]);
    expect(JSON.stringify(data)).not.toContain("Labs private"); expect(JSON.stringify(data)).not.toContain("Internal metadata");
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "task.read" } });
    await db.rolePermission.delete({ where: { roleId_permissionId: { roleId, permissionId: permission.id } } });
    try { expect((await service.dashboard(userId, "startup")).records).toEqual([]); }
    finally { await db.rolePermission.create({ data: { roleId, permissionId: permission.id } }); }
  });
  it("denies inactive company/division lifecycle and compromised canonical company relationships", async () => {
    await db.organization.update({ where: { id: labsId }, data: { status: "SUSPENDED" } });
    try { await expect(requirePortalAccess(db, userId, "labs")).rejects.toThrow(); }
    finally { await db.organization.update({ where: { id: labsId }, data: { status: "ACTIVE" } }); }
    const companyId = (await db.organization.findUniqueOrThrow({ where: { id: labsId } })).parentId;
    const other = await db.organization.create({ data: { name: "Foreign test company", slug: "portal-foreign", type: "COMPANY" } });
    await db.organization.update({ where: { id: labsId }, data: { parentId: other.id } });
    try { await expect(requirePortalAccess(db, userId, "labs")).rejects.toThrow(); }
    finally { await db.organization.update({ where: { id: labsId }, data: { parentId: companyId } }); }
    expect((await db.membership.findUniqueOrThrow({ where: { id: labsMembershipId } })).status).toBe("ACTIVE");
  });
  it("rolls back brand session issuance if mandatory audit insertion fails", async () => {
    const sql = new DatabaseSync(file); sql.exec("CREATE TRIGGER PortalAuditFailure BEFORE INSERT ON AuditEvent WHEN NEW.action = 'auth.login' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    const count = await db.session.count();
    try { await expect(auth.loginPortal(credentials(), secret, "startup")).rejects.toThrow(); expect(await db.session.count()).toBe(count); }
    finally { sql.exec("DROP TRIGGER PortalAuditFailure"); sql.close(); }
  });
});
